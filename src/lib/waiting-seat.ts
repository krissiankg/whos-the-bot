import type { LobbyPlayer } from "./lobby";
import { translate } from "./translations.mjs";

// Defense in depth: never render a cached pre-fix lobby alias. This is only
// for waiting seats, never for round participants, voting or the leaderboard.
export function waitingSeat(player: LobbyPlayer, index: number, language: string): LobbyPlayer {
  return { ...player, name: translate(language, "Player {0}", {0: index + 1}), animal: "hidden", color: "#b6b9ad" };
}

