# 「セッション」の実装を学ぶ

このアプリには、目的の異なる2種類の「セッション」が登場します。混同しやすいので、
それぞれ何を解決するための仕組みなのかを分けて説明します。

1. **ユーザーセッション** — このブラウザは誰か？を覚えておく仕組み（`src/session.ts`）
2. **プランニングセッション（部屋）** — 複数人でリアルタイムに状態を共有する仕組み（`src/durable-objects/poker-room.ts`）

どちらも「状態をどこかに保持して、後続のリクエスト/接続に引き継ぐ」という点は共通していますが、
保存場所も、想定するアクセスパターンも全く違います。

---

## 1. ユーザーセッション: 署名付きCookie

### 課題

- ログイン機能は作らない（気軽に使えるツールにしたい）が、
  「さっき入力した表示名」や「自分がどの投票をしたか」をリロード後も覚えていてほしい。
- サーバー側にセッションストア（DB/KVなど）を持つと、それだけで運用コストと障害点が増える。

### 採用した方法: HMAC署名付きCookie（ステートレスセッション）

`src/session.ts` では、Hono の [`hono/cookie`](https://hono.dev/docs/helpers/cookie) が提供する
`setSignedCookie` / `getSignedCookie` を使っています。

```ts
await setSignedCookie(c, "pp_session", JSON.stringify({ userId, name }), secret, {
	httpOnly: true,
	secure: true,
	sameSite: "Lax",
	maxAge: 60 * 60 * 24 * 30,
});
```

仕組みは次の通りです。

1. Cookieの値（ここではJSON文字列）に対して、サーバーだけが知っている `SESSION_SECRET` を使って
   HMAC-SHA256 の署名を計算する。
2. `値.署名` の形でCookieにセットする。
3. 次のリクエストでCookieを受け取ったら、値から署名を再計算し、Cookieに入っていた署名と一致するか検証する。
   一致しなければ「改ざんされた/偽造された」とみなして無視し、新しいセッションを発行し直す。

このやり方の利点は、**サーバー側に何も保存しなくてよい**ことです。Cookie自体が「正当性を自己証明する」
トークンになっているため、Durable Objectのようなステートフルな仕組みや、DBのセッションテーブルが不要になります。
これは俗に *ステートレスセッション* と呼ばれる方式で、JWTを使った認証と考え方は同じです。

各Cookie属性の役割:

| 属性 | 役割 |
| --- | --- |
| `httpOnly` | JavaScript(`document.cookie`)からの読み取りを禁止し、XSSでの盗み取りを防ぐ |
| `secure` | HTTPS接続でのみ送信させる |
| `sameSite: "Lax"` | 他サイトからのクロスサイトリクエストで送信されないようにし、CSRFの一部を防ぐ |
| `maxAge` | 有効期限。切れると次回アクセス時に新しいセッションが発行される |

### 試してみよう

- `test/session.test.ts` は、Cookieの署名検証・改ざん検知・ロールバックの振る舞いをテストしています。
  DevToolsでCookieの値を1文字書き換えてリロードすると、`getOrCreateSession` が新しいセッションを
  発行し直すことを確認できます。
- 発展課題: セッションに有効期限が近づいたら自動延長する（スライディングセッション）を実装してみましょう。

---

## 2. プランニングセッション（部屋）: Durable Object

### 課題

- 複数人が同時に同じ「部屋」に接続し、誰かが投票したりカードを公開したりするたびに、
  全員の画面をリアルタイムに同期したい。
- 素朴にDBだけで実装すると、「誰が今何を投票したか」を全クライアントがポーリングする必要があり、
  リアルタイム性・効率の両面で不利。
- 複数のリクエストが同時に来たときに、投票データの競合（race condition）を防ぐ必要がある。

### 採用した方法: Durable Object + WebSocket Hibernation API

[Durable Objects](https://developers.cloudflare.com/durable-objects/) は、Cloudflare Workers上で
「特定のIDに対して、常に同じ1つのインスタンスだけが存在する」ことを保証してくれるオブジェクトです。

```ts
const stub = env.POKER_ROOM.get(env.POKER_ROOM.idFromName(roomId));
```

同じ `roomId` から作ったIDに対しては、世界中どこからリクエストが来ても必ず同じDOインスタンスに
ルーティングされます。これにより:

- 部屋の状態（参加者一覧・投票内容・公開/非公開）を、そのDOインスタンスの中だけで管理すればよい。
  DBのトランザクションやロックを自前で実装しなくても、「1インスタンス=1部屋」という制約だけで
  データ競合が起きない設計になる。
- 参加者全員のWebSocket接続を、同じDOインスタンスが集約して持てる。誰かが投票したら、
  そのDOが持っている全コネクションに即座にブロードキャストできる。

### WebSocket Hibernation API

素朴にWebSocketを扱うと、「接続している間はDOインスタンスをメモリに常駐させ続ける」必要があり、
誰も発言していない待機時間でも課金・リソースが消費され続けます。

[Hibernation API](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) は、
これを解決するための仕組みです。

```ts
this.ctx.acceptWebSocket(server, [userId]); // userId を「タグ」として紐付ける

async webSocketMessage(ws: WebSocket, raw: string) { /* メッセージ受信時に呼ばれる */ }
async webSocketClose(ws: WebSocket) { /* 切断時に呼ばれる */ }
```

`acceptWebSocket` で受け入れた接続は、メッセージが来ていない間はDOごとハイバネート（メモリ解放）
されます。次にメッセージが届いた時点で、Workers ランタイムが自動的にDOを復元し、
コンストラクタが再実行されてから `webSocketMessage` が呼ばれます。

このとき、**ハイバネート前にインスタンスが持っていたJavaScriptの状態(フィールド)は消えます**。
そのため本アプリでは:

- 部屋の状態（`this.room`）はメモリではなく `ctx.storage`（DO専用のSQLiteストレージ）に永続化し、
  コンストラクタで `ctx.blockConcurrencyWhile` を使って読み戻しています。
- 「このWebSocketは誰のものか」は `ctx.getTags(ws)` で取得できるタグとして紐付けています。
  タグはハイバネートを跨いでWebSocket自体に保持されるため、インスタンスのフィールドに
  依存せずに済みます。

### 切断の扱い

同じ人が複数タブを開いているケースを考慮し、`webSocketClose` では
「そのuserIdの他のWebSocket接続が残っているか」を `ctx.getWebSockets(userId)` で確認してから、
本当に誰もいなくなった場合だけ参加者をルームから削除しています。

### 試してみよう

- `test/poker-room.test.ts` では `@cloudflare/vitest-pool-workers` を使い、
  実際のWorkersランタイム(Miniflare)の上でDurable Objectを動かしてテストしています。
  `runInDurableObject` でインスタンス内部の状態を直接検査できます。
- 発展課題:
  - 切断してもすぐには参加者を消さず、一定時間（例: 30秒）の猶予を持たせて再接続を待つ
    （`ctx.storage.setAlarm` を使うとDOがハイバネートしていても指定時刻に起こしてもらえます）。
  - 部屋の見積もり結果を D1 に保存して、あとから振り返れるようにする。

---

## まとめ: 2つの「セッション」の対比

| | ユーザーセッション | プランニングセッション（部屋） |
| --- | --- | --- |
| 何を覚える? | このブラウザが誰か | 部屋に今誰がいて、何に投票したか |
| 保存場所 | クライアントのCookie（署名付き） | Durable Objectの `ctx.storage` |
| アクセスパターン | リクエスト単位（HTTP） | 複数クライアントからの継続接続（WebSocket） |
| スケールの考え方 | ステートレス。どのWorkerが処理してもよい | 部屋ごとに1つのインスタンスへ集約 |
| 主な脅威への対策 | HMAC署名で改ざん検知 | 1インスタンス制約で競合状態を防止 |
