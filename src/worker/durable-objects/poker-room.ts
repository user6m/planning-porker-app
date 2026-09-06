import { DurableObject } from "cloudflare:workers";
import type { Bindings } from "../bindings";
import {
	CARD_DECK,
	type ClientMessage,
	type Participant,
	type RoomState,
	type ServerMessage,
} from "../../shared/types";

interface StoredRoom {
	roomName: string;
	revealed: boolean;
	participants: Record<string, Participant>;
}

/**
 * 新しい部屋の初期状態。
 * モジュール共通の定数オブジェクトを使い回すと、同じ isolate 上に複数の部屋(DOインスタンス)が
 * 同居したときに参加者や部屋名が部屋間で共有されてしまうため、必ず新しいオブジェクトを作る。
 */
function createEmptyRoom(): StoredRoom {
	return {
		roomName: "",
		revealed: false,
		participants: {},
	};
}

/**
 * 1つのプランニングポーカーの「セッション（部屋）」を表す Durable Object。
 *
 * - 部屋ごとに1インスタンスが作られ、参加者全員のWebSocket接続をこのインスタンスが集約する。
 * - 状態（参加者・投票）はメモリではなく `ctx.storage` に保存するため、
 *   アイドル時にDOがハイバネートされても、再開時に状態を失わない。
 * - WebSocket Hibernation API（acceptWebSocket / webSocketMessage / webSocketClose）を使うことで、
 *   誰も通信していない間はDO自体を眠らせ、課金・リソースを節約できる。
 *
 * 詳しい解説は docs/SESSION.md を参照。
 */
export class PokerRoom extends DurableObject<Bindings> {
	private room: StoredRoom = createEmptyRoom();
	private readonly ready: Promise<void>;

	constructor(ctx: DurableObjectState, env: Bindings) {
		super(ctx, env);
		// ハイバネート復帰時（コンストラクタが再実行されるとき）に永続化済みの状態を読み戻す
		this.ready = ctx.blockConcurrencyWhile(async () => {
			const stored = await ctx.storage.get<StoredRoom>("room");
			if (stored) this.room = stored;
		});
	}

	async fetch(request: Request): Promise<Response> {
		await this.ready;
		const url = new URL(request.url);

		if (request.method === "POST" && url.pathname.endsWith("/init")) {
			const body = await request
				.json<{ roomName?: string }>()
				.catch((): { roomName?: string } => ({}));
			if (!this.room.roomName && body.roomName) {
				this.room.roomName = body.roomName.slice(0, 100);
				await this.persist();
			}
			return Response.json({ roomName: this.room.roomName });
		}

		if (request.headers.get("Upgrade") !== "websocket") {
			return new Response("Expected a WebSocket upgrade request", {
				status: 426,
			});
		}

		const userId = url.searchParams.get("userId");
		const name = url.searchParams.get("name");
		if (!userId || !name) {
			return new Response("Missing userId/name query params", { status: 400 });
		}

		const { 0: client, 1: server } = new WebSocketPair();

		// tag に userId を紐付けておくと、後から `ctx.getTags(ws)` / `ctx.getWebSockets(userId)` で
		// 「このソケットは誰のものか」「この人は他にも接続を持っているか」を復元できる。
		this.ctx.acceptWebSocket(server, [userId]);

		this.room.participants[userId] ??= {
			id: userId,
			name,
			vote: null,
			isSpectator: false,
		};
		const participant = this.room.participants[userId];
		if (participant) participant.name = name;
		await this.persist();
		this.broadcastState();

		return new Response(null, { status: 101, webSocket: client });
	}

	async webSocketMessage(
		ws: WebSocket,
		raw: string | ArrayBuffer,
	): Promise<void> {
		await this.ready;
		const userId = this.ctx.getTags(ws)[0];
		const participant = userId ? this.room.participants[userId] : undefined;
		if (!participant) return;

		let message: ClientMessage;
		try {
			const text =
				typeof raw === "string" ? raw : new TextDecoder().decode(raw);
			message = JSON.parse(text);
		} catch {
			this.send(ws, { type: "error", message: "メッセージの形式が不正です" });
			return;
		}

		switch (message.type) {
			case "join": {
				participant.name = message.name.trim().slice(0, 40) || participant.name;
				participant.isSpectator = Boolean(message.isSpectator);
				break;
			}
			case "vote": {
				if (this.room.revealed) {
					this.send(ws, {
						type: "error",
						message: "公開後は投票し直せません。リセットしてください",
					});
					return;
				}
				if (!(CARD_DECK as readonly string[]).includes(message.value)) {
					this.send(ws, { type: "error", message: "無効なカードです" });
					return;
				}
				participant.vote = message.value;
				break;
			}
			case "reveal": {
				this.room.revealed = true;
				break;
			}
			case "reset": {
				this.room.revealed = false;
				for (const p of Object.values(this.room.participants)) p.vote = null;
				break;
			}
			case "rename": {
				participant.name = message.name.trim().slice(0, 40) || participant.name;
				break;
			}
			default:
				return;
		}

		await this.persist();
		this.broadcastState();
	}

	async webSocketClose(ws: WebSocket): Promise<void> {
		await this.handleDisconnect(ws);
	}

	async webSocketError(ws: WebSocket): Promise<void> {
		await this.handleDisconnect(ws);
	}

	private async handleDisconnect(ws: WebSocket): Promise<void> {
		await this.ready;
		const userId = this.ctx.getTags(ws)[0];
		if (!userId) return;

		// 同じ人が別タブ/別デバイスでまだ繋がっていれば、参加者としては残す
		const hasOtherConnection = this.ctx
			.getWebSockets(userId)
			.some((socket) => socket !== ws);
		if (!hasOtherConnection) {
			delete this.room.participants[userId];
			await this.persist();
		}
		this.broadcastState();
	}

	private async persist(): Promise<void> {
		await this.ctx.storage.put("room", this.room);
	}

	private toPublicState(): RoomState {
		return {
			roomId: this.ctx.id.toString(),
			roomName: this.room.roomName,
			revealed: this.room.revealed,
			participants: Object.values(this.room.participants).map((p) => ({
				id: p.id,
				name: p.name,
				isSpectator: p.isSpectator,
				hasVoted: p.vote !== null,
				vote: this.room.revealed ? p.vote : null,
			})),
		};
	}

	private send(ws: WebSocket, message: ServerMessage): void {
		ws.send(JSON.stringify(message));
	}

	private broadcastState(): void {
		const message: ServerMessage = {
			type: "state",
			state: this.toPublicState(),
		};
		const payload = JSON.stringify(message);
		for (const ws of this.ctx.getWebSockets()) {
			ws.send(payload);
		}
	}
}
