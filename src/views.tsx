// サーバーサイドで返す HTML。hono/jsx の関数コンポーネントで組み立てる。
//
// - ブラウザ側 (src/client/) は hono/jsx/dom を使う別世界なので、ここから import しない (逆も同様)。
// - hono/jsx は <script> の中身も含めて、文字列の子要素をすべて HTML エスケープする。
//   生の HTML/JS を出力したいときは hono/html の html`` / raw() を子要素として渡す。
// - 属性名は class / for / maxlength など HTML ネイティブの名前で書く (hono/jsx の型はそちらが正)。
// - 画面に出す文言は直書きせず src/i18n.ts の Messages から取る (日本語/英語の切り替えに対応するため)。
import { html } from "hono/html";
import type { Child, FC, PropsWithChildren } from "hono/jsx";
import pkg from "../package.json";
import { type Locale, messagesFor, otherLocale } from "./i18n";
import { RECENT_ROOM_DAYS, type RecentRoom } from "./recent-rooms";
import type { UserSession } from "./session";

// FOUC 防止: CSS が読み込まれる前に保存済みテーマを適用する (theme.js より前に同期実行される)。
// html`` に ${} を使っていないので中身はエスケープされずそのまま出力される。
const THEME_INIT_SCRIPT = html`<script>(() => { const theme = localStorage.getItem("pp-theme"); if (theme === "dark" || theme === "light") { document.documentElement.dataset.theme = theme; } })();</script>`;

// 言語の切り替えはサーバー側の描画結果ごと変わるため、Cookie に記録して描画し直す
// (/lang/:locale へのリンク → 元のページへリダイレクト)。
const LangToggle: FC<{ locale: Locale; path: string }> = ({ locale, path }) => {
	const target = otherLocale(locale);
	return (
		<a
			id="lang-toggle"
			class="lang-toggle"
			href={`/lang/${target}?to=${encodeURIComponent(path)}`}
			hreflang={target}
			lang={target}
			aria-label={messagesFor(locale).langToggleLabel}
		>
			{messagesFor(target).langName}
		</a>
	);
};

const Layout: FC<
	PropsWithChildren<{ title: string; locale: Locale; path: string }>
> = ({ title, locale, path, children }) => {
	const t = messagesFor(locale);
	return (
		<html lang={t.htmlLang}>
			<head>
				<meta charset="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
				<title>{title}</title>
				<link rel="stylesheet" href="/style.css" />
				{THEME_INIT_SCRIPT}
			</head>
			<body>
				<div class="corner-controls">
					<LangToggle locale={locale} path={path} />
					{/* theme.js の ThemeToggle がこの中身を置き換える。中のボタンは JS 実行前の見た目用 */}
					<div id="theme-toggle-root">
						<button
							id="theme-toggle"
							class="theme-toggle"
							type="button"
							aria-label={t.themeToggleLabel}
						></button>
					</div>
				</div>
				{children}
				<footer class="app-footer">v{pkg.version}</footer>
				{/* async を付けないこと: async 付きの <script src> は hono/jsx が <head> に巻き上げる */}
				<script type="module" src="/theme.js"></script>
			</body>
		</html>
	);
};

// hono/jsx は DOCTYPE を出力しないので、公式ドキュメントどおり html`` でラップして付ける
function page(locale: Locale, path: string, title: string, body: Child) {
	return html`<!doctype html>${(
		<Layout title={title} locale={locale} path={path}>
			{body}
		</Layout>
	)}`;
}

const RecentRooms: FC<{ locale: Locale; rooms: RecentRoom[] }> = ({
	locale,
	rooms,
}) => {
	const t = messagesFor(locale);
	return (
		<section class="card">
			<h2>{t.home.recentHeading}</h2>
			<p class="hint">{t.home.recentHint(RECENT_ROOM_DAYS)}</p>
			<ul class="recent-rooms">
				{rooms.map((room) => (
					<li>
						<a href={`/rooms/${encodeURIComponent(room.id)}`}>
							<span class="recent-room-name">
								{room.name || t.room.fallbackRoomName(room.id)}
							</span>
							<code>{room.id}</code>
						</a>
					</li>
				))}
			</ul>
		</section>
	);
};

const HomePage: FC<{
	locale: Locale;
	session: UserSession;
	recentRooms: RecentRoom[];
	defaultRoomName: string;
	error?: string;
}> = ({ locale, session, recentRooms, defaultRoomName, error }) => {
	const t = messagesFor(locale);
	return (
		<main class="page page-home">
			<h1>🃏 {t.appName}</h1>
			<p class="lead">{t.tagline}</p>
			{error ? <p class="error">{error}</p> : null}
			{recentRooms.length > 0 ? (
				<RecentRooms locale={locale} rooms={recentRooms} />
			) : null}
			<section class="card">
				<h2>{t.home.createHeading}</h2>
				<form method="post" action="/rooms">
					<label>
						{t.home.roomNameLabel}
						<input
							type="text"
							name="roomName"
							value={defaultRoomName}
							placeholder={t.home.roomNamePlaceholder}
							maxlength={100}
							required
						/>
					</label>
					<label>
						{t.home.hostNameLabel}
						<input
							type="text"
							name="hostName"
							value={session.name}
							maxlength={40}
							required
						/>
					</label>
					<button type="submit">{t.home.createButton}</button>
				</form>
			</section>
			<section class="card">
				<h2>{t.home.joinHeading}</h2>
				<p class="hint">{t.home.joinQrHint}</p>
				<form method="get" action="/rooms/join">
					<label>
						{t.home.roomCodeLabel}
						<input
							type="text"
							name="roomId"
							placeholder={t.home.roomCodePlaceholder}
							maxlength={16}
							required
						/>
					</label>
					<button type="submit">{t.home.joinButton}</button>
				</form>
			</section>
		</main>
	);
};

// ルーム画面。<main> の中身はブラウザ側 (src/client/app.tsx) が hono/jsx/dom で描画するので空にしておく
// (render() は container.replaceChildren で中身を丸ごと置き換えるため、ここに入れたものは消える)。
// 表示言語はブラウザ側も <html lang> から読み取る (src/client/locale.ts)。
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

export function renderHome(
	locale: Locale,
	session: UserSession,
	recentRooms: RecentRoom[],
	defaultRoomName: string,
	error?: string,
) {
	return page(
		locale,
		"/",
		messagesFor(locale).appName,
		<HomePage
			locale={locale}
			session={session}
			recentRooms={recentRooms}
			defaultRoomName={defaultRoomName}
			error={error}
		/>,
	);
}

export function renderRoom(
	locale: Locale,
	roomId: string,
	session: UserSession,
) {
	return page(
		locale,
		`/rooms/${roomId}`,
		messagesFor(locale).room.pageTitle(roomId),
		<RoomPage roomId={roomId} session={session} />,
	);
}
