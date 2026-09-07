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
}

export type ClientMessage =
	| { type: "join"; name: string; isSpectator?: boolean }
	| { type: "vote"; value: CardValue }
	| { type: "reveal" }
	| { type: "reset" }
	| { type: "rename"; name: string };

export type ServerMessage =
	| { type: "state"; state: RoomState }
	| { type: "error"; message: string };
