import { describe, expect, it } from "vitest";
import { averageVote, formatAverage } from "../src/vote-stats";

describe("averageVote", () => {
	it("数値カードの平均を返す", () => {
		expect(averageVote(["1", "2", "3"])).toBe(2);
	});

	it("「?」「☕」と未投票は平均に含めない", () => {
		expect(averageVote(["3", "?", "5", "☕", null])).toBe(4);
	});

	it("0 は数値の票として数える", () => {
		expect(averageVote(["0", "8"])).toBe(4);
	});

	it("数値の票が無ければ null を返す", () => {
		expect(averageVote([])).toBeNull();
		expect(averageVote(["?", "☕", null])).toBeNull();
	});
});

describe("formatAverage", () => {
	it("小数第1位までに丸め、整数なら小数点を付けない", () => {
		expect(formatAverage(5)).toBe("5");
		expect(formatAverage(13 / 3)).toBe("4.3");
		expect(formatAverage(2.25)).toBe("2.3");
	});
});
