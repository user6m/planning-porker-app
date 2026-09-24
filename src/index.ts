import { Hono } from "hono";
import type { Bindings } from "./bindings";
import { isLocale, messagesFor } from "./i18n";
import { persistLocale, resolveLocale, safeReturnPath } from "./locale";
import { getRecentRooms, rememberRoom } from "./recent-rooms";
import { generateRoomName } from "./room-name";
import { getOrCreateSession, persistSession } from "./session";
import { renderHome, renderRoom } from "./views";

export { PokerRoom } from "./durable-objects/poker-room";

const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // 紛らわしい文字(I/O/0/1)を除外

function generateRoomId(length = 8): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(
		bytes,
		(b) => ROOM_ID_ALPHABET[b % ROOM_ID_ALPHABET.length],
	).join("");
}

function normalizeRoomId(input: string): string {
	return input.trim().toUpperCase().slice(0, 16);
}

const app = new Hono<{ Bindings: Bindings }>();

// 表示言語の切り替え。選んだ言語を Cookie に記録し、元のページへ戻す
app.get("/lang/:locale", (c) => {
	const locale = c.req.param("locale");
	if (isLocale(locale)) persistLocale(c, locale);
	return c.redirect(safeReturnPath(c.req.query("to")), 303);
});

app.get("/", async (c) => {
	const locale = resolveLocale(c);
	const session = await getOrCreateSession(c, locale);
	return c.html(
		renderHome(locale, session, getRecentRooms(c), generateRoomName(locale)),
	);
});

app.post("/rooms", async (c) => {
	const body = await c.req.parseBody();
	const roomName = String(body.roomName ?? "").trim();
	const hostName = String(body.hostName ?? "").trim();

	const locale = resolveLocale(c);
	const session = await getOrCreateSession(c, locale);
	if (!roomName || !hostName) {
		return c.html(
			// 入力済みの部屋名は残し、空のときだけ新しい既定値を入れ直す
			renderHome(
				locale,
				session,
				getRecentRooms(c),
				roomName || generateRoomName(locale),
				messagesFor(locale).home.missingFields,
			),
			400,
		);
	}
	if (hostName !== session.name) {
		await persistSession(c, { ...session, name: hostName.slice(0, 40) });
	}

	const roomId = generateRoomId();
	const stub = c.env.POKER_ROOM.get(c.env.POKER_ROOM.idFromName(roomId));
	await stub.fetch("https://poker-room.internal/init", {
		method: "POST",
		headers: { "content-type": "application/json" },
		body: JSON.stringify({ roomName }),
	});

	return c.redirect(`/rooms/${roomId}`, 303);
});

app.get("/rooms/join", async (c) => {
	const roomId = normalizeRoomId(c.req.query("roomId") ?? "");
	if (!roomId) return c.redirect("/", 303);
	return c.redirect(`/rooms/${roomId}`, 303);
});

app.get("/rooms/:id", async (c) => {
	const roomId = normalizeRoomId(c.req.param("id"));
	const locale = resolveLocale(c);
	const session = await getOrCreateSession(c, locale);

	const stub = c.env.POKER_ROOM.get(c.env.POKER_ROOM.idFromName(roomId));
	const info = await stub.fetch("https://poker-room.internal/info");
	const { roomName } = await info.json<{ roomName: string }>();
	rememberRoom(c, { id: roomId, name: roomName });

	return c.html(renderRoom(locale, roomId, session));
});

app.get("/rooms/:id/ws", async (c) => {
	if (c.req.header("Upgrade") !== "websocket") {
		return c.text("Expected a WebSocket upgrade request", 426);
	}

	const roomId = normalizeRoomId(c.req.param("id"));
	const session = await getOrCreateSession(c, resolveLocale(c));

	const stub = c.env.POKER_ROOM.get(c.env.POKER_ROOM.idFromName(roomId));
	const url = new URL("https://poker-room.internal/websocket");
	url.searchParams.set("userId", session.userId);
	url.searchParams.set("name", session.name);

	// 元のリクエスト(WebSocketアップグレード用の内部情報を持つ)をベースに、
	// DurableObject向けのURL(userId/nameを付与)だけ差し替えて転送する
	return stub.fetch(new Request(url, c.req.raw));
});

export default app;
