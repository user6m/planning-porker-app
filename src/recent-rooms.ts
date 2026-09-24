/**
 * 最近開いた部屋の履歴を Cookie に覚えておき、トップページから戻れるようにする仕組み。
 *
 * 部屋には有効期限が無く、全員が抜けたあとも同じコードで再利用できる。そのため部屋の状態は問い合わせず、
 * 「最後に開いてから RECENT_ROOM_DAYS 日以内」の部屋を表示する。
 * 改ざんされても本人のトップページに出るリンクが変わるだけなので署名はしない (読み込み時に形は検証する)。
 */
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";

const COOKIE_NAME = "pp_recent";
const MAX_ROOMS = 5;
export const RECENT_ROOM_DAYS = 14;
const TTL_MS = RECENT_ROOM_DAYS * 24 * 60 * 60 * 1000;
// Cookie は 4KB まで。値は URL エンコードされ日本語は1文字9バイトになるので、部屋名は短く切って保存する
const MAX_NAME_LENGTH = 40;
const MAX_ID_LENGTH = 16;

export interface RecentRoom {
	id: string;
	/** 部屋の作成時に付けた名前。名前の無い部屋 (コードを直接開いただけ等) は空文字 */
	name: string;
	/** 最後に開いた日時 (epoch ミリ秒) */
	visitedAt: number;
}

function isRecentRoom(value: unknown): value is RecentRoom {
	if (typeof value !== "object" || value === null) return false;
	const room = value as Partial<RecentRoom>;
	return (
		typeof room.id === "string" &&
		room.id.length > 0 &&
		room.id.length <= MAX_ID_LENGTH &&
		typeof room.name === "string" &&
		typeof room.visitedAt === "number"
	);
}

/** 期限内の履歴を新しい順に返す。Cookie が無い/壊れている場合は空配列 */
export function getRecentRooms(c: Context, now = Date.now()): RecentRoom[] {
	const raw = getCookie(c, COOKIE_NAME);
	if (!raw) return [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw);
	} catch {
		return [];
	}
	if (!Array.isArray(parsed)) return [];
	return parsed
		.filter(isRecentRoom)
		.filter((room) => now - room.visitedAt < TTL_MS)
		.slice(0, MAX_ROOMS);
}

/** 開いた部屋を履歴の先頭に入れて Cookie に書き戻す (同じ部屋は1件にまとめる) */
export function rememberRoom(
	c: Context,
	room: { id: string; name: string },
	now = Date.now(),
): void {
	const entry: RecentRoom = {
		id: room.id,
		// サロゲートペア (絵文字) の途中で切らないよう、コードポイント単位で切り詰める
		name: Array.from(room.name).slice(0, MAX_NAME_LENGTH).join(""),
		visitedAt: now,
	};
	const rooms = [
		entry,
		...getRecentRooms(c, now).filter((r) => r.id !== room.id),
	].slice(0, MAX_ROOMS);
	setCookie(c, COOKIE_NAME, JSON.stringify(rooms), {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: TTL_MS / 1000,
	});
}
