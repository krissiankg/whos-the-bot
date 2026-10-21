import { cookies } from "next/headers";

export const GUEST_COOKIE = "wtb_guest";

export function lobbyConfigured() {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

export async function guestToken() {
  const value = (await cookies()).get(GUEST_COOKIE)?.value;
  return value && /^[a-f0-9]{64}$/.test(value) ? value : null;
}

export async function roomCommand(action: string, args: Record<string, unknown>, token: string) {
  const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/game-lobby`, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!, "x-guest-token": token },
    body: JSON.stringify({ action, args }), signal: AbortSignal.timeout(20000),
  });
  const body = await response.json();
  return { body, status: response.status };
}
