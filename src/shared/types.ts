// クライアント(React)とWorker(Hono/Durable Object)の両方から参照する共有の型・定数。
// このディレクトリのコードはブラウザとWorkersランタイムの両方で動く必要があるため、
// DOM API や Workers 固有の API に依存しないこと。

/** プランニングポーカーの標準的なカード（フィボナッチ数列 + 特殊カード） */
export const CARD_DECK = [
	"0",
	"1",
	"2",
	"3",
	"5",
	"8",
	"13",
	"20",
	"40",
	"100",
	"?",
	"☕",
] as const;

export type CardValue = (typeof CARD_DECK)[number];

/** 表示名の最大長 */
export const MAX_NAME_LENGTH = 40;
/** 部屋の名前の最大長 */
export const MAX_ROOM_NAME_LENGTH = 100;

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

export type RoomParticipant = RoomState["participants"][number];

export type ClientMessage =
	| { type: "join"; name: string; isSpectator?: boolean }
	| { type: "vote"; value: CardValue }
	| { type: "reveal" }
	| { type: "reset" }
	| { type: "rename"; name: string };

export type ServerMessage =
	| { type: "state"; state: RoomState }
	| { type: "error"; message: string };

/**
 * 署名付きCookieに保存されるユーザーセッション。
 * `GET /api/me` / `PATCH /api/me` のレスポンスでもある。
 */
export interface UserSession {
	userId: string;
	name: string;
}

/** `POST /api/rooms` のリクエストボディ */
export interface CreateRoomRequest {
	roomName: string;
	hostName: string;
}

/** `POST /api/rooms` のレスポンス */
export interface CreateRoomResponse {
	roomId: string;
}

/** `PATCH /api/me` のリクエストボディ */
export interface UpdateSessionRequest {
	name: string;
}

/** API がエラー時に返す JSON */
export interface ApiErrorResponse {
	error: string;
}
