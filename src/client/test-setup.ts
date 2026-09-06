// jsdom 上で動く React コンポーネントテスト共通のセットアップ (vite.config.ts の test.projects "client")
import { cleanup } from "@testing-library/react";
import { afterEach } from "vite-plus/test";

// Vitest の globals を有効にしていないので、各テスト後の DOM 片付けを明示的に行う
afterEach(() => {
	cleanup();
});
