import type { Player } from "./preview";

export type LobbyPlayer = Player & { ready: boolean; online: boolean };
export type LeaderboardPlayer = Player & {score:number;found:number;me:boolean;rank:number};
export type LobbyState = {
  room: { id: string; code: string; hostId: string | null; language: "en" | "fr"; phase: string; deadline: string | null; version: number; createdAt: string; expiresAt: string };
  meId: string;
  players: LobbyPlayer[];
  serverNow: string;
  aiAvailable?: boolean;
  isHost?: boolean;
  match?: {totalRounds:number;finished:boolean;practice:boolean};
  leaderboard?: LeaderboardPlayer[];
  round?: {
    id: string; number?:number; topic: string; phase: "chat" | "vote" | "reveal" | "cancelled";
    practice: boolean; pausedUntil: string | null; myVote: string | null; cancelReason?: string;
    messages: { id:string; playerId:string; text:string; createdAt:string }[];
    reportedIds: string[]; hostReportIds: string[];
    reveal?: { botId:string; votes:{voterId:string;targetId:string|null}[] };
    result?: {aiWon:boolean;scores:{participantId:string;delta:number;foundBot:boolean;accusations:number}[]};
  };
};

export const ROUND_INTERRUPTION_MESSAGES: Record<string,string> = {"ai_configuration":"The AI provider rejected the request. The owner must check the key and model in Administration.","ai_budget":"The game’s AI request limit has been reached. Try again after the limit resets.","ai_service":"Several AI replies failed or timed out. The round stopped safely; please try a new room later.","players_disconnected":"Too few players reconnected within 60 seconds. Keep at least two devices connected."};

export const LOBBY_ERRORS: Record<string, string> = {
  GAME_FINISHED: "This game is finished. Create a new room to play again.",
  AI_NOT_CONFIGURED: "The project owner must configure a valid NVIDIA Build or OpenAI provider and API key in the server secrets before a real round can start.",
  NOT_READY: "At least two humans must be online and every human must be ready.",
  PRACTICE_REQUIRED: "With two humans, the host must explicitly select practice mode.",
  CHAT_CLOSED: "Chat has ended or is paused. Refresh to see the current phase.",
  VOTE_CLOSED: "Voting has ended or is paused. Refresh to see the current phase.",
  VOTE_LOCKED: "Your vote is already locked in.",
  MESSAGE_REJECTED: "Use 1–280 characters, keep it kind, and avoid links or personal contact details.",
  ROOM_NOT_FOUND: "This room doesn’t exist or has expired. Check the code with your host.",
  ROOM_FULL: "This room already has six humans. Ask the host to free a seat.",
  KICKED: "The host removed your seat from this room. You can’t rejoin with this guest session.",
  NOT_A_MEMBER: "Join this room to take a seat.",
  INVALID_SESSION: "Your guest session is missing. Join the room again.",
  SESSION_REVOKED: "This guest seat is no longer available.",
  HOST_ONLY: "Only the current host can do that.",
  INVALID_TARGET: "This player is no longer available.",
  INVALID_CODE: "Enter the four-letter room code.",
  INVALID_REQUEST: "That request wasn’t valid. Please try again.",
  ROUND_IN_PROGRESS: "The round has already started.",
  RATE_LIMITED: "Too many requests. Please wait before trying again.",
  SERVER_UNAVAILABLE: "The room server is unavailable. Your seat is saved; try reconnecting.",
  NOT_CONFIGURED: "Supabase isn’t configured on this server yet.",
  ORIGIN_REJECTED: "This action must come from the game’s own website.",
};

export class LobbyError extends Error {
  constructor(public code: string, public status: number) { super(LOBBY_ERRORS[code] || LOBBY_ERRORS.SERVER_UNAVAILABLE); }
}

export async function lobbyRequest<T = LobbyState>(action: string, args: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch("/api/lobby", {
    method: "POST", credentials: "same-origin", cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, args }),
    signal: AbortSignal.timeout(25000),
  });
  const data = await response.json();
  if (!response.ok) throw new LobbyError(data.error || "SERVER_UNAVAILABLE", response.status);
  return data as T;
}

export async function enterLiveRoom(action: "create" | "join", args: Record<string, unknown>) {
  // Bootstrap the HttpOnly credential before a command so retries use one guest.
  await lobbyRequest("session");
  return lobbyRequest(action, args);
}
