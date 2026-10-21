import type { Player } from "@/lib/preview";

export function Avatar({
  player,
  size = "normal",
  className = "",
}: {
  player: Player;
  size?: "small" | "normal" | "large" | "hero";
  className?: string;
}) {
  if (player.animal === "hidden") return (
    <span className={`avatar avatar-${size} ${className}`} style={{ "--avatar-color": "#b6b9ad" } as React.CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none"><circle cx="50" cy="34" r="15" stroke="currentColor" strokeWidth="5" /><path d="M23 80v-8a27 27 0 0 1 54 0v8" stroke="currentColor" strokeWidth="5" strokeLinecap="round" /><path d="M17 18h66M17 51h66" stroke="currentColor" strokeWidth="3" strokeDasharray="4 7" opacity=".3" /></svg>
    </span>
  );
  const isFox = player.animal === "fox";
  const isFrog = player.animal === "frog";
  const isRabbit = player.animal === "rabbit";
  const isBear = player.animal === "bear";

  return (
    <span className={`avatar avatar-${size} ${className}`} style={{ "--avatar-color": player.color } as React.CSSProperties} aria-hidden="true">
      <svg viewBox="0 0 100 100" fill="none">
        {isRabbit ? <><path d="M28 45C7-7 32-6 42 38" fill="currentColor" /><path d="M58 38C69-6 93-7 72 45" fill="currentColor" /><path d="M29 35 28 13M70 35l2-22" stroke="#382a37" strokeWidth="5" strokeLinecap="round" /></> : isBear ? <><circle cx="25" cy="31" r="14" fill="currentColor" /><circle cx="75" cy="31" r="14" fill="currentColor" /></> : isFrog ? <><circle cx="28" cy="33" r="18" fill="currentColor" /><circle cx="72" cy="33" r="18" fill="currentColor" /></> : <><path d="m18 49-2-32 29 17M55 34l29-17-2 32" fill="currentColor" /><path d="m24 34-1-8 11 12m32 0 11-12-1 8" stroke="#30332c" strokeWidth="3" strokeLinecap="round" /></>}
        <path d={isFox ? "M15 40Q50 23 85 40L80 67 50 86 20 67Z" : "M17 48Q17 28 50 28T83 48v10Q83 82 50 82T17 58Z"} fill="currentColor" />
        {isFox && <path d="m21 53 29 18 29-18-6 19-23 13-23-13Z" fill="#ffdfbc" />}
        {player.animal === "owl" && <><circle cx="33" cy="49" r="17" fill="#dbedf0" /><circle cx="67" cy="49" r="17" fill="#dbedf0" /></>}
        <path d="M31 47v7m38-7v7" stroke="#20261f" strokeWidth="6" strokeLinecap="round" />
        {player.animal === "bird" || player.animal === "owl" ? <path d="m44 61 6 9 6-9Z" fill="#263028" /> : <><path d="M46 62q4-4 8 0l-4 5Z" fill="#263028" /><path d={isFrog ? "M37 65q13 13 26 0" : "M43 70q7 5 14 0"} stroke="#263028" strokeWidth="2.5" strokeLinecap="round" /></>}
        {player.animal === "cat" && <path d="m21 61-12-3m12 9-12 2m70-8 12-3m-12 9 12 2" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />}
      </svg>
    </span>
  );
}
