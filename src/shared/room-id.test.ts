import { describe, expect, it } from "vite-plus/test";
import {
	generateRoomId,
	normalizeRoomId,
	ROOM_ID_ALPHABET,
	ROOM_ID_LENGTH,
	ROOM_ID_MAX_LENGTH,
} from "./room-id";

describe("normalizeRoomId", () => {
	it("trims, upper-cases and truncates user input", () => {
		expect(normalizeRoomId("  ab12cd34 ")).toBe("AB12CD34");
		expect(normalizeRoomId("a".repeat(ROOM_ID_MAX_LENGTH + 5))).toHaveLength(
			ROOM_ID_MAX_LENGTH,
		);
		expect(normalizeRoomId("   ")).toBe("");
	});
});

describe("generateRoomId", () => {
	it("only uses the unambiguous alphabet", () => {
		for (let i = 0; i < 50; i++) {
			const id = generateRoomId();
			expect(id).toHaveLength(ROOM_ID_LENGTH);
			for (const char of id) expect(ROOM_ID_ALPHABET).toContain(char);
		}
	});

	it("is already in normalized form", () => {
		const id = generateRoomId();
		expect(normalizeRoomId(id)).toBe(id);
	});
});
