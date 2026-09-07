import { useCallback, useLayoutEffect, useRef, useState } from "hono/jsx/dom";
import type { ClientMessage, RoomState, ServerMessage } from "../types";

/**
 * 部屋の WebSocket 接続を管理する hook。
 *
 * - 接続直後と再接続時に `getJoinMessage()` で作った join メッセージを送る
 *   (毎レンダー ref を更新するので、常に最新の表示名/観戦フラグが使われる)。
 * - 切断されたら 500ms → 2倍 → 最大 8000ms のバックオフで再接続する (接続成功で 500ms に戻る)。
 */
export function useRoomSocket(
	roomId: string,
	getJoinMessage: () => ClientMessage,
) {
	const [state, setState] = useState<RoomState | null>(null);
	const [status, setStatus] = useState("");
	const socketRef = useRef<WebSocket | null>(null);
	const joinRef = useRef(getJoinMessage);
	joinRef.current = getJoinMessage;

	const send = useCallback((message: ClientMessage) => {
		const socket = socketRef.current;
		if (socket && socket.readyState === WebSocket.OPEN) {
			socket.send(JSON.stringify(message));
		}
	}, []);

	// useEffect は requestAnimationFrame 経由で遅延実行され、バックグラウンドタブでは止まってしまう。
	// 画面を開いた直後に同期で接続するため useLayoutEffect を使う。
	useLayoutEffect(() => {
		let disposed = false;
		let reconnectDelayMs = 500;
		let reconnectTimer: ReturnType<typeof setTimeout> | undefined;

		const connect = () => {
			const protocol = location.protocol === "https:" ? "wss" : "ws";
			const socket = new WebSocket(
				`${protocol}://${location.host}/rooms/${roomId}/ws`,
			);
			socketRef.current = socket;

			socket.addEventListener("open", () => {
				reconnectDelayMs = 500;
				setStatus("接続中");
				send(joinRef.current());
			});

			socket.addEventListener("message", (event) => {
				const message = JSON.parse(String(event.data)) as ServerMessage;
				if (message.type === "state") {
					setState(message.state);
				} else if (message.type === "error") {
					setStatus(`エラー: ${message.message}`);
				}
			});

			socket.addEventListener("close", () => {
				if (disposed) return;
				setStatus("切断されました。再接続しています…");
				reconnectTimer = setTimeout(connect, reconnectDelayMs);
				reconnectDelayMs = Math.min(reconnectDelayMs * 2, 8000);
			});

			socket.addEventListener("error", () => {
				socket.close();
			});
		};

		connect();

		return () => {
			disposed = true;
			clearTimeout(reconnectTimer);
			socketRef.current?.close();
		};
	}, [roomId, send]);

	return { state, status, send };
}
