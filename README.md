# planning-porker-app

複数人でリアルタイムに見積もりポイントを出し合える、シンプルなプランニングポーカー（プランニングポーカー/スクラムポーカー）アプリです。

- 🌐 プラットフォーム: Webブラウザ（PC/スマホ対応）
- ☁️ デプロイ先: [Cloudflare Workers](https://developers.cloudflare.com/workers/)（Worker + [Static Assets](https://developers.cloudflare.com/workers/static-assets/)）
- 🔤 言語: TypeScript
- ⚛️ フロントエンド: [React](https://react.dev/) 19 + [React Router](https://reactrouter.com/) の SPA
- 🧩 バックエンド: [Hono](https://hono.dev/)（`/api/*` の JSON API と WebSocket）
- ⚡ ツールチェーン: [Vite+](https://viteplus.dev/)（Vite / Vitest / Oxlint / Oxfmt を `vp` コマンドひとつで）+ [Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/)
- 🗄️ データストア: [Durable Objects](https://developers.cloudflare.com/durable-objects/)（部屋の状態）+ 署名付きCookie（ユーザー識別）
- 🔗 公開URL: https://planning-porker-app.te0.workers.dev/ （登録不要ですぐ使えます）

## なぜこの構成か

プランニングポーカーは「少人数が短時間だけ部屋に集まり、リアルタイムに状態を同期する」典型的な
ワークロードです。これはD1やKVのような汎用データベースより、**部屋ごとに1つのインスタンスが
状態とWebSocket接続をまとめて持てる Durable Objects** と相性が良いため採用しました。
DBのトランザクションやポーリングなしに、投票の競合を防ぎつつ即座に全員へブロードキャストできます。

ユーザー識別（表示名など）はログイン機能を作らずに済ませたいので、サーバー側に何も保存しない
**HMAC署名付きCookie**で実現しています。

画面は React の SPA で、Workers の静的アセットとして配信します。Worker が処理するのは
`/api/*` 配下の API と WebSocket だけなので、画面の表示だけなら Worker を起動せずに済みます
（`wrangler.jsonc` の `assets.run_worker_first` / `not_found_handling` を参照）。

> 🎓 この2つの「セッション」の実装について詳しく学びたい方は [docs/SESSION.md](docs/SESSION.md) を参照してください。

## 使い方

上記の[公開URL](https://planning-porker-app.te0.workers.dev/)にアクセスするか、後述の手順でローカル/自前環境を用意してください。

1. トップページで部屋の名前と自分の表示名を入力して「部屋を作成」
2. 発行された部屋コード付きのURLをチームに共有
3. 各自カードを選んで見積もりを入力 → ファシリテーターが「公開する」を押すと全員の投票が一斉に表示される
4. 議論後、「リセット」で次のissueの見積もりへ

## セットアップ

Node.js 22.18 以上と pnpm（`package.json` の `packageManager` に記載のバージョン）が必要です。

```bash
pnpm install
```

このリポジトリは [Vite+](https://viteplus.dev/) を使っています。`package.json` の各スクリプトは
プロジェクトローカルの `vp` コマンドを呼ぶので、グローバルの `vp` をインストールしなくても
`pnpm dev` / `pnpm check` のように使えます。グローバルに `vp` を入れている場合は `vp install` /
`vp dev` / `vp check` のように直接実行しても同じです。

### 開発サーバーの起動

```bash
pnpm dev
```

`http://localhost:5173` で起動します。Vite の開発サーバー（React の HMR 付き）の中で、
[Cloudflare Vite plugin](https://developers.cloudflare.com/workers/vite-plugin/) が Worker と
Durable Object を本番と同じ Workers ランタイム（workerd）上で動かします。

ローカル開発用の `SESSION_SECRET` は、git管理対象外の `.dev.vars` ファイルに以下のように設定します
（Cloudflare Vite plugin がここから自動で読み込みます）。

```
SESSION_SECRET=dev-only-secret-change-me
```

### フォーマット / Lint / 型チェック

```bash
pnpm check       # Oxfmt (フォーマット) + Oxlint (lint) + 型チェックをまとめて実行
pnpm fix         # フォーマットと自動修正可能な lint 指摘を直す
pnpm typecheck   # tsc -b (tsconfig.*.json のプロジェクト参照どおりに TypeScript 本体で型チェック)
```

設定はすべて [`vite.config.ts`](vite.config.ts) の `lint` / `fmt` ブロックにあります
（タブインデント・ダブルクォート・80桁）。

### テスト

```bash
pnpm test         # 1回実行
pnpm test:watch   # watchモード
```

Vitest のプロジェクトを2つに分けています（`vite.config.ts` の `test.projects`）。

- `worker`: [`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/) を使い、
  実際のWorkersランタイム(Miniflare)上でDurable ObjectとAPIルートをテストします（`test/`）
- `client`: jsdom + [Testing Library](https://testing-library.com/) で React コンポーネントと共有ロジックをテストします
  （`src/client/**/*.test.tsx`, `src/shared/**/*.test.ts`）

### ビルドとプレビュー

```bash
pnpm build     # dist/client (静的アセット) と dist/planning_porker_app (Worker) を生成
pnpm preview   # ビルド成果物を Workers ランタイム上で起動して確認 (http://localhost:4173)
```

## デプロイ

```bash
pnpm deploy   # = vp build && wrangler deploy
```

`vp build` は Worker と静的アセットに加えて、デプロイ用の設定 `dist/planning_porker_app/wrangler.json` と、
`wrangler` コマンドをその設定へ向けるための `.wrangler/deploy/config.json` を生成します。
そのため `wrangler deploy` は必ずビルドの後に実行してください。

初回デプロイ前に、Cookie署名用のシークレットを本番用の値で設定してください。

```bash
pnpm exec wrangler secret put SESSION_SECRET
```

`wrangler.jsonc` には `SESSION_SECRET` を `vars` として書かないでください。書いてしまうと、
デプロイのたびにその平文の値でシークレットが上書きされてしまいます。

## CI/CD

GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）で以下を自動化しています。
Vite+ のセットアップ（Node.js / pnpm / 依存キャッシュ）には公式の
[`voidzero-dev/setup-vp`](https://github.com/voidzero-dev/setup-vp) アクションを使っています。

- **CI**（`main`へのpush / 全PR）: `vp check` / `vp run typecheck` / `vp test` / `vp build` を実行
- **CD**（`main`へのpush、CI成功後）: `vp build` してから `wrangler deploy` で本番デプロイ

デプロイジョブを動かすには、リポジトリに以下のSecretsを設定してください（Settings → Environments →
`production`、またはSettings → Secrets and variables → Actions）。

| Secret                  | 説明                                                                                                                                |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `CLOUDFLARE_API_TOKEN`  | Workersへのデプロイ権限を持つ[Cloudflare APIトークン](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先のCloudflareアカウントID                                                                                                  |

`SESSION_SECRET` はこれらのSecretsとは別物です。CIの型生成・テストではダミー値（`.dev.vars`と同じ
`dev-only-secret-change-me`）をワークフロー内で使い捨て生成しており、本番のシークレットには影響しません。
本番用の`SESSION_SECRET`は上記の通り`wrangler secret put`で設定したままにしてください。

### デプロイに承認を必須にする（本リポジトリはpublicなので推奨）

デプロイジョブは `environment: production` を指定済みです。GitHubのEnvironment保護ルールで
承認者を必須にすると、`main`へのpush自体は自動で走りますが、実際の`wrangler deploy`実行は
指定した承認者の承認が下りるまで一時停止します。

1. リポジトリの **Settings → Environments → New environment** で `production` という名前の環境を作成（既にあれば選択）
2. **Deployment protection rules** の **Required reviewers** を有効化し、自分（または承認してほしいメンバー）を追加
3. 保存後は、`main`へのpush → CI成功 → デプロイジョブが `Waiting` 状態になり、Actionsタブから承認するまでデプロイされない

### その他、publicリポジトリとして確認しておきたい設定

これらもGitHubの管理画面での設定が必要です（APIからは変更できません）。

- **Settings → Branches**: `main` にブランチ保護ルールを設定し、PR経由でのマージ・CIのパス必須化・force push禁止を有効化
- **Settings → Code security**: Secret scanning / Push protection、Dependabot alerts・Dependabot security updates を有効化（publicリポジトリではデフォルトで一部有効ですが、Push protectionは確認推奨）
- **Settings → Actions → General**: 「Fork pull request workflows」まわりの権限が必要以上に広くなっていないか確認（デフォルトのままで問題ありません）

## プロジェクト構成

```
index.html                    # SPA のエントリ HTML (Vite が処理する)
vite.config.ts                # Vite+ の設定 (dev/build/test/lint/fmt をこの1ファイルに集約)
wrangler.jsonc                # Worker / Durable Object / 静的アセットのルーティング設定
tsconfig.json                 # プロジェクト参照のルート (app: client, worker: worker+test, node: vite.config.ts)
src/
  client/                     # React SPA (ブラウザで動く)
    main.tsx                  #   エントリポイント (React Router の BrowserRouter)
    App.tsx                   #   ルーティング (/ と /rooms/:roomId)
    api.ts                    #   /api/* を叩くクライアント
    pages/                    #   HomePage (部屋の作成/参加), RoomPage (投票画面)
    components/               #   CardDeck, ParticipantList, ThemeToggle
    hooks/                    #   useSession, useRoomSocket (WebSocket + 自動再接続), useTheme
    styles.css
  shared/                     # クライアントと Worker の両方から使う型・定数・関数
    types.ts                  #   部屋の状態・WebSocket/API メッセージの型、カードの定義
    room-id.ts                #   部屋コードの生成・正規化
  worker/                     # Cloudflare Worker (Hono)
    index.ts                  #   /api/* のルーティング (JSON API + WebSocket)
    session.ts                #   ユーザーセッション (署名付きCookie)
    bindings.ts               #   Cloudflare Bindings の型定義
    durable-objects/
      poker-room.ts           #   部屋 (プランニングセッション) を表す Durable Object
docs/
  SESSION.md                  # セッション実装の解説（学習用）
test/                         # Workers ランタイム上で動くテスト (vitest-pool-workers)
  api.test.ts
  poker-room.test.ts
  session.test.ts
```

### Vite+ のバージョンを上げるとき

`pnpm-workspace.yaml` の `overrides` で、`vite` を Vite+ 同梱の Vite（`@voidzero-dev/vite-plus-core`）に
エイリアスし、`vitest` を Vite+ 同梱のバージョンに固定しています（各プラグインが import する Vite/Vitest を
`vp` が使うものと同一のコピーに揃えるため）。`vite-plus` を更新したら、`pnpm exec vp toolchain` で
表示される Vite+ 本体と Vitest のバージョンに合わせて `overrides` も更新してください。

## ライセンス

MIT © [r0ku](LICENSE)
