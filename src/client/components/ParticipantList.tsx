import type { RoomParticipant } from "../../shared/types";

interface ParticipantListProps {
	participants: RoomParticipant[];
	revealed: boolean;
	/** 自分の userId。「(自分)」の表示に使う */
	meId: string;
}

function voteLabel(participant: RoomParticipant, revealed: boolean): string {
	if (revealed) {
		return participant.vote ?? (participant.isSpectator ? "👀" : "-");
	}
	return participant.hasVoted ? "✅" : "";
}

export function ParticipantList({
	participants,
	revealed,
	meId,
}: ParticipantListProps) {
	return (
		<section className="participants" aria-live="polite" aria-label="参加者">
			{participants.map((participant) => {
				const classes = ["participant"];
				if (participant.hasVoted) classes.push("voted");
				if (participant.isSpectator) classes.push("spectator");
				return (
					<div key={participant.id} className={classes.join(" ")}>
						<div className="name">
							{participant.id === meId
								? `${participant.name} (自分)`
								: participant.name}
						</div>
						<div className="vote-slot">{voteLabel(participant, revealed)}</div>
					</div>
				);
			})}
		</section>
	);
}
