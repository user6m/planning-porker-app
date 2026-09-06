import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes, useLocation } from "react-router";
import { afterEach, describe, expect, it, vi } from "vite-plus/test";
import { HomePage } from "./HomePage";

function LocationProbe() {
	const location = useLocation();
	return <p data-testid="location">{location.pathname}</p>;
}

function renderHomePage() {
	return render(
		<MemoryRouter initialEntries={["/"]}>
			<Routes>
				<Route path="/" element={<HomePage />} />
				<Route path="/rooms/:roomId" element={<LocationProbe />} />
			</Routes>
		</MemoryRouter>,
	);
}

function jsonResponse(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), {
		status,
		headers: { "content-type": "application/json" },
	});
}

type FetchHandler = (url: string, init?: RequestInit) => Response | undefined;

/** `fetch` を差し替え、パスごとの応答を組み立てる */
function mockFetch(handler: FetchHandler) {
	return vi
		.spyOn(globalThis, "fetch")
		.mockImplementation(async (input, init) => {
			const url = input instanceof Request ? input.url : String(input);
			const response = handler(url, init);
			if (!response) throw new Error(`unexpected fetch: ${url}`);
			return response;
		});
}

describe("HomePage", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("prefills the host name from the session and navigates to the created room", async () => {
		const fetchMock = mockFetch((url, init) => {
			if (url === "/api/me")
				return jsonResponse({ userId: "u1", name: "ゲスト1234" });
			if (url === "/api/rooms" && init?.method === "POST") {
				return jsonResponse({ roomId: "ABCD2345" }, 201);
			}
			return undefined;
		});
		renderHomePage();

		const nameInput =
			await screen.findByLabelText<HTMLInputElement>("あなたの表示名");
		expect(nameInput.value).toBe("ゲスト1234");

		const user = userEvent.setup();
		await user.type(screen.getByLabelText("部屋の名前"), "スプリント12");
		await user.click(screen.getByRole("button", { name: "部屋を作成" }));

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/rooms/ABCD2345",
			);
		});

		const createCall = fetchMock.mock.calls.find(
			([input]) => input === "/api/rooms",
		);
		expect(createCall).toBeDefined();
		expect(JSON.parse(createCall?.[1]?.body as string)).toEqual({
			roomName: "スプリント12",
			hostName: "ゲスト1234",
		});
	});

	it("shows the error message returned by the API", async () => {
		mockFetch((url, init) => {
			if (url === "/api/me")
				return jsonResponse({ userId: "u1", name: "ゲスト1234" });
			if (url === "/api/rooms" && init?.method === "POST") {
				return jsonResponse(
					{ error: "部屋の名前と表示名を入力してください" },
					400,
				);
			}
			return undefined;
		});
		renderHomePage();

		const user = userEvent.setup();
		await user.type(await screen.findByLabelText("部屋の名前"), "スプリント12");
		await user.click(screen.getByRole("button", { name: "部屋を作成" }));

		expect(
			await screen.findByText("部屋の名前と表示名を入力してください"),
		).toBeDefined();
		expect(screen.getByRole("button", { name: "部屋を作成" })).toBeDefined();
	});

	it("navigates to the normalized room code when joining", async () => {
		mockFetch((url) =>
			url === "/api/me"
				? jsonResponse({ userId: "u1", name: "ゲスト1234" })
				: undefined,
		);
		renderHomePage();

		const user = userEvent.setup();
		await user.type(screen.getByLabelText("部屋コード"), " ab12cd34 ");
		await user.click(screen.getByRole("button", { name: "参加する" }));

		await waitFor(() => {
			expect(screen.getByTestId("location").textContent).toBe(
				"/rooms/AB12CD34",
			);
		});
	});
});
