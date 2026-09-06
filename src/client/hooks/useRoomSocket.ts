import { useCallback, useEffect, useRef, useState } from "react";
import type {
	ClientMessage,
	RoomState,
	ServerMessage,
} from "../../shared/types";
import { roomSocketUrl } from "../api";

export type ConnectionStatus = "connecting" | "open" | "reconnecting";

/** 接続(再接続)時に送る参加情報 */
export interface JoinProfile {
	name: string;
	isSpectator: boolean;
}

export interface RoomConnection {
	/** サーバーから最後に受け取った部屋の状態。未受信なら null */
	state: RoomState | null;
	status: ConnectionStatus;
	/** サーバーから届いた直近のエラーメッセージ */
	errorMessage: string | null;
	send: (message: ClientMessage) => void;
}

const INITIAL_RETRY_DELAY_MS = 500;
const MAX_RETRY_DELAY_MS = 8000;

function parseServerMessage(data: unknown): ServerMessage | null {
	if (typeof data !== "string") return null;
	try {
		const parsed: unknown = JSON.parse(data);
		if (parsed === null || typeof parsed !== "object") return null;
		const message = parsed as Partial<ServerMessage>;
		if (message.type === "state" || message.type === "error") {
			return message as ServerMessage;
		}
		return null;
	} catch {
		return null;
	}
}

/**
 * 部屋の Durable Object と WebSocket で接続し、状態の受信とメッセージ送信を行う。
 *
 * - 切断されたら指数バックオフで自動再接続し、最新の参加情報で `join` し直す
 * - アンマウント時(StrictMode の二重マウント含む)はソケットとタイマーを確実に破棄する
 */
export function useRoomSocket(
	roomId: string,
	profile: JoinProfile,
): RoomConnection {
	const [state, setState] = useState<RoomState | null>(null);
	const [status, setStatus] = useState<ConnectionStatus>("connecting");
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const socketRef = useRef<WebSocket | null>(null);
	const profileRef = useRef(profile);

	// 再接続時に送る join の内容は常に最新の表示名/観戦フラグにする
	useEffect(() => {
		profileRef.current = profile;
	}, [profile]);

	const send = useCallback((message: ClientMessage) => {
		const socket = socketRef.current;
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	}, []);

	useEffect(() => {
		let disposed = false;
		let retryDelay = INITIAL_RETRY_DELAY_MS;
		let retryTimer: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			if (disposed) return;
			const socket = new WebSocket(roomSocketUrl(roomId));
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				if (disposed) return;
				retryDelay = INITIAL_RETRY_DELAY_MS;
				setStatus("open");
				setErrorMessage(null);
				const { name, isSpectator } = profileRef.current;
				const join: ClientMessage = { type: "join", name, isSpectator };
				socket.send(JSON.stringify(join));
			});

			socket.addEventListener("message", (event: MessageEvent) => {
				if (disposed) return;
				const message = parseServerMessage(event.data);
				if (!message) return;
				if (message.type === "state") {
					setState(message.state);
				} else {
					setErrorMessage(message.message);
				}
			});

			socket.addEventListener("close", () => {
				if (disposed) return;
				socketRef.current = null;
				setStatus("reconnecting");
				retryTimer = setTimeout(connect, retryDelay);
				retryDelay = Math.min(retryDelay * 2, MAX_RETRY_DELAY_MS);
			});

			socket.addEventListener("error", () => {
				// close イベント側で再接続をスケジュールする
				socket.close();
			});
		};

		connect();

		return () => {
			disposed = true;
			clearTimeout(retryTimer);
			const socket = socketRef.current;
			socketRef.current = null;
			socket?.close();
		};
	}, [roomId]);

	return { state, status, errorMessage, send };
}
