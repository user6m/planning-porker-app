import { Navigate, useLocation } from "react-router";
import { normalizeRoomId } from "../../shared/room-id";

/** 旧URL `/rooms/join?roomId=XXXX` を `/rooms/XXXX` に置き換える（部屋コードが無ければトップへ） */
export function JoinRedirect() {
	const location = useLocation();
	const roomId = normalizeRoomId(
		new URLSearchParams(location.search).get("roomId") ?? "",
	);
	return <Navigate to={roomId ? `/rooms/${roomId}` : "/"} replace />;
}
