import { env } from "cloudflare:test";
import { describe, expect, it } from "vite-plus/test";
import app from "../src/worker/index";
import type {
	CreateRoomResponse,
	RoomState,
	UserSession,
} from "../src/shared/types";

const JSON_HEADERS = { "content-type": "application/json" };

/** 直近の Set-Cookie から `pp_session=...` の部分だけを取り出す */
function sessionCookie(res: Response): string {
	const cookie = res.headers.getSetCookie().at(-1)?.split(";")[0];
	if (!cookie) throw new Error("expected a Set-Cookie header");
	return cookie;
}

async function createRoom(roomName: string, hostName: string) {
	const res = await app.request(
		"/api/rooms",
		{
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ roomName, hostName }),
		},
		env,
	);
	return res;
}

function nextMessage(ws: WebSocket): Promise<unknown> {
	return new Promise((resolve) => {
		ws.addEventListener(
			"message",
			(event: MessageEvent) => resolve(JSON.parse(event.data as string)),
			{ once: true },
		);
	});
}

describe("GET /api/me", () => {
	it("issues a guest session and returns it as JSON", async () => {
		const res = await app.request("/api/me", {}, env);
		expect(res.status).toBe(200);
		expect(res.headers.get("set-cookie")).toMatch(/pp_session=/);

		const body = await res.json<UserSession>();
		expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
		expect(body.name).toMatch(/^ゲスト\d{4}$/);
	});
});

describe("PATCH /api/me", () => {
	it("renames the current session and persists it in the cookie", async () => {
		const first = await app.request("/api/me", {}, env);
		const cookie = sessionCookie(first);
		const { userId } = await first.json<UserSession>();

		const renamed = await app.request(
			"/api/me",
			{
				method: "PATCH",
				headers: { ...JSON_HEADERS, cookie },
				body: JSON.stringify({ name: "  Alice  " }),
			},
			env,
		);
		expect(renamed.status).toBe(200);
		expect(await renamed.json<UserSession>()).toEqual({
			userId,
			name: "Alice",
		});

		const check = await app.request(
			"/api/me",
			{ headers: { cookie: sessionCookie(renamed) } },
			env,
		);
		expect((await check.json<UserSession>()).name).toBe("Alice");
	});

	it("rejects an empty or malformed name", async () => {
		const empty = await app.request(
			"/api/me",
			{
				method: "PATCH",
				headers: JSON_HEADERS,
				body: JSON.stringify({ name: "   " }),
			},
			env,
		);
		expect(empty.status).toBe(400);

		const malformed = await app.request(
			"/api/me",
			{ method: "PATCH", headers: JSON_HEADERS, body: "not json" },
			env,
		);
		expect(malformed.status).toBe(400);
		expect(await malformed.json<{ error: string }>()).toEqual({
			error: "表示名を入力してください",
		});
	});
});

describe("POST /api/rooms", () => {
	it("creates a room, initializes its name and remembers the host name", async () => {
		const res = await createRoom("スプリント12", "Alice");
		expect(res.status).toBe(201);

		const { roomId } = await res.json<CreateRoomResponse>();
		expect(roomId).toMatch(/^[A-HJ-NP-Z2-9]{8}$/);

		// 作成者の表示名がセッションに保存されている
		const me = await app.request(
			"/api/me",
			{ headers: { cookie: sessionCookie(res) } },
			env,
		);
		expect((await me.json<UserSession>()).name).toBe("Alice");

		// Durable Object 側に部屋の名前が設定されている
		const stub = env.POKER_ROOM.get(env.POKER_ROOM.idFromName(roomId));
		const init = await stub.fetch("https://poker-room.internal/init", {
			method: "POST",
			headers: JSON_HEADERS,
			body: JSON.stringify({ roomName: "上書きされない" }),
		});
		expect(await init.json<{ roomName: string }>()).toEqual({
			roomName: "スプリント12",
		});
	});

	it("returns 400 when the room name or host name is missing", async () => {
		const res = await createRoom("", "Alice");
		expect(res.status).toBe(400);
		expect(await res.json<{ error: string }>()).toEqual({
			error: "部屋の名前と表示名を入力してください",
		});
	});
});

describe("GET /api/rooms/:id/ws", () => {
	it("requires a WebSocket upgrade", async () => {
		const res = await app.request("/api/rooms/ABCD2345/ws", {}, env);
		expect(res.status).toBe(426);
	});

	it("connects to the room's Durable Object with the session identity", async () => {
		const created = await createRoom("見積もり会", "Alice");
		const cookie = sessionCookie(created);
		const { roomId } = await created.json<CreateRoomResponse>();

		const res = await app.request(
			// 小文字で開かれても同じ部屋に繋がる
			`/api/rooms/${roomId.toLowerCase()}/ws`,
			{ headers: { Upgrade: "websocket", cookie } },
			env,
		);
		expect(res.status).toBe(101);
		const ws = res.webSocket;
		if (!ws) throw new Error("expected a websocket in the response");
		ws.accept();

		const message = (await nextMessage(ws)) as {
			type: string;
			state: RoomState;
		};
		expect(message.type).toBe("state");
		expect(message.state.roomName).toBe("見積もり会");
		expect(message.state.participants.map((p) => p.name)).toEqual(["Alice"]);
		ws.close();
	});
});

describe("unknown API routes", () => {
	it("respond with a JSON 404", async () => {
		const res = await app.request("/api/nope", {}, env);
		expect(res.status).toBe(404);
		expect(await res.json<{ error: string }>()).toEqual({ error: "Not Found" });
	});
});
