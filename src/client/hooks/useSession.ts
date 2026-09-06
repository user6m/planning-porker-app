import { useEffect, useState } from "react";
import type { UserSession } from "../../shared/types";
import { api } from "../api";

interface SessionResult {
	/** 読み込み中は null */
	session: UserSession | null;
	error: string | null;
}

/** `GET /api/me` でこのブラウザのセッション(userId/表示名)を取得する */
export function useSession(): SessionResult {
	const [session, setSession] = useState<UserSession | null>(null);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		api
			.me()
			.then((result) => {
				if (!cancelled) setSession(result);
			})
			.catch((cause: unknown) => {
				if (cancelled) return;
				setError(
					cause instanceof Error
						? cause.message
						: "セッション情報を取得できませんでした",
				);
			});
		return () => {
			cancelled = true;
		};
	}, []);

	return { session, error };
}
