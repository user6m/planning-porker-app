import { type Context, Hono } from "hono";
import { generateRoomId, normalizeRoomId } from "../shared/room-id";
import {
	type CreateRoomRequest,
	type CreateRoomResponse,
	MAX_NAME_LENGTH,
	MAX_ROOM_NAME_LENGTH,
	type UpdateSessionRequest,
} from "../shared/types";
import type { Bindings } from "./bindings";
import { getOrCreateSession, persistSession } from "./session";

export { PokerRoom } from "./durable-objects/poker-room";

type AppContext = Context<{ Bindings: Bindings }>;

/**
 * JSON ボディを読み取る。壊れている/空の場合は空オブジェクトを返し、
 * 呼び出し側のバリデーションで 400 にする。
 */
async function readJsonBody<T extends object>(
	c: AppContext,
): Promise<Partial<T>> {
	try {
		const body: unknown = await c.req.json();
		return body !== null && typeof body === "object"
			? (body as Partial<T>)
			: {};
	} catch {
		return {};
	}
}

function sanitizeText(value: unknown, maxLength: number): string {
	return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

/**
 * Worker 側の Hono アプリ。
 *
 * 画面(HTML/JS/CSS)は Vite でビルドした React SPA を Workers Static Assets として配信するため、
 * Worker が処理するのは `/api/*` 配下の JSON API と WebSocket だけ。
 * どのパスが Worker に届くかは wrangler.jsonc の `assets.run_worker_first` で決まる。
 */
const app = new Hono<{ Bindings: Bindings }>().basePath("/api");

/** このブラウザのセッション（userId と表示名）を返す。無ければ新規発行して Cookie にセットする */
app.get("/me", async (c) => {
	const session = await getOrCreateSession(c);
	return c.json(session);
});

/** 表示名を変更して Cookie に書き戻す */
app.patch("/me", async (c) => {
	const body = await readJsonBody<UpdateSessionRequest>(c);
	const name = sanitizeText(body.name, MAX_NAME_LENGTH);
	if (!name) {
		return c.json({ error: "表示名を入力してください" }, 400);
	}
	const session = await getOrCreateSession(c);
	const updated = { ...session, name };
	await persistSession(c, updated);
	return c.json(updated);
});

/** 部屋を作成する。作成者の表示名はセッションにも保存する */
app.post("/rooms", async (c) => {
	const body = await readJsonBody<CreateRoomRequest>(c);
	const roomName = sanitizeText(body.roomName, MAX_ROOM_NAME_LENGTH);
	const hostName = sanitizeText(body.hostName, MAX_NAME_LENGTH);
	if (!roomName || !hostName) {
		return c.json({ error: "部屋の名前と表示名を入力してください" }, 400);
	}

	const session = await getOrCreateSession(c);
	if (hostName !== session.name) {
		await persistSession(c, { ...session, name: hostName });
	}

	const roomId = generateRoomId();
	const stub = c.env.POKER_ROOM.get(c.env.POKER_ROOM.idFromName(roomId));
	await stub.fetch("https://poker-room.internal/init", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ roomName }),
	});

	return c.json({ roomId } satisfies CreateRoomResponse, 201);
});

/** 部屋の Durable Object への WebSocket 接続。セッションの userId/表示名を引き継いで転送する */
app.get("/rooms/:id/ws", async (c) => {
	if (c.req.header("Upgrade") !== "websocket") {
		return c.text("Expected a WebSocket upgrade request", 426);
	}

	const roomId = normalizeRoomId(c.req.param("id"));
	if (!roomId) {
		return c.json({ error: "部屋コードが不正です" }, 400);
	}
	const session = await getOrCreateSession(c);

	const stub = c.env.POKER_ROOM.get(c.env.POKER_ROOM.idFromName(roomId));
	const url = new URL("https://poker-room.internal/websocket");
	url.searchParams.set("userId", session.userId);
	url.searchParams.set("name", session.name);

	// 元のリクエスト(WebSocketアップグレード用の内部情報を持つ)をベースに、
	// DurableObject向けのURL(userId/nameを付与)だけ差し替えて転送する
	return stub.fetch(new Request(url, c.req.raw));
});

app.notFound((c) => c.json({ error: "Not Found" }, 404));

export default app;
