import { env } from "cloudflare:test";
import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import type { Bindings } from "../src/bindings";
import app from "../src/index";

// GET /rooms/:id は部屋名を取りに Durable Object へ問い合わせるので、実際の Bindings を渡す
const testEnv = { ...env, SESSION_SECRET: "test-secret" } as Bindings;

function recentCookie(
	rooms: { id: string; name: string; visitedAt: number }[],
) {
	return `pp_recent=${encodeURIComponent(JSON.stringify(rooms))}`;
}

describe("GET /", () => {
	it("トップページを hono/jsx でレンダリングする", async () => {
		const res = await app.request("/", {}, testEnv);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toMatch(/text\/html/);

		const body = await res.text();
		expect(body.startsWith("<!doctype html>")).toBe(true);
		expect(body).toContain('<html lang="ja">');
		expect(body).toContain('class="page page-home"');
		// FOUC 防止のインラインスクリプトがエスケープされずに埋め込まれている
		expect(body).toContain('localStorage.getItem("pp-theme")');
		expect(body).toContain('id="theme-toggle-root"');
		expect(body).toContain('id="theme-toggle"');
		// 英語へ切り替えるリンク (戻り先は今のページ)
		expect(body).toContain('href="/lang/en?to=%2F"');
		expect(body).toContain(">English</a>");
		expect(body).toContain(
			`<footer class="app-footer">v${pkg.version}</footer>`,
		);
		expect(body).toContain('<script type="module" src="/theme.js"></script>');
		expect(body).not.toContain('class="error"');
		expect(body).toMatch(/name="hostName" value="ゲスト\d{4}"/);
		// 部屋名も手入力せずに済むよう、ランダムな既定値が入っている
		expect(body).toMatch(/name="roomName" value="見積もり\d{4}"/);
	});
});

