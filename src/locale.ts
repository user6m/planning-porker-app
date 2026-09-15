/**
 * リクエストから表示言語を決め、選択を Cookie に覚えておく仕組み（Worker 側）。
 *
 * 優先順位は「明示的に選んだ言語 (Cookie) > ブラウザの Accept-Language > 既定 (ja)」。
 * セッション Cookie (src/session.ts) と違い、改ざんされても表示言語が変わるだけなので署名はしない。
 */
import type { Context } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { DEFAULT_LOCALE, isLocale, type Locale, negotiateLocale } from "./i18n";

const COOKIE_NAME = "pp_lang";
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365; // 1年

export function resolveLocale(c: Context): Locale {
	const saved = getCookie(c, COOKIE_NAME);
	if (isLocale(saved)) return saved;
	return negotiateLocale(c.req.header("Accept-Language")) ?? DEFAULT_LOCALE;
}

export function persistLocale(c: Context, locale: Locale): void {
	setCookie(c, COOKIE_NAME, locale, {
		httpOnly: true,
		secure: true,
		sameSite: "Lax",
		path: "/",
		maxAge: COOKIE_MAX_AGE_SECONDS,
	});
}

/**
 * 言語切り替え後の戻り先パスを検証する。
 * 外部サイトへ飛ばされないよう、自サイト内の絶対パス（"/" 始まり、"//" や "/\" は除く）のみ許可する。
 */
export function safeReturnPath(to: string | undefined): string {
	if (!to?.startsWith("/")) return "/";
	if (to.startsWith("//") || to.startsWith("/\\")) return "/";
	return to;
}
