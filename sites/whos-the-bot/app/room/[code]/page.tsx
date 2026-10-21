import { notFound } from "next/navigation";
import { LiveLobby } from "@/components/live-lobby";
import { lobbyConfigured } from "@/lib/server/lobby";
import { UnavailableRoom } from "@/components/unavailable-room";

export default async function RoomPage({ params }: { params: Promise<{ code: string }> }) {
  const code = (await params).code.toUpperCase();
  if (!/^[A-Z]{4}$/.test(code)) notFound();
  if (!lobbyConfigured()) return <UnavailableRoom />;
  return <LiveLobby key={code} code={code} supabaseUrl={process.env.NEXT_PUBLIC_SUPABASE_URL!} publishableKey={process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!} />;
}
