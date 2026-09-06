/** 紛らわしい文字(I/O/0/1)を除外した、部屋コードに使う文字 */
export const ROOM_ID_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** 新規作成する部屋コードの長さ */
export const ROOM_ID_LENGTH = 8;
/** ユーザー入力として受け付ける部屋コードの最大長 */
export const ROOM_ID_MAX_LENGTH = 16;

/** 暗号学的に安全な乱数から部屋コードを生成する（ブラウザ/Workers どちらの `crypto` でも動く） */
export function generateRoomId(length = ROOM_ID_LENGTH): string {
	const bytes = new Uint8Array(length);
	crypto.getRandomValues(bytes);
	return Array.from(bytes, (b) =>
		ROOM_ID_ALPHABET.charAt(b % ROOM_ID_ALPHABET.length),
	).join("");
}

/** ユーザーが入力した部屋コードを正規化する（前後の空白除去・大文字化・長さ制限） */
export function normalizeRoomId(input: string): string {
	return input.trim().toUpperCase().slice(0, ROOM_ID_MAX_LENGTH);
}
