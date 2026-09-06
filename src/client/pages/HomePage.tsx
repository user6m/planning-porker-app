import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router";
import { normalizeRoomId, ROOM_ID_MAX_LENGTH } from "../../shared/room-id";
import { MAX_NAME_LENGTH, MAX_ROOM_NAME_LENGTH } from "../../shared/types";
import { api } from "../api";
import { useSession } from "../hooks/useSession";

/** フォームのテキスト項目を取り出す（ファイル入力など文字列以外は空文字扱い） */
function formText(form: FormData, key: string): string {
	const value = form.get(key);
	return typeof value === "string" ? value.trim() : "";
}

export function HomePage() {
	const { session, error: sessionError } = useSession();
	const navigate = useNavigate();
	const [submitting, setSubmitting] = useState(false);
	const [formError, setFormError] = useState<string | null>(null);

	const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const roomName = formText(form, "roomName");
		const hostName = formText(form, "hostName");
		if (!roomName || !hostName) {
			setFormError("部屋の名前と表示名を入力してください");
			return;
		}

		setSubmitting(true);
		setFormError(null);
		try {
			const { roomId } = await api.createRoom({ roomName, hostName });
			await navigate(`/rooms/${roomId}`);
		} catch (cause: unknown) {
			setFormError(
				cause instanceof Error ? cause.message : "部屋を作成できませんでした",
			);
			setSubmitting(false);
		}
	};

	const handleJoin = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();
		const form = new FormData(event.currentTarget);
		const roomId = normalizeRoomId(formText(form, "roomId"));
		if (!roomId) return;
		void navigate(`/rooms/${roomId}`);
	};

	return (
		<main className="page page-home">
			<title>プランニングポーカー</title>
			<h1>🃏 プランニングポーカー</h1>
			<p className="lead">
				チームでリアルタイムに見積もりポイントを出し合えるツールです。
			</p>
			{sessionError ? <p className="error">{sessionError}</p> : null}
			{formError ? <p className="error">{formError}</p> : null}

			<section className="card">
				<h2>新しい部屋を作る</h2>
				{session ? (
					<form onSubmit={handleCreate}>
						<label>
							部屋の名前
							<input
								type="text"
								name="roomName"
								placeholder="例: スプリント12 見積もり"
								maxLength={MAX_ROOM_NAME_LENGTH}
								required
							/>
						</label>
						<label>
							あなたの表示名
							<input
								type="text"
								name="hostName"
								defaultValue={session.name}
								maxLength={MAX_NAME_LENGTH}
								required
							/>
						</label>
						<button type="submit" disabled={submitting}>
							{submitting ? "作成中…" : "部屋を作成"}
						</button>
					</form>
				) : (
					<p className="status">読み込み中…</p>
				)}
			</section>

			<section className="card">
				<h2>部屋に参加する</h2>
				<form onSubmit={handleJoin}>
					<label>
						部屋コード
						<input
							type="text"
							name="roomId"
							placeholder="例: AB12CD34"
							maxLength={ROOM_ID_MAX_LENGTH}
							autoCapitalize="characters"
							autoComplete="off"
							required
						/>
					</label>
					<button type="submit">参加する</button>
				</form>
			</section>
		</main>
	);
}
