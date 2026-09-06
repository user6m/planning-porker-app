import { env, runInDurableObject } from "cloudflare:test";
import { describe, expect, it } from "vite-plus/test";
import type { PokerRoom } from "../src/worker/durable-objects/poker-room";

function getStub(name: string) {
	const id = env.POKER_ROOM.idFromName(name);
	return env.POKER_ROOM.get(id);
}

async function initRoom(name: string, roomName: string) {
	const stub = getStub(name);
	await stub.fetch("https://poker-room.internal/init", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ roomName }),
	});
	return stub;
}

async function connect(
	stub: DurableObjectStub<PokerRoom>,
	userId: string,
	name: string,
) {
	const url = `https://poker-room.internal/websocket?userId=${userId}&name=${encodeURIComponent(name)}`;
	const response = await stub.fetch(url, { headers: { Upgrade: "websocket" } });
	const ws = response.webSocket;
	if (!ws) throw new Error("expected a websocket in the response");
	ws.accept();
	return ws;
}

function nextMessage(ws: WebSocket): Promise<unknown> {
	return new Promise((resolve) => {
		ws.addEventListener(
			"message",
			(event: MessageEvent) => {
				resolve(JSON.parse(event.data as string));
			},
			{ once: true },
		);
	});
}

describe("PokerRoom", () => {
	it("initializes the room name only once", async () => {
		const stub = await initRoom("room-init", "スプリント1");
		const res = await stub.fetch("https://poker-room.internal/init", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ roomName: "変更後" }),
		});
		const body = await res.json<{ roomName: string }>();
		expect(body.roomName).toBe("スプリント1");
	});

	it("broadcasts state when a participant joins and votes", async () => {
		const stub = await initRoom("room-vote", "見積もり会");
		const alice = await connect(stub, "alice", "Alice");
		await nextMessage(alice); // 参加直後の state

		const votePromise = nextMessage(alice);
		alice.send(JSON.stringify({ type: "vote", value: "5" }));
		const message = (await votePromise) as {
			type: string;
			state: {
				participants: Array<{ hasVoted: boolean; vote: string | null }>;
			};
		};

		expect(message.type).toBe("state");
		expect(message.state.participants).toHaveLength(1);
		expect(message.state.participants[0]?.hasVoted).toBe(true);
		// 公開前は値そのものは見えない
		expect(message.state.participants[0]?.vote).toBeNull();
	});

	it("reveals votes only after a reveal message, and clears them on reset", async () => {
		const stub = await initRoom("room-reveal", "見積もり会2");
		const alice = await connect(stub, "alice", "Alice");
		await nextMessage(alice);

		let pending = nextMessage(alice);
		alice.send(JSON.stringify({ type: "vote", value: "8" }));
		await pending;

		pending = nextMessage(alice);
		alice.send(JSON.stringify({ type: "reveal" }));
		const revealed = (await pending) as {
			state: {
				revealed: boolean;
				participants: Array<{ vote: string | null; hasVoted: boolean }>;
			};
		};
		expect(revealed.state.revealed).toBe(true);
		expect(revealed.state.participants[0]?.vote).toBe("8");

		pending = nextMessage(alice);
		alice.send(JSON.stringify({ type: "reset" }));
		const reset = (await pending) as {
			state: {
				revealed: boolean;
				participants: Array<{ vote: string | null; hasVoted: boolean }>;
			};
		};
		expect(reset.state.revealed).toBe(false);
		expect(reset.state.participants[0]?.hasVoted).toBe(false);
	});

	it("rejects invalid card values", async () => {
		const stub = await initRoom("room-invalid", "見積もり会3");
		const alice = await connect(stub, "alice", "Alice");
		await nextMessage(alice);

		const pending = nextMessage(alice);
		alice.send(JSON.stringify({ type: "vote", value: "999" }));
		const message = (await pending) as { type: string; message: string };
		expect(message.type).toBe("error");
	});

	it("removes a participant once their last socket disconnects", async () => {
		const id = env.POKER_ROOM.idFromName("room-disconnect");
		const stub = env.POKER_ROOM.get(id);
		const alice = await connect(stub, "alice", "Alice");
		await nextMessage(alice);

		await runInDurableObject(stub, async (instance: PokerRoom) => {
			// biome-ignore lint/suspicious/noExplicitAny: private フィールドをテストのために参照する
			const room = (instance as any).room;
			expect(Object.keys(room.participants)).toEqual(["alice"]);
		});

		alice.close();
		// close イベントの伝播を待つ
		await new Promise((resolve) => setTimeout(resolve, 50));

		await runInDurableObject(stub, async (instance: PokerRoom) => {
			// biome-ignore lint/suspicious/noExplicitAny: private フィールドをテストのために参照する
			const room = (instance as any).room;
			expect(Object.keys(room.participants)).toEqual([]);
		});
	});
});
