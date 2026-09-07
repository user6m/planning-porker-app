// 部屋の招待URLをQRコードとして表示するコンポーネント。
// SVGはqrcode-generatorが返す明暗マス目から自前で組み立てる(dangerouslySetInnerHTMLを使わずJSXだけで完結させるため)。

import type { FC } from "hono/jsx/dom";
import qrcode from "qrcode-generator";

const MARGIN = 2;

function buildQrPath(qr: ReturnType<typeof qrcode>): string {
	const size = qr.getModuleCount();
	let path = "";
	for (let row = 0; row < size; row++) {
		let col = 0;
		while (col < size) {
			if (!qr.isDark(row, col)) {
				col++;
				continue;
			}
			const start = col;
			while (col < size && qr.isDark(row, col)) col++;
			path += `M${start + MARGIN} ${row + MARGIN + 0.5}h${col - start}`;
		}
	}
	return path;
}

export const RoomQrCode: FC = () => {
	const url = location.href;
	const qr = qrcode(0, "M");
	qr.addData(url);
	qr.make();

	const size = qr.getModuleCount() + MARGIN * 2;

	return (
		<details class="qr-details">
			<summary>QRコードを表示</summary>
			<div class="qr-code">
				<svg
					xmlns="http://www.w3.org/2000/svg"
					viewBox={`0 0 ${size} ${size}`}
					shape-rendering="crispEdges"
					role="img"
					aria-label="部屋の招待URLのQRコード"
				>
					<rect width={size} height={size} fill="#ffffff" />
					<path stroke="#000000" d={buildQrPath(qr)} />
				</svg>
			</div>
			<p class="qr-url">{url}</p>
		</details>
	);
};
