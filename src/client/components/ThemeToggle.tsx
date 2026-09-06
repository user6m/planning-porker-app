import { type Theme, useTheme } from "../hooks/useTheme";

function iconFor(theme: Theme): string {
	if (theme === "dark") return "☀️";
	if (theme === "light") return "🌙";
	return "🌓";
}

export function ThemeToggle() {
	const { theme, toggle } = useTheme();
	return (
		<button
			type="button"
			className="theme-toggle"
			aria-label="表示テーマを切り替え"
			title={`現在のテーマ: ${theme === "auto" ? "OSの設定に従う" : theme === "dark" ? "ダーク" : "ライト"}`}
			onClick={toggle}
		>
			{iconFor(theme)}
		</button>
	);
}
