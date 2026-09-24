// 画面右上の言語メニュー・テーマメニュー (全ページ共通、/corner-controls.js としてバンドルされる)。
// 言語メニューはサーバーが描画する (src/views.tsx)。ここではテーマメニューの描画と、両メニューの開閉を担う。
// テーマ自体の初期適用は src/views.tsx のインラインスクリプト (FOUC 防止) が行う。
import { render, useRef, useState } from "hono/jsx/dom";
import { t } from "./locale";

type Theme = "auto" | "light" | "dark";

const THEMES: Theme[] = ["auto", "light", "dark"];

const STORAGE_KEY = "pp-theme";

function currentTheme(): Theme {
	const theme = document.documentElement.dataset.theme;
	return theme === "dark" || theme === "light" ? theme : "auto";
}

function icon(theme: Theme): string {
	if (theme === "dark") return "🌙";
	if (theme === "light") return "☀️";
	return "🌓";
}

function applyTheme(theme: Theme) {
	if (theme === "auto") {
		delete document.documentElement.dataset.theme;
		localStorage.removeItem(STORAGE_KEY);
	} else {
		document.documentElement.dataset.theme = theme;
		localStorage.setItem(STORAGE_KEY, theme);
	}
}

function ThemeMenu() {
	const [theme, setTheme] = useState<Theme>(currentTheme);
	const menuRef = useRef<HTMLDetailsElement>(null);

	const select = (next: Theme) => {
		applyTheme(next);
		setTheme(next);
		if (menuRef.current) menuRef.current.open = false;
	};

	const label = `${t.themeMenuLabel}: ${t.themeNames[theme]}`;
	return (
		<details id="theme-menu" class="corner-menu" ref={menuRef}>
			<summary
				class="corner-menu-button theme-menu-button"
				aria-label={label}
				title={label}
			>
				{icon(theme)}
			</summary>
			<ul class="corner-menu-list">
				{THEMES.map((option) => (
					<li>
						<button
							type="button"
							aria-pressed={option === theme ? "true" : "false"}
							onClick={() => select(option)}
						>
							<span aria-hidden="true">{icon(option)}</span>
							{t.themeNames[option]}
						</button>
					</li>
				))}
			</ul>
		</details>
	);
}

const mount = document.getElementById("theme-menu-root");
if (mount) {
	// サーバーが出力したプレースホルダーのボタンを置き換える
	render(<ThemeMenu />, mount);
}

// <details> は外側をクリックしても Esc でも閉じないので、メニューとして自然に閉じるようにする。
// 別のメニューを開いたときも、開いていた方を閉じる。
function closeMenus(except: Element | null = null) {
	for (const menu of document.querySelectorAll<HTMLDetailsElement>(
		".corner-menu[open]",
	)) {
		if (menu !== except) menu.open = false;
	}
}

document.addEventListener("click", (event) => {
	const target = event.target;
	closeMenus(target instanceof Element ? target.closest(".corner-menu") : null);
});

document.addEventListener("keydown", (event) => {
	if (event.key !== "Escape") return;
	const open = document.querySelector<HTMLDetailsElement>(".corner-menu[open]");
	if (!open) return;
	closeMenus();
	open.querySelector("summary")?.focus();
});
