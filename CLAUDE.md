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
- 表示言語: 日本語 / 英語（`src/i18n.ts` に文言を集約。判定結果は `pp_lang` Cookie に保存）
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

`deploy` ジョブはmainへのpushでは自動実行されない。複数PRをマージしてからまとめてリリースできるよう、
GitHubリポジトリの Actions タブから `Release` ワークフローを手動実行 (`workflow_dispatch`、対象ブランチは通常`main`) した
ときだけデプロイが走る。

CI (`.github/workflows/ci.yml`) はtypecheck/lint/build/testのみを行い、PR作成時やmainへのpush時に実行される
（実体は `.github/workflows/test.yml` の再利用ワークフローで、後述の `Release` ワークフローの `deploy` ジョブ前チェックとも共有している）。
デプロイとリリースにまつわるジョブは別ワークフロー `Release` (`.github/workflows/release.yml`) に分離してあり、
`workflow_dispatch`（`deploy` ジョブ）と、リリースPRがマージされた時の `pull_request: closed`（`release-tag` ジョブ）でのみ動く
（通常のPR作成・更新時にはこのワークフローは起動しないため、Checks一覧にも出てこない）。

`Release` ワークフローの `deploy` ジョブが、本番デプロイに成功した直後に自動で

1. `scripts/bump-calver.mjs`（`pnpm version:bump`）で既存の `v<year>.<month>.*` タグから次のバージョンを算出し `package.json` に書き込む
2. `package.json` に差分がある場合、`chore/release-vX.Y.Z` ブランチを作って `chore: release vX.Y.Z` コミットをpushし、`chore: release vX.Y.Z` PRを作成した上でGitHub Nativeのauto-merge（squash）を予約する（前回リリースと同じバージョンで差分が無い場合はコミット・PR作成をスキップし3.へ）
3. 差分が無かった場合はその場で `vX.Y.Z` のgitタグを作成・push（既にタグが存在する場合は作成しない）
4. 2.のPRがマージされたら（Required status check通過後、squashコミットは `[skip ci]` 付きでmainに着地する）、そのマージをトリガーに `release-tag` ジョブが起動し、`vX.Y.Z` のgitタグを作成・push
5. タグを新規作成できた場合のみ、`gh release create --generate-notes` でそのタグのGitHub Releaseを作成（3.は `deploy` ジョブが、4.は `release-tag` ジョブが行う）

mainブランチには「PR経由の変更のみ許可」「署名済みコミット必須」というリポジトリルールが設定されているため、CIから直接 `git push origin HEAD:main` することはできない。そのためバージョンバンプはPR＋auto-merge（squash）を経由する（squashマージ時にGitHub自身が作るコミットは自動的に署名済み扱いになる）。

手動でのバージョン更新は不要。ローカルで次のバージョンを確認したいだけなら `pnpm version:bump` を実行する（`package.json` が書き換わるので確認後は `git checkout -- package.json` で戻すこと）。

**前提設定:** リポジトリの Settings → General → Pull Requests で **Allow auto-merge** を有効にしておく必要がある（無効だと `gh pr merge --auto` が失敗する）。

デプロイは手動実行のみなので、ドキュメントだけの変更かどうかによるスキップ判定は行わない（実行するかどうかは手動実行する側の判断に委ねる）。

## アーキテクチャ・主要ファイル

