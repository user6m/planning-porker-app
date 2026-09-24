/**
 * 表示言語（日本語 / 英語）のメッセージ定義。
 *
 * このファイルは `src/types.ts` と同じく Worker 側 (src/) とブラウザ側 (src/client/) の
 * 両方から import される共有モジュールなので、DOM も Workers も参照しない純粋な TypeScript に保つこと。
 * Cookie の読み書きなど Worker 依存の処理は `src/locale.ts` 側に置く。
 */
import type { ErrorCode } from "./types";

export const LOCALES = ["ja", "en"] as const;

export type Locale = (typeof LOCALES)[number];

/** Accept-Language も Cookie も判定できなかったときの言語 */
export const DEFAULT_LOCALE: Locale = "ja";

export function isLocale(value: string | undefined | null): value is Locale {
	return LOCALES.includes(value as Locale);
}

export interface Messages {
	/** 言語メニューに出すこの言語自身の名前 */
	langName: string;
	/** <html lang> と同じ言語タグ */
	htmlLang: string;
	appName: string;
	tagline: string;
	langMenuLabel: string;
	themeMenuLabel: string;
	/** テーマメニューの選択肢。auto は OS の設定 (prefers-color-scheme) に従う */
	themeNames: { auto: string; light: string; dark: string };
	home: {
		createHeading: string;
		roomNameLabel: string;
		roomNamePlaceholder: string;
		hostNameLabel: string;
		createButton: string;
		joinHeading: string;
		joinQrHint: string;
		roomCodeLabel: string;
		roomCodePlaceholder: string;
		joinButton: string;
		missingFields: string;
		recentHeading: string;
		recentHint: (days: number) => string;
	};
	room: {
		backToTop: string;
		pageTitle: (roomId: string) => string;
		fallbackRoomName: (roomId: string) => string;
		roomCode: string;
		copyLink: string;
		copied: string;
		sharePrompt: string;
		displayName: string;
		spectatorOnly: string;
		me: (name: string) => string;
		reveal: string;
		reset: string;
		timerLabel: string;
		/** タイマーの長さの選択肢の表示 (例: 30秒, 2分) */
		timerDuration: (sec: number) => string;
		startTimer: string;
		stopTimer: string;
		timeUp: string;
		qrAlt: string;
		qrCaption: string;
		connected: string;
		reconnecting: string;
		error: (message: string) => string;
	};
	/** Durable Object から届くエラーコードの文言 */
	errors: Record<ErrorCode, string>;
	/** セッション作成時に割り当てる既定の表示名 */
	guestName: (n: number) => string;
	/** 表示名を空にしたときのフォールバック */
	guestFallback: string;
	/** 部屋作成フォームに入れておく既定の部屋名 */
	defaultRoomName: (n: number) => string;
}

const ja: Messages = {
	langName: "日本語",
	htmlLang: "ja",
	appName: "プランニングポーカー",
	tagline: "チームでリアルタイムに見積もりポイントを出し合えるツールです。",
	langMenuLabel: "表示言語",
	themeMenuLabel: "表示テーマ",
	themeNames: { auto: "OS の設定に合わせる", light: "ライト", dark: "ダーク" },
	home: {
		createHeading: "新しい部屋を作る",
		roomNameLabel: "部屋の名前",
		roomNamePlaceholder: "例: スプリント12 見積もり",
		hostNameLabel: "あなたの表示名",
		createButton: "部屋を作成",
		joinHeading: "部屋に参加する",
		joinQrHint:
			"ホストに表示されたQRコードをスキャンして参加することもできます。",
		roomCodeLabel: "部屋コード",
		roomCodePlaceholder: "例: AB12CD34",
		joinButton: "参加する",
		missingFields: "部屋の名前と表示名を入力してください",
		recentHeading: "最近開いた部屋",
		recentHint: (days) => `最後に開いてから${days}日以内の部屋です。`,
	},
	room: {
		backToTop: "← トップへ戻る",
		pageTitle: (roomId) => `部屋 ${roomId} - プランニングポーカー`,
		fallbackRoomName: (roomId) => `部屋 ${roomId}`,
		roomCode: "部屋コード:",
		copyLink: "招待リンクをコピー",
		copied: "コピーしました！",
		sharePrompt: "このURLを共有してください",
		displayName: "表示名",
		spectatorOnly: "観戦のみ",
		me: (name) => `${name} (自分)`,
		reveal: "公開する",
		reset: "リセット",
		timerLabel: "タイマー",
		timerDuration: (sec) => (sec < 60 ? `${sec}秒` : `${sec / 60}分`),
		startTimer: "開始",
		stopTimer: "停止",
		timeUp: "時間切れ",
		qrAlt: "部屋の招待URLのQRコード",
		qrCaption: "スキャンして参加",
		connected: "接続中",
		reconnecting: "切断されました。再接続しています…",
		error: (message) => `エラー: ${message}`,
	},
	errors: {
		invalid_message: "メッセージの形式が不正です",
		vote_after_reveal: "公開後は投票し直せません。リセットしてください",
		invalid_card: "無効なカードです",
		invalid_timer: "タイマーの長さが不正です",
	},
	guestName: (n) => `ゲスト${n}`,
	guestFallback: "ゲスト",
	defaultRoomName: (n) => `見積もり${n}`,
};

