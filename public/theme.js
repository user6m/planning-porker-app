// ダークモード切り替えボタンの挙動。
// テーマ自体の初期適用は layout 内のインラインスクリプト（FOUC防止）で行う。

const STORAGE_KEY = "pp-theme";
const button = document.getElementById("theme-toggle");

function currentTheme() {
	return document.documentElement.dataset.theme || "auto";
}

function icon(theme) {
	if (theme === "dark") return "☀️";
	if (theme === "light") return "🌙";
	return "🌓";
}

function applyIcon() {
	button.textContent = icon(currentTheme());
}

button.addEventListener("click", () => {
	const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
	const next = currentTheme() === "dark" ? "light" : currentTheme() === "light" ? "dark" : prefersDark ? "light" : "dark";

	document.documentElement.dataset.theme = next;
	localStorage.setItem(STORAGE_KEY, next);
	applyIcon();
});

applyIcon();