describe("POST /rooms のバリデーション", () => {
	it("入力が不足していればエラー付きでトップページを 400 で返す", async () => {
		const res = await app.request(
			"/rooms",
			{
				method: "POST",
				body: new URLSearchParams({ roomName: "", hostName: "x" }),
			},
			testEnv,
		);
		expect(res.status).toBe(400);
		const body = await res.text();
		expect(body).toContain(
			'<p class="error">部屋の名前と表示名を入力してください</p>',
		);
		// 部屋名が空だったので、既定値を入れ直した状態で返す
		expect(body).toMatch(/name="roomName" value="見積もり\d{4}"/);
	});

	it("エラー時も入力済みの部屋名は残す", async () => {
		const res = await app.request(
			"/rooms",
			{
				method: "POST",
				body: new URLSearchParams({ roomName: "スプリント12", hostName: "" }),
			},
			testEnv,
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toContain('name="roomName" value="スプリント12"');
	});
});

describe("GET /rooms/:id", () => {
	it("クライアントがマウントする空の <main> と data 属性を出力する", async () => {
		const res = await app.request("/rooms/ab12cd34", {}, testEnv);
		expect(res.status).toBe(200);

		const body = await res.text();
		expect(body).toContain(
			"<title>部屋 AB12CD34 - プランニングポーカー</title>",
		);
		expect(body).toContain(
			'class="page page-room" data-room-id="AB12CD34" data-user-id="',
		);
		expect(body).toMatch(/data-user-name="ゲスト\d{4}"/);
		expect(body).toContain('<script type="module" src="/app.js"></script>');
	});

	it("ユーザー由来の値を HTML エスケープする", async () => {
		const { renderRoom } = await import("../src/views");
		const html = String(
			await renderRoom("ja", "AB12CD34", { userId: "u1", name: "<b>x</b>" }),
		);
		expect(html).toContain('data-user-name="&lt;b&gt;x&lt;/b&gt;"');
		expect(html).not.toContain("<b>x</b>");
	});
});

describe("表示言語", () => {
	const en = { "accept-language": "en-US,en;q=0.9" };

	it("Accept-Language が英語ならトップページを英語で返す", async () => {
		const res = await app.request("/", { headers: en }, testEnv);
		const body = await res.text();
		expect(body).toContain('<html lang="en">');
		expect(body).toContain("<title>Planning Poker</title>");
		expect(body).toContain("<h2>Create a new room</h2>");
		expect(body).toContain("<h2>Join a room</h2>");
		expect(body).toMatch(/name="hostName" value="Guest\d{4}"/);
		expect(body).toMatch(/name="roomName" value="Estimate \d{4}"/);
		// 切り替えリンクは日本語に戻すためのもの
		expect(body).toContain('href="/lang/ja?to=%2F"');
		expect(body).toContain(">日本語</a>");
	});

	it("対応していない言語の Accept-Language は既定 (日本語) で返す", async () => {
		const res = await app.request(
			"/",
			{ headers: { "accept-language": "fr-FR,fr;q=0.9" } },
			testEnv,
		);
		expect(await res.text()).toContain('<html lang="ja">');
	});

	it("ルーム画面のタイトルと切り替えリンクも英語になる", async () => {
		const res = await app.request("/rooms/ab12cd34", { headers: en }, testEnv);
		const body = await res.text();
		expect(body).toContain("<title>Room AB12CD34 - Planning Poker</title>");
		expect(body).toContain('href="/lang/ja?to=%2Frooms%2FAB12CD34"');
	});

	it("英語で作成に失敗したときのエラーも英語で返す", async () => {
		const res = await app.request(
			"/rooms",
			{
				method: "POST",
				headers: en,
				body: new URLSearchParams({ roomName: "", hostName: "x" }),
			},
			testEnv,
		);
		expect(res.status).toBe(400);
		expect(await res.text()).toContain(
			'<p class="error">Enter a room name and your display name</p>',
		);
	});

	it("GET /lang/:locale は Cookie に記録して元のページへ戻す", async () => {
		const res = await app.request(
			"/lang/en?to=%2Frooms%2FAB12CD34",
			{},
			testEnv,
		);
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("/rooms/AB12CD34");
		expect(res.headers.get("set-cookie")).toMatch(/pp_lang=en/);
	});

	it("Cookie の言語は Accept-Language より優先される", async () => {
		const res = await app.request(
			"/",
			{ headers: { ...en, cookie: "pp_lang=ja" } },
			testEnv,
		);
		expect(await res.text()).toContain('<html lang="ja">');
	});

	it("未対応の言語コードや外部URLへの戻り先は無視する", async () => {
		const res = await app.request(
			"/lang/fr?to=https%3A%2F%2Fevil.example",
			{},
			testEnv,
		);
		expect(res.status).toBe(303);
		expect(res.headers.get("location")).toBe("/");
		expect(res.headers.get("set-cookie")).toBeNull();

		const openRedirect = await app.request(
			"/lang/en?to=%2F%2Fevil.example",
			{},
			testEnv,
		);
		expect(openRedirect.headers.get("location")).toBe("/");
	});
});

describe("最近開いた部屋", () => {
	const DAY_MS = 24 * 60 * 60 * 1000;

	it("部屋を開くと部屋名つきで Cookie に記録する", async () => {
		const created = await app.request(
			"/rooms",
			{
				method: "POST",
				body: new URLSearchParams({ roomName: "スプリント12", hostName: "x" }),
			},
			testEnv,
		);
		const location = created.headers.get("location") ?? "";
		const roomId = location.split("/").pop();

		const res = await app.request(location, {}, testEnv);
		const cookie = res.headers.get("set-cookie") ?? "";
		const value = /pp_recent=([^;]+)/.exec(cookie)?.[1] ?? "";
		const rooms = JSON.parse(decodeURIComponent(value));
		expect(rooms).toHaveLength(1);
		expect(rooms[0]).toMatchObject({ id: roomId, name: "スプリント12" });
	});

	it("同じ部屋は先頭にまとめ、既存の履歴を後ろに残す", async () => {
		const now = Date.now();
		const res = await app.request(
			"/rooms/bbbb2222",
			{
				headers: {
					cookie: recentCookie([
						{ id: "AAAA1111", name: "A", visitedAt: now - 1000 },
						{ id: "BBBB2222", name: "", visitedAt: now - 2000 },
					]),
				},
			},
			testEnv,
		);
		const value = /pp_recent=([^;]+)/.exec(
			res.headers.get("set-cookie") ?? "",
		)?.[1];
		const rooms = JSON.parse(decodeURIComponent(value ?? ""));
		expect(rooms.map((r: { id: string }) => r.id)).toEqual([
			"BBBB2222",
			"AAAA1111",
		]);
	});

	it("トップページに期限内の部屋だけをリンクで表示する", async () => {
		const now = Date.now();
		const res = await app.request(
			"/",
			{
				headers: {
					cookie: recentCookie([
						{ id: "AAAA1111", name: "<b>見積もり</b>", visitedAt: now },
						{ id: "BBBB2222", name: "", visitedAt: now - DAY_MS },
						{ id: "CCCC3333", name: "古い部屋", visitedAt: now - 15 * DAY_MS },
					]),
				},
			},
			testEnv,
		);
		const body = await res.text();
		expect(body).toContain("<h2>最近開いた部屋</h2>");
		expect(body).toContain('href="/rooms/AAAA1111"');
		expect(body).toContain("&lt;b&gt;見積もり&lt;/b&gt;");
		// 名前の無い部屋はルーム画面と同じ既定の名前で出す
		expect(body).toContain("部屋 BBBB2222");
		expect(body).not.toContain("CCCC3333");
	});

	it("履歴が無い/壊れているときはセクションを出さない", async () => {
		for (const cookie of ["", "pp_recent=not-json", "pp_recent=%7B%7D"]) {
			const res = await app.request("/", { headers: { cookie } }, testEnv);
			expect(await res.text()).not.toContain("最近開いた部屋");
		}
	});
});
