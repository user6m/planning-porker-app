/**
 * 公開後の投票結果の集計。
 * `src/types.ts` と同じく Worker 側とブラウザ側の両方から import できるよう、DOM も Workers も参照しない。
 */
import type { CardValue } from "./types";

/**
 * 数値カードの平均。「?」「☕」と未投票 (null) は除く。
 * 数値の票が1つも無いときは null を返す。
 */
export function averageVote(
	votes: ReadonlyArray<CardValue | null>,
): number | null {
	const numbers = votes
		.map((v) => (v === null ? Number.NaN : Number(v)))
		.filter((n) => Number.isFinite(n));
	if (numbers.length === 0) return null;
	return numbers.reduce((sum, n) => sum + n, 0) / numbers.length;
}

/** 平均を小数第1位までに丸めて表示する (5.0 は "5") */
export function formatAverage(value: number): string {
	return String(Math.round(value * 10) / 10);
}
