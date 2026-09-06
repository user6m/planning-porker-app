import type {
	ApiErrorResponse,
	CreateRoomRequest,
	CreateRoomResponse,
	UpdateSessionRequest,
	UserSession,
} from "../shared/types";

/** API が 2xx 以外を返したときに投げるエラー。`message` にはサーバーからのメッセージが入る */
export class ApiRequestError extends Error {
	readonly status: number;

	constructor(message: string, status: number) {
		super(message);
		this.name = "ApiRequestError";
		this.status = status;
	}
}

async function requestJson<T>(
	path: string,
	init: RequestInit = {},
): Promise<T> {
	const headers = new Headers(init.headers);
	headers.set("accept", "application/json");
	if (init.body !== undefined) {
		headers.set("content-type", "application/json");
	}

	const response = await fetch(path, {
		// セッション Cookie (pp_session) を必ず送る
		credentials: "same-origin",
		...init,
		headers,
	});

	if (!response.ok) {
		let message = `リクエストに失敗しました (HTTP ${response.status})`;
		try {
			const body = (await response.json()) as Partial<ApiErrorResponse>;
			if (typeof body.error === "string") message = body.error;
		} catch {
			// JSON でないエラーレスポンスはステータスコードだけ伝える
		}
		throw new ApiRequestError(message, response.status);
	}

	return (await response.json()) as T;
}

/** Worker (src/worker/index.ts) が提供する JSON API のクライアント */
export const api = {
	/** 自分のセッション(userId/表示名)を取得する。初回アクセス時はサーバーが新規発行する */
	me: () => requestJson<UserSession>("/api/me"),

	/** 表示名を変更する */
	rename: (name: string) =>
		requestJson<UserSession>("/api/me", {
			method: "PATCH",
			body: JSON.stringify({ name } satisfies UpdateSessionRequest),
		}),

	/** 部屋を作成し、発行された部屋コードを返す */
	createRoom: (input: CreateRoomRequest) =>
		requestJson<CreateRoomResponse>("/api/rooms", {
			method: "POST",
			body: JSON.stringify(input),
		}),
};

/** 部屋の WebSocket エンドポイントの URL (ページと同じオリジン) */
export function roomSocketUrl(roomId: string): string {
	const protocol = location.protocol === "https:" ? "wss" : "ws";
	return `${protocol}://${location.host}/api/rooms/${encodeURIComponent(roomId)}/ws`;
}
