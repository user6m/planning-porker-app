# planning-porker-app

複数人でリアルタイムに見積もりポイントを出し合える、シンプルなプランニングポーカー（プランニングポーカー/スクラムポーカー）アプリです。

- 🌐 プラットフォーム: Webブラウザ（PC/スマホ対応、ビルド不要のプレーンJSクライアント）
- ☁️ デプロイ先: [Cloudflare Workers](https://developers.cloudflare.com/workers/)
- 🔤 言語: TypeScript
- 🧩 フレームワーク: [Hono](https://hono.dev/)
- 🗄️ データストア: [Durable Objects](https://developers.cloudflare.com/durable-objects/)（部屋の状態）+ 署名付きCookie（ユーザー識別）
- 🔗 公開URL: https://planning-porker-app.te0.workers.dev/ （登録不要ですぐ使えます）

## なぜこの構成か

プランニングポーカーは「少人数が短時間だけ部屋に集まり、リアルタイムに状態を同期する」典型的な
ワークロードです。これはD1やKVのような汎用データベースより、**部屋ごとに1つのインスタンスが
状態とWebSocket接続をまとめて持てる Durable Objects** と相性が良いため採用しました。
DBのトランザクションやポーリングなしに、投票の競合を防ぎつつ即座に全員へブロードキャストできます。

ユーザー識別（表示名など）はログイン機能を作らずに済ませたいので、サーバー側に何も保存しない
**HMAC署名付きCookie**で実現しています。

> 🎓 この2つの「セッション」の実装について詳しく学びたい方は [docs/SESSION.md](docs/SESSION.md) を参照してください。

## 使い方

上記の[公開URL](https://planning-porker-app.te0.workers.dev/)にアクセスするか、後述の手順でローカル/自前環境を用意してください。

1. トップページで部屋の名前と自分の表示名を入力して「部屋を作成」
2. 発行された部屋コード付きのURLをチームに共有
3. 各自カードを選んで見積もりを入力 → ファシリテーターが「公開する」を押すと全員の投票が一斉に表示される
4. 議論後、「リセット」で次のissueの見積もりへ

## セットアップ

```bash
pnpm install
```

### 開発サーバーの起動

```bash
pnpm dev
```

`http://localhost:8787` で起動します（[wrangler dev](https://developers.cloudflare.com/workers/wrangler/commands/#dev) を使用）。

ローカル開発用の `SESSION_SECRET` は、git管理対象外の `.dev.vars` ファイルに以下のように設定します
（`wrangler dev` がここから自動で読み込みます）。

```
SESSION_SECRET=dev-only-secret-change-me
```

### 型チェック / Lint

```bash
pnpm typecheck
pnpm lint
pnpm fix   # 自動修正
```

### テスト

```bash
pnpm test
```

[`@cloudflare/vitest-pool-workers`](https://developers.cloudflare.com/workers/testing/vitest-integration/) を使い、
実際のWorkersランタイム(Miniflare)上でDurable Objectとルーティングをテストしています。

## デプロイ

```bash
pnpm deploy
```

初回デプロイ前に、Cookie署名用のシークレットを本番用の値で設定してください。

```bash
pnpm exec wrangler secret put SESSION_SECRET
```

`wrangler.jsonc` には `SESSION_SECRET` を `vars` として書かないでください。書いてしまうと、
デプロイのたびにその平文の値でシークレットが上書きされてしまいます。

## CI/CD

GitHub Actions（[`.github/workflows/ci.yml`](.github/workflows/ci.yml)）で以下を自動化しています。

- **CI**（`main`へのpush / 全PR）: `pnpm typecheck` / `pnpm lint` / `pnpm test` を実行
- **CD**（`main`へのpush、CI成功後）: `wrangler deploy --minify` で本番デプロイ

デプロイジョブを動かすには、リポジトリに以下のSecretsを設定してください（Settings → Environments →
`production`、またはSettings → Secrets and variables → Actions）。

| Secret | 説明 |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | Workersへのデプロイ権限を持つ[Cloudflare APIトークン](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) |
| `CLOUDFLARE_ACCOUNT_ID` | デプロイ先のCloudflareアカウントID |

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
src/
  index.ts                    # Honoアプリのエントリポイント・ルーティング
  session.ts                  # ユーザーセッション(署名付きCookie)
  bindings.ts                 # Cloudflare Bindingsの型定義
  types.ts                    # 部屋の状態・WebSocketメッセージの型
  views.ts                    # サーバーサイドで返すHTML
  durable-objects/
    poker-room.ts             # 部屋(プランニングセッション)を表すDurable Object
public/
  app.js                      # ルーム画面のクライアントスクリプト（ビルド不要）
  style.css
docs/
  SESSION.md                  # セッション実装の解説（学習用）
test/
  poker-room.test.ts
  session.test.ts
```

## ライセンス

MIT © [r0ku](LICENSE)
