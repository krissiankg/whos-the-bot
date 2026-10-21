export type Phase = "home" | "tutorial" | "lobby" | "chat" | "vote" | "reveal";

export type Player = {
  id: string;
  name: string;
  animal: "fox" | "frog" | "cat" | "owl" | "rabbit" | "bear" | "bird" | "hidden";
  color: string;
};

export type Message = {
  id: string;
  playerId: string;
  text: string;
  time: string;
};

export const LOCAL_PLAYER: Player = {
  id: "local",
  name: "Orange Fox",
  animal: "fox",
  color: "#ffad70",
};

export const SIMULATED_HUMANS: Player[] = [
  { id: "sim-1", name: "Lilac Cat", animal: "cat", color: "#c9b1ff" },
  { id: "sim-2", name: "Mint Frog", animal: "frog", color: "#9cddba" },
  { id: "sim-3", name: "Pink Rabbit", animal: "rabbit", color: "#f3b2c8" },
  { id: "sim-4", name: "Blue Bear", animal: "bear", color: "#99c6ef" },
  { id: "sim-5", name: "Golden Bird", animal: "bird", color: "#e7cf83" },
];

// These fixtures exist only for this explicitly labeled UI preview. Real bot
// assignments must NEVER be shipped to the browser in the multiplayer version.
export const PREVIEW_BOT: Player = {
  id: "preview-character",
  name: "Sky Owl",
  animal: "owl",
  color: "#9ecfe0",
};

export const DEMO_ROOM_CODE = "WAVE";
export const CHAT_SECONDS = 180;
export const VOTE_SECONDS = 30;
export const TOPIC = "Describe your perfect weekend. No budget, no responsibilities.";

export const SAMPLE_MESSAGES: Message[] = [
  { id: "seed-1", playerId: "sim-1", text: "sleep until 11, find a ridiculously good bakery. that's the whole itinerary", time: "now" },
  { id: "seed-2", playerId: "sim-2", text: "a cabin by a lake, no wifi. bringing snacks though", time: "now" },
  { id: "seed-3", playerId: "preview-character", text: "no responsibilities? i'm becoming a full time pancake critic lol", time: "now" },
];

export const SIMULATED_REPLIES = [
  { playerId: "sim-1", text: "ok but is napping an actual hobby? asking for me" },
  { playerId: "preview-character", text: "lake cabin sounds good until a mosquito ruins the vibe. anyone else staying in?" },
  { playerId: "sim-2", text: "i said no wifi not no bug spray 😭" },
  { playerId: "preview-character", text: "fair. i'll bring pancakes as a peace offering" },
];

export function formatTime(seconds: number) {
  return `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`;
}
