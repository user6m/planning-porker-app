import { type Locale, messagesFor } from "./i18n";

/**
 * 部屋名の初期値を自動生成する。
 *
 * ゲスト名 (src/session.ts) と同様に、毎回手で入力しなくても済むように
 * ランダムな既定値を用意しておくためのもの。ユーザーはそのまま使っても、
 * 好きな名前に書き換えてもよい。
 */
export function generateRoomName(locale: Locale): string {
	const n = Math.floor(Math.random() * 9000) + 1000;
	return messagesFor(locale).defaultRoomName(n);
}
