import type { Club } from "../game/core";

export function Crest({ club, size = 48 }: { club: Club; size?: number }) {
  const light = club.c1 === "#f2f2f2" || club.c1 === "#f4f4f4";
  const stripes = [];
  if (club.stripe === "v") {
    for (let i = 0; i < 4; i++) stripes.push(<rect key={i} x={10 + i * 11} y="4" width="5.5" height="40" fill={club.c2} />);
  } else if (club.stripe === "h") {
    for (let i = 0; i < 3; i++) stripes.push(<rect key={i} x="4" y={10 + i * 11} width="40" height="5.5" fill={club.c2} />);
  } else if (club.stripe === "s") {
    stripes.push(<path key="s" d="M4 34 L34 4 L44 4 L4 44 Z" fill={club.c2} />);
  }
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" style={{ flexShrink: 0 }}>
      <defs>
        <clipPath id={`crest-${club.id}-${size}`}>
          <path d="M24 2 L44 8 V26 C44 38 35 44 24 46 C13 44 4 38 4 26 V8 Z" />
        </clipPath>
      </defs>
      <g clipPath={`url(#crest-${club.id}-${size})`}>
        <rect width="48" height="48" fill={club.c1} />
        {stripes}
        <circle cx="24" cy="22" r="8" fill="none" stroke={light ? "#06170f" : "#f2ffe9"} strokeWidth="2" opacity="0.9" />
        <path d="M24 15 L26 20 L31 20 L27 23 L28.5 28 L24 25 L19.5 28 L21 23 L17 20 L22 20 Z" fill={light ? "#06170f" : "#f2ffe9"} opacity="0.9" />
      </g>
      <path d="M24 2 L44 8 V26 C44 38 35 44 24 46 C13 44 4 38 4 26 V8 Z" fill="none" stroke={light ? "#06170f" : "#f2ffe9"} strokeWidth="2.5" />
    </svg>
  );
}

export function MedBadge({ med }: { med: number }) {
  const bg = med >= 84 ? "#b8ff2e" : med >= 78 ? "#41d6ff" : med >= 72 ? "#ffc233" : "#ff4257";
  return <span className="medbadge" style={{ background: bg, color: "#06170a" }}>{med}</span>;
}

export function PosTag({ pos }: { pos: string }) {
  const c = pos === "ARQ" ? "#ffc233" : pos === "DEF" ? "#41d6ff" : pos === "MED" ? "#b8ff2e" : "#ff4257";
  return <span className="font-display text-xs tracking-widest px-1.5 py-0.5" style={{ background: `${c}22`, color: c, border: `1px solid ${c}55` }}>{pos}</span>;
}
