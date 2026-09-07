import { defineConfig } from "vite";

// ブラウザ側 (src/client/*.tsx) 専用のバンドル設定。
// - Worker 本体 (src/index.ts など) は従来どおり wrangler (esbuild) がバンドルするので、ここでは扱わない。
// - 出力先の dist/ が wrangler.jsonc の assets.directory になり、Workers Static Assets としてそのまま配信される。
// - 開発時は `vite build --watch` で dist/ を更新し続け、それを `wrangler dev` が配信する (@cloudflare/vite-plugin は使わない)。
// - Vite 8 は esbuild ではなく oxc で TSX を変換する。JSX ランタイムはブラウザ向けの hono/jsx/dom
//   (サーバー側の tsconfig.json は hono/jsx なので、src/client/tsconfig.json と合わせてここでも明示する)。
export default defineConfig({
	// public/ (style.css) はビルドのたびにそのまま dist/ へコピーされる
	publicDir: "public",
	oxc: {
		jsx: {
			runtime: "automatic",
			importSource: "hono/jsx/dom",
		},
	},
	build: {
		outDir: "dist",
		emptyOutDir: true,
		copyPublicDir: true,
		// HTML エントリではないので preload polyfill は注入されないが、意図を明示しておく
		modulePreload: { polyfill: false },
		rolldownOptions: {
			input: {
				app: "src/client/app.tsx",
				theme: "src/client/theme.tsx",
			},
			output: {
				format: "es",
				// ハッシュ無しの固定名で出力し、src/views.tsx の <script type="module" src="/app.js"> 等と一致させる。
				// Workers Static Assets は max-age=0, must-revalidate + ETag を付けるのでキャッシュバスターは不要。
				entryFileNames: "[name].js",
				// app.js と theme.js が共有する hono/jsx/dom ランタイムはハッシュ付きチャンクに分離される
				chunkFileNames: "chunks/[name]-[hash].js",
				assetFileNames: "[name][extname]",
			},
		},
	},
});
