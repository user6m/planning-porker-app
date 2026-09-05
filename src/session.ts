import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Bindings } from "./bindings";

/**
 * 「ユーザーセッション」= このブラウザが誰なのかを覚えておく仕組み。
 *
 * サーバー側にログイン情報やDBを一切持たず、HMAC署名付きCookieだけで実現している。
 * 仕組み・改ざん対策の詳細は docs/SESSION.md を参照。
 */
const COOKIE_NAME = "pp_session";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30日

export interface UserSession {
	userId: string;
	name: string;
}

function generateGuestName(): string {
	const n = Math.floor(Math.random() * 9000) + 1000;
	return `ゲスト${n}`;
}

/**
 * Cookie から署名済みセッションを読み取る。
 * 署名が無い/不正/未設定の場合は新しいセッションを発行してCookieにセットする。
 */
export async function getOrCreateSession(
	c: Context<{ Bindings: Bindings }>,
): Promise<UserSession> {
	const raw = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE_NAME);

	if (raw) {
		try {
			const parsed = JSON.parse(raw) as Partial<UserSession>;
			if (
				typeof parsed.userId === "string" &&
				typeof parsed.name === "string"
			) {
				return { userId: parsed.userId, name: parsed.name };
			}
		} catch {
			// 壊れた/改ざんされたCookieは無視して新規発行する
		}
	}

	const session: UserSession = {
		userId: crypto.randomUUID(),
		name: generateGuestName(),
	};
	await persistSession(c, session);
	return session;
}

/** セッション内容（表示名の変更など）を更新してCookieに書き戻す */
export async function persistSession(
	c: Context<{ Bindings: Bindings }>,
	session: UserSession,
): Promise<void> {
	await setSignedCookie(
		c,
		COOKIE_NAME,
		JSON.stringify(session),
		c.env.SESSION_SECRET,
		{
			httpOnly: true,
			secure: true,
			sameSite: "Lax",
			path: "/",
			maxAge: COOKIE_MAX_AGE_SECONDS,
		},
	);
}
