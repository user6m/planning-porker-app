import { cloudflare } from "@cloudflare/vite-plugin";
import { cloudflareTest } from "@cloudflare/vitest-pool-workers";
import react from "@vitejs/plugin-react";
import { defineConfig, lazyPlugins } from "vite-plus";
import pkg from "./package.json";

/**
 * Vite+ の設定。dev/build (Vite) に加えて test (Vitest) / lint (Oxlint) / fmt (Oxfmt) の
 * 設定もこの1ファイルにまとめている (https://viteplus.dev/config/)。
 */
export default defineConfig(({ mode }) => ({
	// package.json の version (CalVer) を画面のフッターに表示するために埋め込む
	define: {
		__APP_VERSION__: JSON.stringify(pkg.version),
	},

	environments: {
		// Worker 側 (Vite environment 名 = wrangler.jsonc の name のハイフンをアンダースコアにしたもの)。
		// 以前の `wrangler deploy --minify` と同様に、デプロイするバンドルを minify する
		planning_porker_app: {
			build: { minify: true },
		},
	},

	// `vp dev` / `vp build` で使うプラグイン。
	// - react: React Fast Refresh (HMR)
	// - cloudflare: Worker (src/worker/index.ts) を workerd 上で動かし、
	//   ビルド時は dist/ に Worker と静的アセット、デプロイ用の wrangler.json を出力する
	// Vitest 実行時 (mode === "test") は test.projects 側で個別に指定するのでここでは空にする。
	// lazyPlugins: `vp lint` などが lint/fmt ブロックを読むためだけに設定を評価するときはプラグインを初期化しない。
	plugins: lazyPlugins(() => (mode === "test" ? [] : [react(), cloudflare()])),

	test: {
		projects: [
			{
				// Worker / Durable Object のテスト。実際の Workers ランタイム (Miniflare) 上で実行する
				extends: true,
				plugins: [
					cloudflareTest({ wrangler: { configPath: "./wrangler.jsonc" } }),
				],
				test: {
					name: "worker",
					include: ["test/**/*.test.ts"],
				},
			},
			{
				// React コンポーネント / 共有ロジックのテスト。jsdom 上で実行する
				extends: true,
				plugins: [react()],
				test: {
					name: "client",
					include: ["src/client/**/*.test.{ts,tsx}", "src/shared/**/*.test.ts"],
					environment: "jsdom",
					setupFiles: ["./src/client/test-setup.ts"],
				},
			},
		],
	},

	// Oxlint (https://oxc.rs/docs/guide/usage/linter/config.html)
	lint: {
		ignorePatterns: ["dist/**", ".wrangler/**", "worker-configuration.d.ts"],
		plugins: ["eslint", "typescript", "unicorn", "oxc", "react"],
		options: {
			// tsgolint (TypeScript 7 / Go 版) による型情報付き lint と型チェックを `vp check` で行う
			typeAware: true,
			typeCheck: true,
		},
		overrides: [
			{
				files: ["src/client/**", "index.html"],
				env: { browser: true },
				globals: { __APP_VERSION__: "readonly" },
			},
			{
				files: ["src/worker/**", "test/**"],
				env: { worker: true },
			},
			{
				files: ["**/*.test.{ts,tsx}", "src/client/test-setup.ts"],
				plugins: ["vitest"],
			},
			{
				files: ["vite.config.ts", "scripts/**"],
				env: { node: true },
			},
		],
	},

	// Oxfmt (https://oxc.rs/docs/guide/usage/formatter/config.html)
	fmt: {
		ignorePatterns: [
			"dist/**",
			".wrangler/**",
			"worker-configuration.d.ts",
			// Issue テンプレートは空行の位置に意味があるので整形しない
			".github/ISSUE_TEMPLATE/**",
		],
		// Biome 時代からのタブインデント + 80桁を維持する
		useTabs: true,
		printWidth: 80,
		overrides: [
			{
				// wrangler.jsonc などは末尾カンマ無しの一般的な JSONC の書き方にしておく
				files: ["*.jsonc"],
				options: { trailingComma: "none" },
			},
		],
	},
}));
