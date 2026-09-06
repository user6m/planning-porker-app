import { type ChangeEvent, useEffect, useRef, useState } from "react";
import { Navigate, useParams } from "react-router";
import { normalizeRoomId } from "../../shared/room-id";
import {
	type CardValue,
	MAX_NAME_LENGTH,
	type UserSession,
} from "../../shared/types";
import { api } from "../api";
import { CardDeck } from "../components/CardDeck";
import { ParticipantList } from "../components/ParticipantList";
import { useRoomSocket } from "../hooks/useRoomSocket";
import { useSession } from "../hooks/useSession";

const DEFAULT_NAME = "ゲスト";
const RENAME_DEBOUNCE_MS = 400;
const COPIED_LABEL_MS = 1500;

export function RoomPage() {
	const { roomId: rawRoomId = "" } = useParams();
	const roomId = normalizeRoomId(rawRoomId);

	if (!roomId) return <Navigate to="/" replace />;
	// 小文字や前後の空白を含むURLで開かれた場合は正規化したURLに揃える
	if (roomId !== rawRoomId) return <Navigate to={`/rooms/${roomId}`} replace />;

	return <RoomLoader roomId={roomId} />;
}

function RoomLoader({ roomId }: { roomId: string }) {
	const { session, error } = useSession();

	if (error) {
		return (
			<main className="page page-room">
				<p className="error">{error}</p>
			</main>
		);
	}
	if (!session) {
		return (
			<main className="page page-room">
				<p className="status">読み込み中…</p>
			</main>
		);
	}
	return <Room roomId={roomId} session={session} />;
}

interface RoomProps {
	roomId: string;
	session: UserSession;
}

function Room({ roomId, session }: RoomProps) {
	const [name, setName] = useState(session.name);
	const [isSpectator, setIsSpectator] = useState(false);
	// 公開前はサーバーから自分の投票値が返ってこない(hasVotedのみ)ので、選んだカードは手元で覚えておく
	const [localVote, setLocalVote] = useState<CardValue | null>(null);
	const [copied, setCopied] = useState(false);
	const renameTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
	const copiedTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

	const { state, status, errorMessage, send } = useRoomSocket(roomId, {
		name,
		isSpectator,
	});

	useEffect(
		() => () => {
			clearTimeout(renameTimer.current);
			clearTimeout(copiedTimer.current);
		},
		[],
	);

	const me = state?.participants.find((p) => p.id === session.userId);
	const revealed = state?.revealed ?? false;
	// リセットされると hasVoted が false になるので、選択表示も自動的に消える
	const selectedVote = me?.hasVoted ? localVote : null;
	const roomName = state?.roomName ? state.roomName : `部屋 ${roomId}`;

	const handleVote = (value: CardValue) => {
		setLocalVote(value);
		send({ type: "vote", value });
	};

	const handleReset = () => {
		setLocalVote(null);
		send({ type: "reset" });
	};

	const handleNameChange = (event: ChangeEvent<HTMLInputElement>) => {
		const next = event.target.value;
		setName(next);
		clearTimeout(renameTimer.current);
		renameTimer.current = setTimeout(() => {
			const trimmed = next.trim() || DEFAULT_NAME;
			send({ type: "rename", name: trimmed });
			// 次回以降の部屋でも同じ表示名を使えるように Cookie にも保存する
			api.rename(trimmed).catch(() => {
				// 部屋内の表示名は WebSocket 経由で更新済みなので、Cookie 更新の失敗は無視する
			});
		}, RENAME_DEBOUNCE_MS);
	};

	const handleSpectatorChange = (event: ChangeEvent<HTMLInputElement>) => {
		const next = event.target.checked;
		setIsSpectator(next);
		send({
			type: "join",
			name: name.trim() || DEFAULT_NAME,
			isSpectator: next,
		});
	};

	const handleCopyLink = async () => {
		try {
			await navigator.clipboard.writeText(location.href);
			setCopied(true);
			clearTimeout(copiedTimer.current);
			copiedTimer.current = setTimeout(() => setCopied(false), COPIED_LABEL_MS);
		} catch {
			// クリップボードAPIが使えない環境ではユーザーにURLを手動で伝える
			window.prompt("このURLを共有してください", location.href);
		}
	};

	let statusText: string;
	if (errorMessage) statusText = `エラー: ${errorMessage}`;
	else if (status === "open") statusText = "接続中";
	else if (status === "reconnecting")
		statusText = "切断されました。再接続しています…";
	else statusText = "接続しています…";

	return (
		<main className="page page-room">
			<title>{`部屋 ${roomId} - プランニングポーカー`}</title>
			<header className="room-header">
				<div>
					<h1>{roomName}</h1>
					<p className="room-code">
						部屋コード: <code>{roomId}</code>{" "}
						<button type="button" onClick={handleCopyLink}>
							{copied ? "コピーしました！" : "招待リンクをコピー"}
						</button>
					</p>
				</div>
				<div className="me">
					<label>
						表示名
						<input
							type="text"
							value={name}
							maxLength={MAX_NAME_LENGTH}
							onChange={handleNameChange}
						/>
					</label>
					<label className="spectator-toggle">
						<input
							type="checkbox"
							checked={isSpectator}
							onChange={handleSpectatorChange}
						/>
						観戦のみ
					</label>
				</div>
			</header>

			<ParticipantList
				participants={state?.participants ?? []}
				revealed={revealed}
				meId={session.userId}
			/>

			<section className="controls">
				<CardDeck
					selected={selectedVote}
					disabled={revealed}
					onSelect={handleVote}
				/>
				<div className="actions">
					<button type="button" onClick={() => send({ type: "reveal" })}>
						公開する
					</button>
					<button type="button" onClick={handleReset} disabled={!revealed}>
						リセット
					</button>
				</div>
			</section>

			<p className="status" role="status">
				{statusText}
			</p>
		</main>
	);
}
