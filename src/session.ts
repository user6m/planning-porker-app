import type { Context } from "hono";
import { getSignedCookie, setSignedCookie } from "hono/cookie";
import type { Bindings } from "./bindings";
import { LOCALES, type Locale, messagesFor } from "./i18n";

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

function generateGuestName(locale: Locale): string {
	const n = Math.floor(Math.random() * 9000) + 1000;
	return messagesFor(locale).guestName(n);
}

/**
 * 自動生成されたゲスト名（= ユーザーがまだ表示名を決めていない状態）なら、その番号を返す。
 * 自分で決めた表示名なら null。
 *
 * ユーザーがたまたまゲスト名と完全に同じ文字列を入力していた場合も自動生成とみなすが、
 * 作り直しても番号は変わらない（「ゲスト1234」↔「Guest1234」）ので実害は無いものとして許容する。
 */
function parsedGuestNumber(name: string): number | null {
	const digits = /\d+$/.exec(name)?.[0];
	if (!digits) return null;
	const n = Number(digits);
	return LOCALES.some((locale) => messagesFor(locale).guestName(n) === name)
		? n
		: null;
}

/**
 * 表示名が自動生成のゲスト名のままなら、いま選ばれている表示言語のゲスト名に作り直してCookieに書き戻す。
 *
 * セッションCookieは表示言語Cookieより先に、しかも言語を選ぶ前に発行されることがあるため、
 * これが無いと英語に切り替えても「ゲスト1234」のままになる。番号は引き継ぐので同じ人だと分かる。
 */
async function localizeGuestName(
	c: Context<{ Bindings: Bindings }>,
	session: UserSession,
	locale: Locale,
): Promise<UserSession> {
	const n = parsedGuestNumber(session.name);
	if (n === null) return session;

	const name = messagesFor(locale).guestName(n);
	if (name === session.name) return session;

	const localized = { ...session, name };
	await persistSession(c, localized);
	return localized;
}

/**
 * Cookie から署名済みセッションを読み取る。
 * 署名が無い/不正/未設定の場合は新しいセッションを発行してCookieにセットする。
 * 既定の表示名（自動生成のゲスト名）は表示言語 (locale) に合わせる。
 * 表示名を自分で決めていないユーザーは、言語を切り替えたときにゲスト名も作り直される。
 */
export async function getOrCreateSession(
	c: Context<{ Bindings: Bindings }>,
	locale: Locale,
): Promise<UserSession> {
	const raw = await getSignedCookie(c, c.env.SESSION_SECRET, COOKIE_NAME);

	if (raw) {
		try {
			const parsed = JSON.parse(raw) as Partial<UserSession>;
			if (
				typeof parsed.userId === "string" &&
				typeof parsed.name === "string"
			) {
				return await localizeGuestName(
					c,
					{ userId: parsed.userId, name: parsed.name },
					locale,
				);
			}
		} catch {
			// 壊れた/改ざんされたCookieは無視して新規発行する
		}
	}

	const session: UserSession = {
		userId: crypto.randomUUID(),
		name: generateGuestName(locale),
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