```
src/
  index.ts                    # Honoアプリのエントリポイント・ルーティング
  session.ts                  # 署名付きCookieによるユーザーセッション（DBなし）
  locale.ts                   # リクエストからの表示言語判定・Cookieへの保存（Worker側）
  recent-rooms.ts             # 最近開いた部屋の履歴（pp_recent Cookie、トップページに表示）
  bindings.ts                 # Cloudflare Bindingsの型定義
  types.ts                    # 部屋の状態・WebSocketメッセージの型（ブラウザ側とも共有）
  i18n.ts                     # 日本語/英語の文言定義（ブラウザ側とも共有。DOM/Workers に依存しないこと）
  views.tsx                   # サーバーサイドで返すHTML（hono/jsx の関数コンポーネント）
  durable-objects/
    poker-room.ts             # 部屋(プランニングセッション)を表すDurable Object
  client/                     # ブラウザ側（hono/jsx/dom）。Vite で dist/ にバンドルされ、Worker からは import しない
    app.tsx                   # ルーム画面のエントリ（.page-room の data-* を読んで RoomApp を render）
    room.tsx                  # ルーム画面のコンポーネント群
    use-room-socket.ts        # WebSocket 接続・再接続・join を担う hook
    corner-controls.tsx       # 右上の言語・テーマメニュー（ThemeMenu の描画と両メニューの開閉）
    locale.ts                 # <html lang> から表示言語を読み取り、文言 `t` を公開する
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
- 部屋は最後の更新から30日（`ROOM_TTL_MS`）で alarm により `ctx.storage` ごと削除される。`persist()` のたびに alarm を延ばしているので、状態を書き戻す処理は必ず `persist()` を通す。
- WebSocket通信はHibernation API（`acceptWebSocket` / `webSocketMessage` / `webSocketClose`）を使う。誰も通信していない間はDOをスリープさせる前提の実装なので、状態はメッセージ処理のたびに `ctx.storage` へ書き戻す必要がある。
- ユーザー識別はCookie（`pp_session`）のみで、ログイン機能やDBは存在しない。
- Durable Object は部屋ごとの状態をインスタンス変数に持つが、初期値にモジュールスコープのオブジェクトを
  共有してはいけない（同じ isolate に載った別の部屋どうしで状態が混ざる）。必ず新しいオブジェクトを生成する。

### JSX / コンポーネントのルール

- `src/client` は Worker から import しない（サーバー側 tsconfig は DOM の型を含まず、ブラウザ側は Workers の型を含まない）。共有してよいのは `src/types.ts` と `src/i18n.ts` だけで、どちらも DOM / Workers の API に依存しない純粋な TypeScript に保つ（共有ファイルを増やすときは `src/client/tsconfig.json` の `include` にも追加する）。
- ブラウザ側のコードは `render` も hooks も型もすべて `hono/jsx/dom` から import する（`hono/jsx` の `Fragment` / `memo` はサーバー実装なので混ぜない）。
- JSX の属性は `class` / `for` / `maxlength` など HTML 名で書く（hono/jsx の型はそちらが正）。
- サーバー側で生の HTML/JS（DOCTYPE、FOUC 防止スクリプト、SVG など）を出力するときは `hono/html` の `html` タグ付きテンプレート / `raw()` を子要素として渡す。hono/jsx は `<script>` の中身も含めて文字列をエスケープする。`<script src>` に `async` を付けると `<head>` に巻き上げられるので付けない。
- ルーム画面の `<main class="page page-room">` の中身はブラウザ側が丸ごと描画する（`render()` は `replaceChildren` で置き換えるため、SSR で中に入れたものは消える）。サーバーから追加の HTML を渡したい場合は `<main>` の外に置く。
- ブラウザ側の WebSocket 接続は `useLayoutEffect` で開始する（`useEffect` は requestAnimationFrame 経由で遅延され、バックグラウンドタブでは実行されない）。`setState` はマイクロタスクでまとめて反映されるので、同じハンドラ内で送信に使う値はイベントや ref から直接取る。
- DOM の id / class を変えるときは `public/style.css` と `test/views.test.ts` を確認する。

### 表示言語（i18n）のルール

- 画面に出す文言は直書きせず `src/i18n.ts` の `Messages` に追加する。`Messages` は interface で型付けしてあるので、
  日本語だけ足して英語を忘れると型エラーになる。
- サーバー側は `messagesFor(locale)`、ブラウザ側は `src/client/locale.ts` の `t` から参照する
  （ブラウザ側の言語はサーバーが出力した `<html lang>` から読む）。
- 表示言語の決定順は「`pp_lang` Cookie（`/lang/:locale` で切り替え）→ `Accept-Language` → 既定の日本語」。
- Durable Object はユーザーの言語を知らないので、エラーは文言ではなく `ErrorCode`（`src/types.ts`）を送り、
  ブラウザ側で `t.errors[code]` に変換する。

### レイアウト崩れを防ぐルール

**画面に出るものは「文字が想定より長い」「幅が想定より狭い」で崩れる、という前提で書く。** 崩れは型チェックもテストも
検出しないので、ルールを守ったうえで最後は実機で見る。

- **文字列の長さを固定値とみなさない。** 表示名（最大40文字）と部屋名はユーザー入力で、絵文字も長い英単語も入る。
  文言も日本語と英語で長さが違う。1行に収めたい箇所は `.participant .name` のように
  `overflow: hidden` / `text-overflow: ellipsis` / `white-space: nowrap` を付け、
  折り返してよい箇所は折り返しても周囲がずれないことを確認する
  （flex / grid の子で省略を効かせるには `min-width: 0` が要る。既定の `min-width: auto` では縮まない）。
- **`position: fixed` / `absolute` は最後の手段。** フローから外れた要素は他の要素と重なる。
  以前QRコードを固定配置にして表示名の入力欄と重なった経緯があり（`fix: レイアウト崩れを修正` のコミット）、
  今はヘッダー内のflexに戻してある。固定していいのは画面右上の `.corner-controls` だけで、
  新しい要素はflex / gridのフローに置く。やむを得ず固定するなら、何と重なりうるかと避けるための寸法を
  コメントに残す（`.header-side` の `margin-top` が例）。
- **横スクロールを作らない。** 幅は固定pxではなく `max-width` と `flex-wrap` / `grid-template-columns: repeat(auto-fill, minmax(...))`
  で伸縮させる（`.cards`、`.header-side`、`.participants` が例）。幅320pxでも横スクロールが出ないこと。
- **中身で寸法が変わる箇所は先に枠を決める。** 投票状況で中身が空/✅/数値と変わる `.vote-slot` は高さを固定し、
  1桁でも2桁でも同じ大きさにしたい `.card-btn` は幅・高さを固定してflexで中央揃えにしてある。
  ラベルが入れ替わるボタン（「コピー」↔「コピーしました」など）は、幅が跳ねて隣がずれないか確認する。
- **ブレークポイントを増やす前に伸縮で解決する。** 現状 `max-width: 40rem` の1つだけで、
  これは固定配置の `.corner-controls` を避けるためのもの。`rem` 単位で書き、
  ブラウザのフォントサイズ拡大でも崩れないようにする（px直書きはQRコードのsvgのように理由がある場所だけ）。
- **色はテーマ変数から取る。** `:root` の変数を使い、ライト/ダークの両方で見る。
  変数が使えない箇所（白背景固定のQRコードなど）は、なぜ固定値なのかをコメントに書く。
- **見た目を変えたら実機で確認する。** `pnpm dev` で、日本語/英語 × ライト/ダーク × 狭い画面（375px前後）/広い画面、
  参加者0人と10人以上、長い表示名・長い部屋名を一通り見る。`test/views.test.ts` はHTMLの構造しか見ていないので、
  テストが通ることは崩れていないことの証明にならない。

## コードコメントのルール

**コメントは「コードを読んでも分からないこと」だけを書く。** コードで十分説明できている箇所にコメントは不要。
過剰な説明は読み手の負荷を上げるうえ、実装を変えたときに置き去りにされて嘘になる（嘘のコメントは無いより悪い）。

### 書くもの（why・背景）

- なぜその実装にしたか、素直な書き方をあえて避けた理由
  （例: `useLayoutEffect` を使う理由、`emptyRoom()` で毎回新しいオブジェクトを返す理由）
- ライブラリ・プラットフォームの落とし穴（hono/jsx の自動エスケープ、`<script async>` の巻き上げ、
  Durable Object のハイバネート、`setState` の反映タイミングなど）
- 正しさ・安全性の根拠（オープンリダイレクトを防ぐパス検証、部屋コードから紛らわしい文字を除く理由）
- 一見不要に見えるコードが必要な理由、意図的にやっていない/制限していること
- ファイル冒頭に置く短い役割説明（このファイルは何を担当し、何をしてはいけないか）
- 関数・型・定数の `/** */`（引数や戻り値の意味、`null` が何を表すかなど、シグネチャから読み取れないこと）
- `biome-ignore` の理由（Biome が必須にしている）
- `TODO` / `FIXME` は「何を」「なぜ」保留しているかまで書く（可能ならissue番号も）

### 書かないもの（what・コードの言い換え）

- コードをそのまま日本語に訳しただけのもの（`// 大文字に変換する` + `input.toUpperCase()`）
- 関数名・変数名・型を見れば分かること。名前で説明できるなら、コメントを足すのではなく名前を直す
- 型情報の再掲（`@param {string} roomId` のような JSDoc の型注釈）
- 変更履歴・作業メモ（git のコミットメッセージとPRに書く）
- コメントアウトしたコード（消す。履歴は git に残っている）
- 区切り線や見出しだけの飾りコメント（`// ---- handlers ----`）。長くなったら関数やファイルを分ける合図

### 書き方

- 言語は日本語（既存コードに合わせる）。1〜3行程度に収める。
- 長い背景説明はコメントに書かず `docs/` や README に置き、コメントからはそこを参照する
  （例: `src/durable-objects/poker-room.ts` → `docs/SESSION.md`）。
- 説明対象の直前の行に置く。行末コメントは一目で読める短い補足だけにする。
- 関数・型・定数の説明は `/** */`（エディタのホバーに出る）、実装の途中の補足は `//` を使う。
- コードを変更したら、周辺のコメントが実装と食い違っていないか必ず確認する。
- 追加/レビュー時の判断基準は「このコメントが無かったら読み手は誤解するか？」。
  誤解しないなら書かない・消す。
