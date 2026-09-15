// ブラウザ側の表示言語。
// サーバーが <html lang> に出力した言語をそのまま採用する
// (言語の決定・保存は Worker 側の src/locale.ts が Cookie を使って行う)。
import { DEFAULT_LOCALE, isLocale, messagesFor } from "../i18n";

const lang = document.documentElement.lang;

export const locale = isLocale(lang) ? lang : DEFAULT_LOCALE;

/** 画面に出す文言。`t.room.reveal` のように参照する */
export const t = messagesFor(locale);
