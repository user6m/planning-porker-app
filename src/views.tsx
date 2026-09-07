// サーバーサイドで返す HTML。hono/jsx の関数コンポーネントで組み立てる。
//
// - ブラウザ側 (src/client/) は hono/jsx/dom を使う別世界なので、ここから import しない (逆も同様)。
// - hono/jsx は <script> の中身も含めて、文字列の子要素をすべて HTML エスケープする。
//   生の HTML/JS を出力したいときは hono/html の html`` / raw() を子要素として渡す。
// - 属性名は class / for / maxlength など HTML ネイティブの名前で書く (hono/jsx の型はそちらが正)。
import { html } from "hono/html";
import type { Child, FC, PropsWithChildren } from "hono/jsx";
import pkg from "../package.json";
import type { UserSession } from "./session";

// FOUC 防止: CSS が読み込まれる前に保存済みテーマを適用する (theme.js より前に同期実行される)。
// html`` に ${} を使っていないので中身はエスケープされずそのまま出力される。
const THEME_INIT_SCRIPT = html`<script>(() => { const theme = localStorage.getItem("pp-theme"); if (theme === "dark" || theme === "light") { document.documentElement.dataset.theme = theme; } })();</script>`;

const Layout: FC<PropsWithChildren<{ title: string }>> = ({
	title,
	children,
}) => (
	<html lang="ja">
		<head>
			<meta charset="UTF-8" />
			<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			<title>{title}</title>
			<link rel="stylesheet" href="/style.css" />
			{THEME_INIT_SCRIPT}
		</head>
		<body>
			{/* theme.js の ThemeToggle がこの中身を置き換える。中のボタンは JS 実行前の見た目用 */}
			<div id="theme-toggle-root">
				<button
					id="theme-toggle"
					class="theme-toggle"
					type="button"
					aria-label="表示テーマを切り替え"
				></button>
			</div>
			{children}
			<footer class="app-footer">v{pkg.version}</footer>
			{/* async を付けないこと: async 付きの <script src> は hono/jsx が <head> に巻き上げる */}
			<script type="module" src="/theme.js"></script>
		</body>
	</html>
);

// hono/jsx は DOCTYPE を出力しないので、公式ドキュメントどおり html`` でラップして付ける
function page(title: string, body: Child) {
	return html`<!doctype html>${<Layout title={title}>{body}</Layout>}`;
}

const HomePage: FC<{ session: UserSession; error?: string }> = ({
	session,
	error,
}) => (
	<main class="page page-home">
		<h1>🃏 プランニングポーカー</h1>
		<p class="lead">
			チームでリアルタイムに見積もりポイントを出し合えるツールです。
		</p>
		{error ? <p class="error">{error}</p> : null}
		<section class="card">
			<h2>新しい部屋を作る</h2>
			<form method="post" action="/rooms">
				<label>
					部屋の名前
					<input
						type="text"
						name="roomName"
						placeholder="例: スプリント12 見積もり"
						maxlength={100}
						required
					/>
				</label>
				<label>
					あなたの表示名
					<input
						type="text"
						name="hostName"
						value={session.name}
						maxlength={40}
						required
					/>
				</label>
				<button type="submit">部屋を作成</button>
			</form>
		</section>
		<section class="card">
			<h2>部屋に参加する</h2>
			<form method="get" action="/rooms/join">
				<label>
					部屋コード
					<input
						type="text"
						name="roomId"
						placeholder="例: AB12CD34"
						maxlength={16}
						required
					/>
				</label>
				<button type="submit">参加する</button>
			</form>
		</section>
	</main>
);

// ルーム画面。<main> の中身はブラウザ側 (src/client/app.tsx) が hono/jsx/dom で描画するので空にしておく
// (render() は container.replaceChildren で中身を丸ごと置き換えるため、ここに入れたものは消える)。
const RoomPage: FC<{ roomId: string; session: UserSession }> = ({
	roomId,
	session,
}) => (
	<>
		<main
			class="page page-room"
			data-room-id={roomId}
			data-user-id={session.userId}
			data-user-name={session.name}
		></main>
		<script type="module" src="/app.js"></script>
	</>
);

export function renderHome(session: UserSession, error?: string) {
	return page(
		"プランニングポーカー",
		<HomePage session={session} error={error} />,
	);
}

export function renderRoom(roomId: string, session: UserSession) {
	return page(
		`部屋 ${roomId} - プランニングポーカー`,
		<RoomPage roomId={roomId} session={session} />,
	);
}
