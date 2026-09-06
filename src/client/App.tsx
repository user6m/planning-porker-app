import { Navigate, Route, Routes } from "react-router";
import { ThemeToggle } from "./components/ThemeToggle";
import { HomePage } from "./pages/HomePage";
import { JoinRedirect } from "./pages/JoinRedirect";
import { RoomPage } from "./pages/RoomPage";

export function App() {
	return (
		<>
			<ThemeToggle />
			<Routes>
				<Route path="/" element={<HomePage />} />
				{/* 旧URL (/rooms/join?roomId=XXXX) との互換用。/rooms/:roomId より静的なパスが優先される */}
				<Route path="/rooms/join" element={<JoinRedirect />} />
				<Route path="/rooms/:roomId" element={<RoomPage />} />
				<Route path="*" element={<Navigate to="/" replace />} />
			</Routes>
			<footer className="app-footer">v{__APP_VERSION__}</footer>
		</>
	);
}
