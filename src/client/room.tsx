import type { Child, FC } from "hono/jsx/dom";
import { useLayoutEffect, useMemo, useRef, useState } from "hono/jsx/dom";
import {
	CARD_DECK,
	type CardValue,
	type RoomState,
	TIMER_PRESETS_SEC,
} from "../types";
import { averageVote, formatAverage } from "../vote-stats";
import { t } from "./locale";
import { RoomQrCode } from "./qr-code";
import { useRoomSocket } from "./use-room-socket";

const RENAME_DEBOUNCE_MS = 400;
const DEFAULT_NAME = t.guestFallback;

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

	const roomName = state?.roomName
		? state.roomName
		: t.room.fallbackRoomName(roomId);
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
			{state?.revealed && <VoteSummary participants={state.participants} />}
			<section class="controls">
				<CardDeck selected={selectedVote} onVote={onVote} />
				<Actions
					resetDisabled={resetDisabled}
					onReveal={onReveal}
					onReset={onReset}
				>
					<Timer
						timer={state?.timer ?? null}
						onStart={(durationSec) => send({ type: "startTimer", durationSec })}
						onStop={() => send({ type: "stopTimer" })}
					/>
				</Actions>
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
			<a id="back-to-top" class="back-link" href="/">
				{t.room.backToTop}
			</a>
			<h1 id="room-name">{roomName}</h1>
			<div class="room-code">
				<span>
					{t.room.roomCode} <code>{roomId}</code>
				</span>
				<CopyLinkButton />
			</div>
			<details class="qr-toggle">
				<summary>{t.room.qrToggle}</summary>
				<RoomQrCode />
			</details>
		</div>
		<div class="header-side">
			<div class="me">
				<label>
					{t.room.displayName}
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
					{t.room.spectatorOnly}
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
			window.prompt(t.room.sharePrompt, location.href);
		}
	};

	return (
		<button id="copy-link" type="button" class="secondary" onClick={copy}>
			{copied ? t.room.copied : t.room.copyLink}
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
			<div class="name">{isMe ? t.room.me(p.name) : p.name}</div>
			<div class="vote-slot">{slot}</div>
		</div>
	);
};

const VoteSummary: FC<{ participants: Participant[] }> = ({ participants }) => {
	const average = averageVote(
		participants.filter((p) => !p.isSpectator).map((p) => p.vote),
	);
	return (
		<p id="vote-summary" class="vote-summary">
			{t.room.average}{" "}
			<strong id="vote-average">
				{average === null ? "-" : formatAverage(average)}
			</strong>
		</p>
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
	children?: Child;
}> = ({ resetDisabled, onReveal, onReset, children }) => (
	<div class="actions">
		<button id="reveal" type="button" onClick={onReveal}>
			{t.room.reveal}
		</button>
		<button id="reset" type="button" disabled={resetDisabled} onClick={onReset}>
			{t.room.reset}
		</button>
		{children}
	</div>
);

const TIMER_TICK_MS = 250;

function formatRemaining(ms: number): string {
	const totalSec = Math.ceil(ms / 1000);
	const min = Math.floor(totalSec / 60);
	const sec = totalSec % 60;
	return `${min}:${String(sec).padStart(2, "0")}`;
}

/**
 * 部屋で共有するカウントダウン。誰が開始/停止しても全員の画面に反映される。
 * `.actions` の中に置く前提で、長さの選択肢は flex-basis: 100% で操作ボタンの下の行に折り返す。
 */
const Timer: FC<{
	timer: RoomState["timer"];
	onStart: (durationSec: number) => void;
	onStop: () => void;
}> = ({ timer, onStart, onStop }) => {
	const [presetsOpen, setPresetsOpen] = useState(false);
	// state が届くたびに timer は新しいオブジェクトになるので、受信した時点を起点に終了時刻を取り直す
	const endsAt = useMemo(
		() => (timer ? Date.now() + timer.remainingMs : null),
		[timer],
	);
	const [now, setNow] = useState(Date.now());

	// useEffect はバックグラウンドタブで実行されず、戻ってくるまで表示が止まるので useLayoutEffect を使う
	useLayoutEffect(() => {
		setNow(Date.now());
		if (endsAt === null) return;
		const id = setInterval(() => {
			const current = Date.now();
			setNow(current);
			if (current >= endsAt) clearInterval(id);
		}, TIMER_TICK_MS);
		return () => clearInterval(id);
	}, [endsAt]);

	if (endsAt === null) {
		return (
			<>
				<button
					id="timer-toggle"
					type="button"
					class="secondary timer timer-toggle"
					aria-expanded={presetsOpen}
					aria-controls="timer-presets"
					onClick={() => setPresetsOpen(!presetsOpen)}
				>
					<span aria-hidden="true">⏱</span> {t.room.timerLabel}
				</button>
				{presetsOpen && (
					<div id="timer-presets" class="timer-presets">
						{TIMER_PRESETS_SEC.map((sec) => (
							<button
								key={sec}
								type="button"
								class="secondary"
								onClick={() => {
									setPresetsOpen(false);
									onStart(sec);
								}}
							>
								{t.room.timerDuration(sec)}
							</button>
						))}
					</div>
				)}
			</>
		);
	}

	const remainingMs = Math.max(0, endsAt - now);
	const timeUp = remainingMs === 0;
	return (
		<div class={timeUp ? "timer timer-running time-up" : "timer timer-running"}>
			{/* 「時間切れ」の文言だと幅が広がって行が折り返すので、見た目は赤い 0:00 にして文言は読み上げ用に回す */}
			<output
				id="timer-display"
				class="timer-display"
				aria-label={timeUp ? t.room.timeUp : undefined}
				title={timeUp ? t.room.timeUp : undefined}
			>
				<span aria-hidden="true">⏱</span> {formatRemaining(remainingMs)}
			</output>
			<button
				id="timer-stop"
				type="button"
				class="timer-stop"
				aria-label={t.room.stopTimer}
				title={t.room.stopTimer}
				onClick={onStop}
			>
				✕
			</button>
		</div>
	);
};
