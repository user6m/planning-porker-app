import { useCallback, useState } from "react";

export type Theme = "light" | "dark" | "auto";

const STORAGE_KEY = "pp-theme";

/** index.html のインラインスクリプトが適用済みの `data-theme` から現在のテーマを読む */
function readCurrentTheme(): Theme {
	if (typeof document === "undefined") return "auto";
	const theme = document.documentElement.dataset.theme;
	return theme === "dark" || theme === "light" ? theme : "auto";
}

function applyTheme(theme: Theme): void {
	document.documentElement.dataset.theme = theme;
	try {
		localStorage.setItem(STORAGE_KEY, theme);
	} catch {
		// プライベートモードなどで保存できなくても、このページ内では切り替えを有効にする
	}
}

/** ダークモードの切り替え。auto(OS設定に従う) → 反対のテーマ → 元のテーマ … と循環する */
export function useTheme(): { theme: Theme; toggle: () => void } {
	const [theme, setTheme] = useState<Theme>(readCurrentTheme);

	const toggle = useCallback(() => {
		const prefersDark = window.matchMedia(
			"(prefers-color-scheme: dark)",
		).matches;
		let next: Theme;
		if (theme === "dark") next = "light";
		else if (theme === "light") next = "dark";
		else next = prefersDark ? "light" : "dark";
		applyTheme(next);
		setTheme(next);
	}, [theme]);

	return { theme, toggle };
}