const en: Messages = {
	langName: "English",
	htmlLang: "en",
	appName: "Planning Poker",
	tagline: "Estimate story points together, in real time.",
	langMenuLabel: "Language",
	themeMenuLabel: "Theme",
	themeNames: { auto: "OS default", light: "Light", dark: "Dark" },
	home: {
		createHeading: "Create a new room",
		roomNameLabel: "Room name",
		roomNamePlaceholder: "e.g. Sprint 12 estimation",
		hostNameLabel: "Your display name",
		createButton: "Create room",
		joinHeading: "Join a room",
		joinQrHint: "You can also scan the QR code shown to the host to join.",
		roomCodeLabel: "Room code",
		roomCodePlaceholder: "e.g. AB12CD34",
		joinButton: "Join",
		missingFields: "Enter a room name and your display name",
		recentHeading: "Recent rooms",
		recentHint: (days) => `Rooms you opened in the last ${days} days.`,
	},
	room: {
		backToTop: "← Back to top",
		pageTitle: (roomId) => `Room ${roomId} - Planning Poker`,
		fallbackRoomName: (roomId) => `Room ${roomId}`,
		roomCode: "Room code:",
		copyLink: "Copy invite link",
		copied: "Copied!",
		sharePrompt: "Share this URL",
		displayName: "Display name",
		spectatorOnly: "Spectator only",
		me: (name) => `${name} (you)`,
		reveal: "Reveal",
		reset: "Reset",
		timerLabel: "Timer",
		timerDuration: (sec) => (sec < 60 ? `${sec} sec` : `${sec / 60} min`),
		startTimer: "Start",
		stopTimer: "Stop",
		timeUp: "Time's up",
		qrAlt: "QR code for the room invite URL",
		qrCaption: "Scan to join",
		connected: "Connected",
		reconnecting: "Disconnected. Reconnecting…",
		error: (message) => `Error: ${message}`,
	},
	errors: {
		invalid_message: "Invalid message format",
		vote_after_reveal: "Votes cannot be changed after reveal. Reset first.",
		invalid_card: "Invalid card",
		invalid_timer: "Invalid timer duration",
	},
	guestName: (n) => `Guest${n}`,
	guestFallback: "Guest",
	defaultRoomName: (n) => `Estimate ${n}`,
};

export const MESSAGES: Record<Locale, Messages> = { ja, en };

export function messagesFor(locale: Locale): Messages {
	return MESSAGES[locale];
}

/**
 * Accept-Language ヘッダから対応言語を選ぶ。
 * `ja,en-US;q=0.9` のように「言語タグ;q=優先度」がカンマ区切りで並ぶので、
 * q 値の高い順に見ていき、最初に見つかった対応言語を返す（対応言語が無ければ undefined）。
 */
export function negotiateLocale(
	header: string | undefined,
): Locale | undefined {
	if (!header) return undefined;

	const candidates = header
		.split(",")
		.map((part, index) => {
			const [tag = "", ...params] = part.trim().split(";");
			const q = params
				.map((p) => p.trim())
				.find((p) => p.startsWith("q="))
				?.slice(2);
			const quality = q === undefined ? 1 : Number.parseFloat(q);
			return {
				// "en-US" → "en"、"*" はどの言語でもよいという意味なので既定言語に寄せる
				lang: tag.trim().toLowerCase().split("-")[0] ?? "",
				quality: Number.isNaN(quality) ? 0 : quality,
				index,
			};
		})
		.filter((c) => c.quality > 0)
		// q が同じなら元の並び順を保つ
		.sort((a, b) => b.quality - a.quality || a.index - b.index);

	for (const { lang } of candidates) {
		if (lang === "*") return DEFAULT_LOCALE;
		if (isLocale(lang)) return lang;
	}
	return undefined;
}
