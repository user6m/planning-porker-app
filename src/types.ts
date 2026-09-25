/** プランニングポーカーの標準的なカード（フィボナッチ数列 + 特殊カード） */
export const CARD_DECK = [
	"0",
	"1",
	"2",
	"3",
	"5",
	"8",
	"13",
	"?",
	"☕",
] as const;

export type CardValue = (typeof CARD_DECK)[number];

/** タイマーの長さの選択肢 (秒)。サーバーは MAX_TIMER_SEC 以下の任意の秒数を受け付ける */
export const TIMER_PRESETS_SEC = [30, 60, 120, 180, 300] as const;

export const MAX_TIMER_SEC = 60 * 60;

export interface Participant {
	id: string;
	name: string;
	/** 見積もり値。未投票は null、投票済みだが公開前は "voted" 判定にのみ使う */
	vote: CardValue | null;
	isSpectator: boolean;
}

/** WebSocket 経由でクライアントに送る、投票内容を隠した状態 */
export interface RoomState {
	roomId: string;
	roomName: string;
	revealed: boolean;
	participants: Array<{
		id: string;
		name: string;
		isSpectator: boolean;
		hasVoted: boolean;
		/** revealed が true のときのみ実際の値が入る */
		vote: CardValue | null;
	}>;
	/**
	 * 部屋で共有しているカウントダウン。動かしていないときは null。
	 * 端末ごとの時計のずれを避けるため終了時刻ではなく残り時間を送り、
	 * ブラウザ側は受信した時刻を起点に数える。時間切れ後も停止/リセットまでは remainingMs: 0 で残る。
	 */
	timer: { durationMs: number; remainingMs: number } | null;
}

export type ClientMessage =
	| { type: "join"; name: string; isSpectator?: boolean }
	| { type: "vote"; value: CardValue }
	| { type: "reveal" }
	| { type: "reset" }
	| { type: "rename"; name: string }
	| { type: "startTimer"; durationSec: number }
	| { type: "stopTimer" };

/**
 * サーバーから通知するエラーの種類。
 * 文言そのものではなくコードを送り、表示言語に合わせた文字列への変換は
 * ブラウザ側 (src/i18n.ts の Messages.errors) で行う。
 */
export type ErrorCode =
	| "invalid_message"
	| "vote_after_reveal"
	| "invalid_card"
	| "invalid_timer";

export type ServerMessage =
	| { type: "state"; state: RoomState }
	| { type: "error"; code: ErrorCode };
