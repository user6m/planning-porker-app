import { html } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import pkg from "../package.json";
import type { UserSession } from "./session";

function layout(
	title: string,
	body: HtmlEscapedString | Promise<HtmlEscapedString>,
) {
	return html`<!doctype html>
<html lang="ja">
	<head>
		<meta charset="UTF-8" />
		<meta name="viewport" content="width=device-width, initial-scale=1.0" />
		<title>${title}</title>
		<link rel="stylesheet" href="/style.css" />
	</head>
	<body>
		${body}
		<footer class="app-footer">v${pkg.version}</footer>
	</body>
</html>`;
}

export function renderHome(session: UserSession, error?: string) {
	return layout(
		"プランニングポーカー",
		html`<main class="page page-home">
			<h1>🃏 プランニングポーカー</h1>
			<p class="lead">チームでリアルタイムに見積もりポイントを出し合えるツールです。</p>
			${error ? html`<p class="error">${error}</p>` : ""}
			<section class="card">
				<h2>新しい部屋を作る</h2>
				<form method="post" action="/rooms">
					<label>
						部屋の名前
						<input type="text" name="roomName" placeholder="例: スプリント12 見積もり" maxlength="100" required />
					</label>
					<label>
						あなたの表示名
						<input type="text" name="hostName" value="${session.name}" maxlength="40" required />
					</label>
					<button type="submit">部屋を作成</button>
				</form>
			</section>
			<section class="card">
				<h2>部屋に参加する</h2>
				<form method="get" action="/rooms/join">
					<label>
						部屋コード
						<input type="text" name="roomId" placeholder="例: AB12CD34" maxlength="16" required />
					</label>
					<button type="submit">参加する</button>
				</form>
			</section>
		</main>`,
	);
}

export function renderRoom(roomId: string, session: UserSession) {
	return layout(
		`部屋 ${roomId} - プランニングポーカー`,
		html`<main class="page page-room" data-room-id="${roomId}" data-user-id="${session.userId}" data-user-name="${session.name}">
			<header class="room-header">
				<div>
					<h1 id="room-name">部屋 ${roomId}</h1>
					<p class="room-code">
						部屋コード: <code>${roomId}</code>
						<button id="copy-link" type="button">招待リンクをコピー</button>
					</p>
				</div>
				<div class="me">
					<label>
						表示名
						<input id="my-name" type="text" value="${session.name}" maxlength="40" />
					</label>
					<label class="spectator-toggle">
						<input id="spectator" type="checkbox" />
						観戦のみ
					</label>
				</div>
			</header>

			<section class="participants" id="participants" aria-live="polite"></section>

			<section class="controls">
				<div class="cards" id="cards"></div>
				<div class="actions">
					<button id="reveal" type="button">公開する</button>
					<button id="reset" type="button">リセット</button>
				</div>
			</section>

			<p id="connection-status" class="status" role="status"></p>
		</main>
		<script src="/app.js"></script>`,
	);
}
