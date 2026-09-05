import { Hono } from "hono";
import { describe, expect, it } from "vitest";
import type { Bindings } from "../src/bindings";
import { getOrCreateSession, persistSession } from "../src/session";

function makeApp() {
	const app = new Hono<{ Bindings: Bindings }>();
	app.get("/whoami", async (c) => {
		const session = await getOrCreateSession(c);
		return c.json(session);
	});
	app.post("/rename", async (c) => {
		const session = await getOrCreateSession(c);
		const renamed = { ...session, name: "リネーム後" };
		await persistSession(c, renamed);
		return c.json(renamed);
	});
	return app;
}

// このテストは Cookie の署名/検証だけを見るので、DurableObjectNamespace はダミーで十分
const testEnv = { SESSION_SECRET: "test-secret" } as unknown as Bindings;

describe("session cookie", () => {
	it("issues a new session with a Set-Cookie header when none exists", async () => {
		const app = makeApp();
		const res = await app.request("/whoami", {}, testEnv);
		expect(res.status).toBe(200);
		expect(res.headers.get("set-cookie")).toMatch(/pp_session=/);

		const body = await res.json<{ userId: string; name: string }>();
		expect(body.userId).toMatch(/^[0-9a-f-]{36}$/);
		expect(body.name).toMatch(/^ゲスト\d{4}$/);
	});

	it("reuses the same identity across requests that send the cookie back", async () => {
		const app = makeApp();
		const first = await app.request("/whoami", {}, testEnv);
		const cookie = first.headers.get("set-cookie")?.split(";")[0];
		expect(cookie).toBeTruthy();

		const second = await app.request(
			"/whoami",
			{ headers: { cookie: cookie ?? "" } },
			testEnv,
		);
		const firstBody = await first.json<{ userId: string }>();
		const secondBody = await second.json<{ userId: string }>();
		expect(secondBody.userId).toBe(firstBody.userId);
	});

	it("rejects a tampered cookie and issues a fresh session instead", async () => {
		const app = makeApp();
		const first = await app.request("/whoami", {}, testEnv);
		const rawCookie = first.headers.get("set-cookie")?.split(";")[0] ?? "";
		const tampered = `${rawCookie}tampered`;

		const second = await app.request(
			"/whoami",
			{ headers: { cookie: tampered } },
			testEnv,
		);
		const firstBody = await first.json<{ userId: string }>();
		const secondBody = await second.json<{ userId: string }>();
		expect(secondBody.userId).not.toBe(firstBody.userId);
	});

	it("persists a renamed session back into the cookie", async () => {
		const app = makeApp();
		const res = await app.request("/rename", { method: "POST" }, testEnv);
		// getOrCreateSession (新規発行) と persistSession (リネーム) の2回分 Set-Cookie が付くので、最後の値を使う
		const setCookies = res.headers.getSetCookie();
		const cookie = setCookies.at(-1)?.split(";")[0];

		const check = await app.request(
			"/whoami",
			{ headers: { cookie: cookie ?? "" } },
			testEnv,
		);
		const body = await check.json<{ name: string }>();
		expect(body.name).toBe("リネーム後");
	});
});
