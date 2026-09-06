import { CARD_DECK, type CardValue } from "../../shared/types";

interface CardDeckProps {
	/** 自分が選択中のカード。未選択なら null */
	selected: CardValue | null;
	/** 公開後など、投票できない状態 */
	disabled: boolean;
	onSelect: (value: CardValue) => void;
}

export function CardDeck({ selected, disabled, onSelect }: CardDeckProps) {
	return (
		<div className="cards" role="group" aria-label="見積もりカード">
			{CARD_DECK.map((value) => {
				const isSelected = value === selected;
				return (
					<button
						key={value}
						type="button"
						className={isSelected ? "card-btn selected" : "card-btn"}
						aria-pressed={isSelected}
						disabled={disabled}
						onClick={() => onSelect(value)}
					>
						{value}
					</button>
				);
			})}
		</div>
	);
}
