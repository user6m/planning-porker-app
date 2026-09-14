import { describe, expect, it } from "vitest";
import pkg from "../package.json";
import type { Bindings } from "../src/bindings";
import app from "../src/index";

// ここで叩くルートは Durable Object に到達しないので、Cookie 署名用のダミー env で十分
const testEnv = { SESSION_SECRET: "test-secret" } as unknown as Bindings;

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
			await renderRoom("AB12CD34", { userId: "u1", name: "<b>x</b>" }),
		);
		expect(html).toContain('data-user-name="&lt;b&gt;x&lt;/b&gt;"');
		expect(html).not.toContain("<b>x</b>");
	});
});
