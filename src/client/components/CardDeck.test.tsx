import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vite-plus/test";
import { CARD_DECK, type CardValue } from "../../shared/types";
import { CardDeck } from "./CardDeck";

describe("CardDeck", () => {
	it("renders every card in the deck", () => {
		render(<CardDeck selected={null} disabled={false} onSelect={() => {}} />);
		const buttons = screen.getAllByRole("button");
		expect(buttons.map((b) => b.textContent)).toEqual([...CARD_DECK]);
	});

	it("reports the clicked value and highlights the selected card", async () => {
		const onSelect = vi.fn<(value: CardValue) => void>();
		const user = userEvent.setup();
		const { rerender } = render(
			<CardDeck selected={null} disabled={false} onSelect={onSelect} />,
		);

		await user.click(screen.getByRole("button", { name: "5" }));
		expect(onSelect).toHaveBeenCalledWith("5");

		rerender(<CardDeck selected="5" disabled={false} onSelect={onSelect} />);
		const five = screen.getByRole("button", { name: "5" });
		expect(five.getAttribute("aria-pressed")).toBe("true");
		expect(five.classList.contains("selected")).toBe(true);
		expect(
			screen.getByRole("button", { name: "8" }).getAttribute("aria-pressed"),
		).toBe("false");
	});

	it("disables every card once the votes are revealed", () => {
		render(<CardDeck selected="3" disabled onSelect={() => {}} />);
		for (const button of screen.getAllByRole("button")) {
			expect((button as HTMLButtonElement).disabled).toBe(true);
		}
	});
});
