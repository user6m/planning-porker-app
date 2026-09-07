// ダークモード切り替えボタン (全ページ共通、/theme.js としてバンドルされる)。
// テーマ自体の初期適用は src/views.tsx のインラインスクリプト (FOUC 防止) が行う。
import { render, useState } from "hono/jsx/dom";

type Theme = "dark" | "light" | "auto";

const STORAGE_KEY = "pp-theme";

function currentTheme(): Theme {
	const theme = document.documentElement.dataset.theme;
	return theme === "dark" || theme === "light" ? theme : "auto";
}

function icon(theme: Theme): string {
	if (theme === "dark") return "☀️";
	if (theme === "light") return "🌙";
	return "🌓";
}

function nextTheme(theme: Theme): Theme {
	if (theme === "dark") return "light";
	if (theme === "light") return "dark";
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	return prefersDark ? "light" : "dark";
}

function ThemeToggle() {
	const [theme, setTheme] = useState<Theme>(currentTheme);

	const toggle = () => {
		const next = nextTheme(theme);
		document.documentElement.dataset.theme = next;
		localStorage.setItem(STORAGE_KEY, next);
		setTheme(next);
	};

	return (
		<button
			id="theme-toggle"
			class="theme-toggle"
			type="button"
			aria-label="表示テーマを切り替え"
			onClick={toggle}
		>
			{icon(theme)}
		</button>
	);
}

const mount = document.getElementById("theme-toggle-root");
if (mount) {
	// サーバーが出力したプレースホルダーのボタンを置き換える
	render(<ThemeToggle />, mount);
}
