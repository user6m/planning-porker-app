# CLAUDE.md

このファイルは、このリポジトリでコード作業を行うAIコーディングエージェント（Claude Codeなど）向けのガイドです。

## プロジェクト概要

複数人でリアルタイムに見積もりポイントを出し合うプランニングポーカーアプリ。
React の SPA（静的アセットとして配信）+ Cloudflare Workers 上で動く Hono の API + Durable Objects（部屋の状態管理）で構成されている。
公開URL: https://planning-porker-app.te0.workers.dev/

詳細な背景・アーキテクチャの解説は [README.md](README.md) と [docs/SESSION.md](docs/SESSION.md) を参照。

## 技術スタック

- 言語: TypeScript
- ツールチェーン: [Vite+](https://viteplus.dev/)（`vp` コマンド。Vite / Vitest / Oxlint / Oxfmt を同梱）
- フロントエンド: React 19 + [React Router](https://reactrouter.com/)（`src/client/`）。Vite でビルドし、Workers Static Assets として配信
- バックエンド: [Hono](https://hono.dev/)（`src/worker/`）。`/api/*` の JSON API と WebSocket だけを担当
- 実行環境: Cloudflare Workers（開発時も [@cloudflare/vite-plugin](https://developers.cloudflare.com/workers/vite-plugin/) が workerd 上で Worker を動かす）
- 状態管理: Durable Objects（部屋ごとに1インスタンス、WebSocket Hibernation APIを使用）
- ユーザー識別: サーバー側にDBを持たない、HMAC署名付きCookie
- Lint/Format: Oxlint / Oxfmt（`vite.config.ts` の `lint` / `fmt` ブロックで設定。タブインデント、ダブルクォート、80桁）
- テスト: Vitest（`vp test`）。Worker側は `@cloudflare/vitest-pool-workers`（実際のWorkersランタイム=Miniflare上で実行）、クライアント側は jsdom + Testing Library

## よく使うコマンド

`package.json` のスクリプトはすべてプロジェクトローカルの `vp` を呼ぶので、グローバルの `vp` が無くても `pnpm <script>` で動く。

```bash
pnpm install       # 依存関係のインストール (vp install でも可)
pnpm dev           # 開発サーバー起動 (vp dev, http://localhost:5173。HMR付き、Workerはworkerd上で動く)
pnpm check         # フォーマット + lint + 型チェック (vp check)
pnpm fix           # フォーマット/自動修正 (vp check --fix)
pnpm typecheck     # tsc -b (プロジェクト参照どおりに TypeScript 本体で型チェック)
pnpm test          # テスト実行 (vp test)
pnpm test:watch    # テストのwatchモード (vp test watch)
pnpm build         # 本番ビルド (vp build → dist/client と dist/planning_porker_app)
pnpm preview       # ビルド成果物を Workers ランタイムで起動 (vp preview, http://localhost:4173)
pnpm deploy        # 本番デプロイ (vp build && wrangler deploy)
pnpm cf-typegen    # wrangler.jsonc からBindingsの型を生成 (worker-configuration.d.ts)
```

コードを変更したら、コミット前に `pnpm check` / `pnpm typecheck` / `pnpm test` を通すこと。

### Vite+ の注意点

- `vp dev` / `vp build` / `vp test` / `vp lint` / `vp fmt` / `vp check` は Vite+ の組み込みコマンドで、`package.json` の同名スクリプトでは上書きできない。スクリプトを明示的に実行したいときは `vp run <script>`（例: `vp run cf-typegen`）。
- Vitest の API は `vitest` ではなく `vite-plus/test` から import する（`vitest` を直接 devDependencies に入れない）。
- `pnpm-workspace.yaml` の `overrides` で `vite` を `@voidzero-dev/vite-plus-core`（Vite+ 同梱の Vite）にエイリアスし、`vitest` を同梱バージョンに固定している。`vite-plus` を更新したら `pnpm exec vp toolchain` の表示に合わせて `overrides` も更新すること。
- 設定ファイルは `vite.config.ts` に集約する（`vitest.config.ts` / `.oxlintrc.json` / `.oxfmtrc.json` は作らない）。

## ローカル開発時のシークレット

`SESSION_SECRET` はgit管理対象外の `.dev.vars` に設定する（開発サーバー・テスト・型生成が自動読み込みする）。

```
SESSION_SECRET=dev-only-secret-change-me
```

## 本番デプロイ時の注意（重要）

- `SESSION_SECRET` は `wrangler.jsonc` の `vars` に**絶対に書かない**こと。書くとデプロイのたびに平文の値でシークレットが上書きされる。
- 本番用のシークレットは `pnpm exec wrangler secret put SESSION_SECRET` で設定する。
- `wrangler deploy` は必ず `vp build` の後に実行する。ビルドが生成する `.wrangler/deploy/config.json` によって、wrangler は `dist/planning_porker_app/wrangler.json`（ビルド成果物用の設定）を読むようになる。

## バージョニング（CalVer）

`package.json` の `version` はセマンティックバージョニングではなく **CalVer (`YYYY.MM.MICRO`)** を採用している（例: `2026.9.0`）。

- `YYYY.MM`: リリースした年月（UTC）
- `MICRO`: 同じ年月内で何回目のリリースか（0始まり）。月が変わったら0にリセットされる

CI (`.github/workflows/ci.yml`) の `deploy` ジョブが、mainへのpushで本番デプロイに成功した直後に自動で

1. `scripts/bump-calver.mjs` で既存の `v<year>.<month>.*` タグから次のバージョンを算出し `package.json` に書き込む
2. `package.json` に差分があれば `chore: release vX.Y.Z [skip ci]` としてmainにコミット・push（前回リリースと同じバージョンの場合はコミットをスキップ）
3. `vX.Y.Z` のgitタグを作成・push（既にタグが存在する場合は作成しない）
4. タグを新規作成できた場合のみ、`gh release create --generate-notes` でそのタグのGitHub Releaseを作成

まで行う。手動でのバージョン更新は不要。ローカルで次のバージョンを確認したいだけなら `node scripts/bump-calver.mjs` を実行する（`package.json` が書き換わるので確認後は `git checkout -- package.json` で戻すこと）。
画面フッターのバージョン表示は `vite.config.ts` の `define`（`__APP_VERSION__`）で `package.json` の `version` を埋め込んでいる。

なお `deploy` ジョブは、変更ファイルが `**/*.md` / `docs/**` / `.github/ISSUE_TEMPLATE/**` / `.github/dependabot.yml` / `.vscode/**` / `LICENSE` のようなドキュメント類だけの場合はスキップされる（`changes` ジョブが判定）。本番に影響するコード・設定の変更（`src/`, `index.html`, `vite.config.ts`, `wrangler.jsonc`, `package.json` など）が含まれるpushでのみ実際にデプロイ・バージョン付与が行われる。

## アーキテクチャ・主要ファイル

```
index.html                    # SPA のエントリ HTML (Vite が処理する)
vite.config.ts                # Vite+ の設定 (dev/build/test/lint/fmt をこの1ファイルに集約)
wrangler.jsonc                # Worker / Durable Object / 静的アセットのルーティング設定
tsconfig.json                 # プロジェクト参照のルート (tsconfig.app.json / tsconfig.worker.json / tsconfig.node.json)
src/
  client/                     # React SPA (ブラウザで動く。tsconfig.app.json)
    main.tsx                  #   エントリポイント
    App.tsx                   #   ルーティング (/ と /rooms/:roomId)
    api.ts                    #   /api/* を叩くクライアント
    pages/                    #   HomePage, RoomPage
    components/               #   CardDeck, ParticipantList, ThemeToggle
    hooks/                    #   useSession, useRoomSocket (WebSocket + 自動再接続), useTheme
    styles.css
  shared/                     # クライアントと Worker の両方から使う型・定数・関数 (DOM/Workers固有APIに依存しないこと)
    types.ts                  #   部屋の状態・WebSocket/API メッセージの型、カードの定義
    room-id.ts                #   部屋コードの生成・正規化
  worker/                     # Cloudflare Worker (tsconfig.worker.json)
    index.ts                  #   Honoアプリのエントリポイント (/api/* のルーティング)
    session.ts                #   署名付きCookieによるユーザーセッション（DBなし）
    bindings.ts               #   Cloudflare Bindingsの型定義
    durable-objects/
      poker-room.ts           #   部屋(プランニングセッション)を表すDurable Object
docs/
  SESSION.md                  # セッション/Durable Objects実装の解説（学習用）
test/                         # Workersランタイム上で動くテスト (vitest-pool-workers)
  api.test.ts                 #   /api/* のルート
  poker-room.test.ts
  session.test.ts
```

### リクエストのルーティング（wrangler.jsonc の `assets`）

- `run_worker_first: ["/api/*"]`: `/api/*` だけが Worker（`src/worker/index.ts`）に届く。
- `not_found_handling: "single-page-application"`: それ以外でアセットに一致しないパス（`/rooms/XXXX` など）は `index.html` が返り、React Router がクライアント側でルーティングする。
- 新しい API は必ず `/api/` 配下に追加すること（それ以外のパスは Worker に届かない）。

### API

| メソッド/パス           | 内容                                                                       |
| ----------------------- | -------------------------------------------------------------------------- |
| `GET /api/me`           | セッション（`userId`, `name`）を返す。無ければ新規発行して Cookie にセット |
| `PATCH /api/me`         | 表示名を変更して Cookie に書き戻す                                         |
| `POST /api/rooms`       | 部屋を作成し `{ roomId }` を返す（作成者の表示名もセッションに保存）       |
| `GET /api/rooms/:id/ws` | 部屋の Durable Object への WebSocket 接続                                  |

リクエスト/レスポンスの型は `src/shared/types.ts` にあり、クライアント（`src/client/api.ts`）と Worker で共有する。

### 実装上の注意

- 部屋の状態（参加者・投票）はDurable Objectの `ctx.storage` に永続化される。メモリ上にしか保持しないとハイバネート時に消える。
- WebSocket通信はHibernation API（`acceptWebSocket` / `webSocketMessage` / `webSocketClose`）を使う。誰も通信していない間はDOをスリープさせる前提の実装なので、状態はメッセージ処理のたびに `ctx.storage` へ書き戻す必要がある。
- DOの初期状態などのオブジェクトはモジュール共通の定数を使い回さず、インスタンスごとに新しく作る（同じisolate上の複数の部屋で状態が共有されてしまうため）。
- ユーザー識別はCookie（`pp_session`）のみで、ログイン機能やDBは存在しない。Cookie は `httpOnly` なのでクライアントは `GET /api/me` で自分の情報を取得する。
- `src/shared/` はブラウザとWorkersの両方で動く必要があるため、DOM API や Workers 固有の API に依存させない。
