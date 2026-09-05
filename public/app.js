// プランニングポーカーのルーム画面用クライアントスクリプト。
// ビルド不要のプレーンな ES モジュールとして配信している。

const CARD_DECK = ["0", "1", "2", "3", "5", "8", "13", "20", "40", "100", "?", "☕"];

const root = document.querySelector(".page-room");
const roomId = root.dataset.roomId;
const userId = root.dataset.userId;

const els = {
	roomName: document.getElementById("room-name"),
	participants: document.getElementById("participants"),
	cards: document.getElementById("cards"),
	reveal: document.getElementById("reveal"),
	reset: document.getElementById("reset"),
	status: document.getElementById("connection-status"),
	nameInput: document.getElementById("my-name"),
	spectator: document.getElementById("spectator"),
	copyLink: document.getElementById("copy-link"),
};

let selectedVote = null;
let socket = null;
let reconnectDelayMs = 500;

function buildCards() {
	els.cards.innerHTML = "";
	for (const value of CARD_DECK) {
		const btn = document.createElement("button");
		btn.type = "button";
		btn.className = "card-btn";
		btn.textContent = value;
		btn.addEventListener("click", () => {
			selectedVote = value;
			send({ type: "vote", value });
			renderSelection();
		});
		els.cards.append(btn);
	}
}

function renderSelection() {
	for (const btn of els.cards.querySelectorAll(".card-btn")) {
		btn.classList.toggle("selected", btn.textContent === selectedVote);
	}
}

function renderState(state) {
	els.roomName.textContent = state.roomName ? state.roomName : `部屋 ${roomId}`;

	els.participants.innerHTML = "";
	for (const p of state.participants) {
		const card = document.createElement("div");
		card.className = "participant";
		if (p.hasVoted) card.classList.add("voted");
		if (p.isSpectator) card.classList.add("spectator");

		const name = document.createElement("div");
		name.className = "name";
		name.textContent = p.id === userId ? `${p.name} (自分)` : p.name;

		const slot = document.createElement("div");
		slot.className = "vote-slot";
		slot.textContent = state.revealed ? (p.vote ?? (p.isSpectator ? "👀" : "-")) : p.hasVoted ? "✅" : "";

		card.append(name, slot);
		els.participants.append(card);
	}

	els.reset.disabled = !state.revealed;
}

function send(message) {
	if (socket && socket.readyState === WebSocket.OPEN) {
		socket.send(JSON.stringify(message));
	}
}

function sendJoin() {
	send({
		type: "join",
		name: els.nameInput.value.trim() || "ゲスト",
		isSpectator: els.spectator.checked,
	});
}

function connect() {
	const protocol = location.protocol === "https:" ? "wss" : "ws";
	socket = new WebSocket(`${protocol}://${location.host}/rooms/${roomId}/ws`);

	socket.addEventListener("open", () => {
		reconnectDelayMs = 500;
		els.status.textContent = "接続中";
		sendJoin();
	});

	socket.addEventListener("message", (event) => {
		const message = JSON.parse(event.data);
		if (message.type === "state") {
			renderState(message.state);
		} else if (message.type === "error") {
			els.status.textContent = `エラー: ${message.message}`;
		}
	});

	socket.addEventListener("close", () => {
		els.status.textContent = "切断されました。再接続しています…";
		setTimeout(connect, reconnectDelayMs);
		reconnectDelayMs = Math.min(reconnectDelayMs * 2, 8000);
	});

	socket.addEventListener("error", () => {
		socket.close();
	});
}

els.reveal.addEventListener("click", () => send({ type: "reveal" }));
els.reset.addEventListener("click", () => {
	selectedVote = null;
	renderSelection();
	send({ type: "reset" });
});

let nameDebounce;
els.nameInput.addEventListener("input", () => {
	clearTimeout(nameDebounce);
	nameDebounce = setTimeout(() => send({ type: "rename", name: els.nameInput.value.trim() || "ゲスト" }), 400);
});

els.spectator.addEventListener("change", sendJoin);

els.copyLink.addEventListener("click", async () => {
	try {
		await navigator.clipboard.writeText(location.href);
		els.copyLink.textContent = "コピーしました！";
		setTimeout(() => {
			els.copyLink.textContent = "招待リンクをコピー";
		}, 1500);
	} catch {
		// クリップボードAPIが使えない環境ではユーザーにURLを手動で伝える
		window.prompt("このURLを共有してください", location.href);
	}
});

buildCards();
connect();
