import { GamePreview } from "@/components/game-preview";
import { lobbyConfigured } from "@/lib/server/lobby";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ dev?: string; room?: string }>;
}) {
  const params = await searchParams;
  const developerMode = process.env.NODE_ENV === "development" && params.dev === "1";
  const initialRoomCode = typeof params.room === "string" ? params.room : "";
  return (
    <GamePreview
      key={`${developerMode}:${initialRoomCode}`}
      developerMode={developerMode}
      developmentAvailable={process.env.NODE_ENV === "development"}
      initialRoomCode={initialRoomCode}
      liveAvailable={lobbyConfigured() && !developerMode}
    />
  );
}
