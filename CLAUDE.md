# CLAUDE.md

このファイルは、このリポジトリでコード作業を行うAIコーディングエージェント（Claude Codeなど）向けのガイドです。

## プロジェクト概要

複数人でリアルタイムに見積もりポイントを出し合うプランニングポーカーアプリ。
Cloudflare Workers上で動くHonoアプリ + Durable Objects（部屋の状態管理）で構成されている。
公開URL: https://planning-porker-app.te0.workers.dev/

詳細な背景・アーキテクチャの解説は [README.md](README.md) と [docs/SESSION.md](docs/SESSION.md) を参照。

## 技術スタック

- 言語: TypeScript
- フレームワーク: [Hono](https://hono.dev/)
- 実行環境: Cloudflare Workers
- 状態管理: Durable Objects（部屋ごとに1インスタンス、WebSocket Hibernation APIを使用）
- ユーザー識別: サーバー側にDBを持たない、HMAC署名付きCookie
- 画面: サーバー側は `hono/jsx` の関数コンポーネント（`src/views.tsx`）、ブラウザ側は `hono/jsx/dom` の関数コンポーネント（`src/client/*.tsx`）。React/Preact は使わない
- ビルド: ブラウザ側のみ Vite 8（rolldown/oxc）で `src/client/` → `dist/` にバンドルする（`public/style.css` はコピー）。Worker 本体は従来通り wrangler がバンドル。開発サーバーは `wrangler dev` のまま（`@cloudflare/vite-plugin` は使わない）
- Lint/Format: [Biome](https://biomejs.dev/)（タブインデント、ダブルクォート）
- テスト: Vitest + `@cloudflare/vitest-pool-workers`（実際のWorkersランタイム=Miniflare上で実行）

## よく使うコマンド

```bash
pnpm install       # 依存関係のインストール
pnpm dev           # vite build → (vite build --watch + wrangler dev) を並行起動 (http://localhost:8787)
pnpm build         # ブラウザ側バンドル (dist/) を生成
pnpm typecheck     # 型チェック (tsconfig.json と src/client/tsconfig.json の両方)
pnpm lint          # Biomeによるlint
pnpm fix           # Biomeによる自動修正
pnpm test          # テスト実行 (vitest run)。dist/ が無くても動く
pnpm test:watch    # テストのwatchモード
pnpm deploy        # vite build してから本番デプロイ (wrangler deploy --minify)
pnpm cf-typegen    # wrangler.jsonc からBindingsの型を生成
```

コードを変更したら、コミット前に `pnpm typecheck` / `pnpm lint` / `pnpm build` / `pnpm test` を通すこと。

## ローカル開発時のシークレット

`SESSION_SECRET` はgit管理対象外の `.dev.vars` に設定する（`wrangler dev` が自動読み込みする）。

```
SESSION_SECRET=dev-only-secret-change-me
```

## 本番デプロイ時の注意（重要）

- `SESSION_SECRET` は `wrangler.jsonc` の `vars` に**絶対に書かない**こと。書くとデプロイのたびに平文の値でシークレットが上書きされる。
- 本番用のシークレットは `pnpm exec wrangler secret put SESSION_SECRET` で設定する。
- `wrangler.jsonc` の `assets.directory` は `./dist`（`pnpm build` の出力）。`dist/` が無いと `wrangler dev` / `wrangler deploy` は起動時に失敗するので、直接実行する前に `pnpm build` を行う（`pnpm dev` / `pnpm deploy` / CI は自動で行う）。

## バージョニング（CalVer）

`package.json` の `version` はセマンティックバージョニングではなく **CalVer (`YYYY.MM.MICRO`)** を採用している（例: `2026.9.0`）。

- `YYYY.MM`: リリースした年月（UTC）
- `MICRO`: 同じ年月内で何回目のリリースか（0始まり）。月が変わったら0にリセットされる

CI (`.github/workflows/ci.yml`) の `deploy` ジョブが、mainへのpushで本番デプロイに成功した直後に自動で

1. `scripts/bump-calver.mjs`（`pnpm version:bump`）で既存の `v<year>.<month>.*` タグから次のバージョンを算出し `package.json` に書き込む
2. `package.json` に差分がある場合、`chore/release-vX.Y.Z` ブランチを作って `chore: release vX.Y.Z` コミットをpushし、`chore: release vX.Y.Z` PRを作成した上でGitHub Nativeのauto-merge（squash）を予約する（前回リリースと同じバージョンで差分が無い場合はコミット・PR作成をスキップし3.へ）
3. 差分が無かった場合はその場で `vX.Y.Z` のgitタグを作成・push（既にタグが存在する場合は作成しない）
4. 2.のPRがマージされたら（Required status check通過後、squashコミットは `[skip ci]` 付きでmainに着地する）、そのマージをトリガーに `release-tag` ジョブが起動し、`vX.Y.Z` のgitタグを作成・push
5. タグを新規作成できた場合のみ、`gh release create --generate-notes` でそのタグのGitHub Releaseを作成（3.は `deploy` ジョブが、4.は `release-tag` ジョブが行う）

mainブランチには「PR経由の変更のみ許可」「署名済みコミット必須」というリポジトリルールが設定されているため、CIから直接 `git push origin HEAD:main` することはできない。そのためバージョンバンプはPR＋auto-merge（squash）を経由する（squashマージ時にGitHub自身が作るコミットは自動的に署名済み扱いになる）。

手動でのバージョン更新は不要。ローカルで次のバージョンを確認したいだけなら `pnpm version:bump` を実行する（`package.json` が書き換わるので確認後は `git checkout -- package.json` で戻すこと）。

**前提設定:** リポジトリの Settings → General → Pull Requests で **Allow auto-merge** を有効にしておく必要がある（無効だと `gh pr merge --auto` が失敗する）。

なお `deploy` ジョブは、変更ファイルが `**/*.md` / `docs/**` / `.github/ISSUE_TEMPLATE/**` / `.github/dependabot.yml` / `LICENSE` のようなドキュメント類だけの場合はスキップされる（`changes` ジョブが判定）。本番に影響するコード・設定の変更（`src/`, `public/`, `vite.config.ts`, `wrangler.jsonc`, `package.json` など）が含まれるpushでのみ実際にデプロイ・バージョン付与が行われる。

## アーキテクチャ・主要ファイル

```
src/
  index.ts                    # Honoアプリのエントリポイント・ルーティング
  session.ts                  # 署名付きCookieによるユーザーセッション（DBなし）
  bindings.ts                 # Cloudflare Bindingsの型定義
  types.ts                    # 部屋の状態・WebSocketメッセージの型（ブラウザ側とも共有）
  views.tsx                   # サーバーサイドで返すHTML（hono/jsx の関数コンポーネント）
  durable-objects/
    poker-room.ts             # 部屋(プランニングセッション)を表すDurable Object
  client/                     # ブラウザ側（hono/jsx/dom）。Vite で dist/ にバンドルされ、Worker からは import しない
    app.tsx                   # ルーム画面のエントリ（.page-room の data-* を読んで RoomApp を render）
    room.tsx                  # ルーム画面のコンポーネント群
    use-room-socket.ts        # WebSocket 接続・再接続・join を担う hook
    theme.tsx                 # ダークモード切り替え（ThemeToggle）
    tsconfig.json             # ブラウザ用 tsconfig（DOM lib + jsxImportSource: hono/jsx/dom）
public/
  style.css                   # 静的ファイルのソース（vite build が dist/ にコピー）
dist/                         # vite build の出力（git 管理外。wrangler の assets.directory）
vite.config.ts                # ブラウザ側バンドルの設定
docs/
  SESSION.md                  # セッション/Durable Objects実装の解説（学習用）
test/
  poker-room.test.ts
  session.test.ts
  views.test.ts               # ルート経由でレンダリング結果を検証
```

- 部屋の状態（参加者・投票）はDurable Objectの `ctx.storage` に永続化される。メモリ上にしか保持しないとハイバネート時に消える。
- WebSocket通信はHibernation API（`acceptWebSocket` / `webSocketMessage` / `webSocketClose`）を使う。誰も通信していない間はDOをスリープさせる前提の実装なので、状態はメッセージ処理のたびに `ctx.storage` へ書き戻す必要がある。
- ユーザー識別はCookie（`pp_session`）のみで、ログイン機能やDBは存在しない。

### JSX / コンポーネントのルール

- `src/client` は Worker から import しない（サーバー側 tsconfig は DOM の型を含まず、ブラウザ側は Workers の型を含まない）。共有してよいのは `src/types.ts` だけ。
- ブラウザ側のコードは `render` も hooks も型もすべて `hono/jsx/dom` から import する（`hono/jsx` の `Fragment` / `memo` はサーバー実装なので混ぜない）。
- JSX の属性は `class` / `for` / `maxlength` など HTML 名で書く（hono/jsx の型はそちらが正）。
- サーバー側で生の HTML/JS（DOCTYPE、FOUC 防止スクリプト、SVG など）を出力するときは `hono/html` の `html` タグ付きテンプレート / `raw()` を子要素として渡す。hono/jsx は `<script>` の中身も含めて文字列をエスケープする。`<script src>` に `async` を付けると `<head>` に巻き上げられるので付けない。
- ルーム画面の `<main class="page page-room">` の中身はブラウザ側が丸ごと描画する（`render()` は `replaceChildren` で置き換えるため、SSR で中に入れたものは消える）。サーバーから追加の HTML を渡したい場合は `<main>` の外に置く。
- ブラウザ側の WebSocket 接続は `useLayoutEffect` で開始する（`useEffect` は requestAnimationFrame 経由で遅延され、バックグラウンドタブでは実行されない）。`setState` はマイクロタスクでまとめて反映されるので、同じハンドラ内で送信に使う値はイベントや ref から直接取る。
- DOM の id / class を変えるときは `public/style.css` と `test/views.test.ts` を確認する。
