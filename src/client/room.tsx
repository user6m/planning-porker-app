import type { FC } from "hono/jsx/dom";
import { useRef, useState } from "hono/jsx/dom";
import { CARD_DECK, type CardValue, type RoomState } from "../types";
import { RoomQrCode } from "./qr-code";
import { useRoomSocket } from "./use-room-socket";

const RENAME_DEBOUNCE_MS = 400;
const DEFAULT_NAME = "ゲスト";

type Participant = RoomState["participants"][number];

/** ルーム画面全体。部屋の状態と自分の入力状態を持つ唯一のコンポーネント */
export const RoomApp: FC<{
	roomId: string;
	userId: string;
	initialName: string;
}> = ({ roomId, userId, initialName }) => {
	const [selectedVote, setSelectedVote] = useState<CardValue | null>(null);
	const [isSpectator, setIsSpectator] = useState(false);
	// 表示名の input は非制御 (再描画で IME 入力中の値を上書きしない) なので、最新値は ref で持つ
	const nameRef = useRef(initialName);
	const spectatorRef = useRef(false);
	const renameTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
		undefined,
	);

	const displayName = () => nameRef.current.trim() || DEFAULT_NAME;

	const { state, status, send } = useRoomSocket(roomId, () => ({
		type: "join",
		name: displayName(),
		isSpectator: spectatorRef.current,
	}));

	const roomName = state?.roomName ? state.roomName : `部屋 ${roomId}`;
	// 最初の state が届くまではリセットボタンを有効のままにしておく (従来の挙動と同じ)
	const resetDisabled = state ? !state.revealed : false;

	const onVote = (value: CardValue) => {
		setSelectedVote(value);
		send({ type: "vote", value });
	};
	const onReveal = () => send({ type: "reveal" });
	const onReset = () => {
		setSelectedVote(null);
		send({ type: "reset" });
	};
	const onNameInput = (value: string) => {
		nameRef.current = value;
		clearTimeout(renameTimer.current);
		renameTimer.current = setTimeout(() => {
			send({ type: "rename", name: displayName() });
		}, RENAME_DEBOUNCE_MS);
	};
	const onSpectatorChange = (checked: boolean) => {
		// setState はマイクロタスクでまとめて反映されるため、送信にはイベントの値をそのまま使う
		spectatorRef.current = checked;
		setIsSpectator(checked);
		send({ type: "join", name: displayName(), isSpectator: checked });
	};

	return (
		<>
			<RoomHeader
				roomId={roomId}
				roomName={roomName}
				initialName={initialName}
				isSpectator={isSpectator}
				onNameInput={onNameInput}
				onSpectatorChange={onSpectatorChange}
			/>
			<Participants
				participants={state?.participants ?? []}
				revealed={state?.revealed ?? false}
				userId={userId}
			/>
			<section class="controls">
				<CardDeck selected={selectedVote} onVote={onVote} />
				<Actions
					resetDisabled={resetDisabled}
					onReveal={onReveal}
					onReset={onReset}
				/>
			</section>
			<p id="connection-status" class="status" role="status">
				{status}
			</p>
		</>
	);
};

const RoomHeader: FC<{
	roomId: string;
	roomName: string;
	initialName: string;
	isSpectator: boolean;
	onNameInput: (value: string) => void;
	onSpectatorChange: (checked: boolean) => void;
}> = ({
	roomId,
	roomName,
	initialName,
	isSpectator,
	onNameInput,
	onSpectatorChange,
}) => (
	<header class="room-header">
		<div>
			<h1 id="room-name">{roomName}</h1>
			<p class="room-code">
				部屋コード: <code>{roomId}</code> <CopyLinkButton />
			</p>
		</div>
		<div class="header-side">
			<RoomQrCode />
			<div class="me">
				<label>
					表示名
					<input
						id="my-name"
						type="text"
						value={initialName}
						maxlength={40}
						onInput={(e) => onNameInput((e.target as HTMLInputElement).value)}
					/>
				</label>
				<label class="spectator-toggle">
					<input
						id="spectator"
						type="checkbox"
						checked={isSpectator}
						onChange={(e) =>
							onSpectatorChange((e.target as HTMLInputElement).checked)
						}
					/>
					観戦のみ
				</label>
			</div>
		</div>
	</header>
);

const COPY_FEEDBACK_MS = 1500;

const CopyLinkButton: FC = () => {
	const [copied, setCopied] = useState(false);
	const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

	const copy = async () => {
		try {
			await navigator.clipboard.writeText(location.href);
			setCopied(true);
			clearTimeout(timer.current);
			timer.current = setTimeout(() => setCopied(false), COPY_FEEDBACK_MS);
		} catch {
			// クリップボードAPIが使えない環境ではユーザーにURLを手動で伝える
			window.prompt("このURLを共有してください", location.href);
		}
	};

	return (
		<button id="copy-link" type="button" onClick={copy}>
			{copied ? "コピーしました！" : "招待リンクをコピー"}
		</button>
	);
};

const Participants: FC<{
	participants: Participant[];
	revealed: boolean;
	userId: string;
}> = ({ participants, revealed, userId }) => (
	<section class="participants" id="participants" aria-live="polite">
		{participants.map((p) => (
			<ParticipantCard
				key={p.id}
				participant={p}
				revealed={revealed}
				isMe={p.id === userId}
			/>
		))}
	</section>
);

const ParticipantCard: FC<{
	participant: Participant;
	revealed: boolean;
	isMe: boolean;
}> = ({ participant: p, revealed, isMe }) => {
	const classes = ["participant"];
	if (p.hasVoted) classes.push("voted");
	if (p.isSpectator) classes.push("spectator");

	const slot = revealed
		? (p.vote ?? (p.isSpectator ? "👀" : "-"))
		: p.hasVoted
			? "✅"
			: "";

	return (
		<div class={classes.join(" ")}>
			<div class="name">{isMe ? `${p.name} (自分)` : p.name}</div>
			<div class="vote-slot">{slot}</div>
		</div>
	);
};

const CardDeck: FC<{
	selected: CardValue | null;
	onVote: (value: CardValue) => void;
}> = ({ selected, onVote }) => (
	<div class="cards" id="cards">
		{CARD_DECK.map((value) => (
			<button
				key={value}
				type="button"
				class={value === selected ? "card-btn selected" : "card-btn"}
				onClick={() => onVote(value)}
			>
				{value}
			</button>
		))}
	</div>
);

const Actions: FC<{
	resetDisabled: boolean;
	onReveal: () => void;
	onReset: () => void;
}> = ({ resetDisabled, onReveal, onReset }) => (
	<div class="actions">
		<button id="reveal" type="button" onClick={onReveal}>
			公開する
		</button>
		<button id="reset" type="button" disabled={resetDisabled} onClick={onReset}>
			リセット
		</button>
	</div>
);
