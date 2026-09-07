// プランニングポーカーのルーム画面 (ブラウザ側) のエントリポイント。
// hono/jsx/dom の関数コンポーネントで実装し、Vite で /app.js にバンドルされる。
// Worker (src/) からは import しないこと (サーバー側は hono/jsx、こちらは hono/jsx/dom の別ランタイム)。
import { render } from "hono/jsx/dom";
import { RoomApp } from "./room";

const root = document.querySelector<HTMLElement>(".page-room");
if (root) {
	// render() は root の中身を replaceChildren で置き換える (サーバーは空の <main> を返している)
	render(
		<RoomApp
			roomId={root.dataset.roomId ?? ""}
			userId={root.dataset.userId ?? ""}
			initialName={root.dataset.userName ?? ""}
		/>,
		root,
	);
}
