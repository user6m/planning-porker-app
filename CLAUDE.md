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
- クライアント: `public/` 配下のビルド不要なプレーンJS/CSS
- Lint/Format: [Biome](https://biomejs.dev/)（タブインデント、ダブルクォート）
- テスト: Vitest + `@cloudflare/vitest-pool-workers`（実際のWorkersランタイム=Miniflare上で実行）

## よく使うコマンド

```bash
pnpm install       # 依存関係のインストール
pnpm dev           # 開発サーバー起動 (wrangler dev, http://localhost:8787)
pnpm typecheck     # 型チェック (tsc --noEmit)
pnpm lint          # Biomeによるlint
pnpm fix           # Biomeによる自動修正
pnpm test          # テスト実行 (vitest run)
pnpm test:watch    # テストのwatchモード
pnpm deploy        # 本番デプロイ (wrangler deploy --minify)
pnpm cf-typegen    # wrangler.jsonc からBindingsの型を生成
```

コードを変更したら、コミット前に `pnpm typecheck` / `pnpm lint` / `pnpm test` を通すこと。

## ローカル開発時のシークレット

`SESSION_SECRET` はgit管理対象外の `.dev.vars` に設定する（`wrangler dev` が自動読み込みする）。

```
SESSION_SECRET=dev-only-secret-change-me
```

## 本番デプロイ時の注意（重要）

- `SESSION_SECRET` は `wrangler.jsonc` の `vars` に**絶対に書かない**こと。書くとデプロイのたびに平文の値でシークレットが上書きされる。
- 本番用のシークレットは `pnpm exec wrangler secret put SESSION_SECRET` で設定する。

## バージョニング（CalVer）

`package.json` の `version` はセマンティックバージョニングではなく **CalVer (`YYYY.MM.MICRO`)** を採用している（例: `2026.9.0`）。

- `YYYY.MM`: リリースした年月（UTC）
- `MICRO`: 同じ年月内で何回目のリリースか（0始まり）。月が変わったら0にリセットされる

CI (`.github/workflows/ci.yml`) の `deploy` ジョブが、mainへのpushで本番デプロイに成功した直後に自動で

1. `scripts/bump-calver.mjs`（`pnpm version:bump`）で既存の `v<year>.<month>.*` タグから次のバージョンを算出し `package.json` に書き込む
2. `package.json` に差分があれば `chore: release vX.Y.Z [skip ci]` としてmainにコミット・push（前回リリースと同じバージョンの場合はコミットをスキップ）
3. `vX.Y.Z` のgitタグを作成・push（既にタグが存在する場合は作成しない）
4. タグを新規作成できた場合のみ、`gh release create --generate-notes` でそのタグのGitHub Releaseを作成

まで行う。手動でのバージョン更新は不要。ローカルで次のバージョンを確認したいだけなら `pnpm version:bump` を実行する（`package.json` が書き換わるので確認後は `git checkout -- package.json` で戻すこと）。

なお `deploy` ジョブは、変更ファイルが `**/*.md` / `docs/**` / `.github/ISSUE_TEMPLATE/**` / `.github/dependabot.yml` / `LICENSE` のようなドキュメント類だけの場合はスキップされる（`changes` ジョブが判定）。本番に影響するコード・設定の変更（`src/`, `public/`, `wrangler.jsonc`, `package.json` など）が含まれるpushでのみ実際にデプロイ・バージョン付与が行われる。

## アーキテクチャ・主要ファイル

```
src/
  index.ts                    # Honoアプリのエントリポイント・ルーティング
  session.ts                  # 署名付きCookieによるユーザーセッション（DBなし）
  bindings.ts                 # Cloudflare Bindingsの型定義
  types.ts                    # 部屋の状態・WebSocketメッセージの型
  views.tsx                   # サーバーサイドで返すHTML（hono/jsxによるJSX/TSX）
  durable-objects/
    poker-room.ts             # 部屋(プランニングセッション)を表すDurable Object
public/
  app.js                      # ルーム画面のクライアントスクリプト（ビルド不要）
  style.css
docs/
  SESSION.md                  # セッション/Durable Objects実装の解説（学習用）
test/
  poker-room.test.ts
  session.test.ts
```

- 部屋の状態（参加者・投票）はDurable Objectの `ctx.storage` に永続化される。メモリ上にしか保持しないとハイバネート時に消える。
- WebSocket通信はHibernation API（`acceptWebSocket` / `webSocketMessage` / `webSocketClose`）を使う。誰も通信していない間はDOをスリープさせる前提の実装なので、状態はメッセージ処理のたびに `ctx.storage` へ書き戻す必要がある。
- ユーザー識別はCookie（`pp_session`）のみで、ログイン機能やDBは存在しない。
