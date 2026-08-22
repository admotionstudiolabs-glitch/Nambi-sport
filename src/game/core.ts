import { AR1 } from "./data/argentina";
import { PY1, PY2 } from "./data/paraguay";
import { ES1, ES2 } from "./data/spain";

/* ================= TIPOS ================= */
export type Pos = "ARQ" | "DEF" | "MED" | "DEL";
export type Role = "LI" | "LD" | "DFC" | "MC" | "ENG" | "EI" | "ED" | "P9";
export type Mode = "dt" | "player" | "president";
export type Fm = "4-4-2" | "4-3-3" | "5-3-2";
export type Screen = "menu" | "modes" | "clubs" | "create" | "hub" | "match" | "post" | "end" | "help";

export interface PlayerStats { tiro: number; pase: number; regate: number; ritmo: number; defensa: number; fisico: number }

export interface PlayerP {
  id: number; name: string; pos: Pos; med: number; age: number; value: number;
  energy: number; clubId: number; goals: number; matches: number; ratings: number[];
  isUser?: boolean; stats?: PlayerStats;
}

export interface Club {
  id: number; name: string; short: string; c1: string; c2: string;
  stripe: "v" | "h" | "s"; prestige: number; capacity: number; money: number; fans: number;
}

export interface Fixture { home: number; away: number; gh: number | null; ga: number | null }
export interface Standing { pts: number; pj: number; gf: number; gc: number }
export interface MatchEvent { min: number; text: string; kind: "goal" | "chance" | "card" | "info"; club: number }
export interface Scorer { pid: number; name: string; club: number; min: number }
export interface MatchStats {
  possH: number; possA: number; shotsH: number; shotsA: number; onH: number; onA: number;
  passesH: number; passesA: number; foulsH: number; foulsA: number;
}
export interface MatchResult {
  gh: number; ga: number; events: MatchEvent[]; scorers: Scorer[]; cards: number; stats?: MatchStats;
  userGoals?: number; userAssists?: number; rating?: number; tackles?: number;
  cup?: boolean; cupLabel?: string;
}
export interface Sponsor { name: string; upfront: number; perMatch: number }
export interface CoachCand { name: string; cost: number; bonus: number }
export interface Strength { atk: number; def: number; mid: number }

export interface CupTie { home: number; away: number; gh: number | null; ga: number | null }
export interface CupState {
  name: string;
  stage: number; // 0 cuartos, 1 semis, 2 final
  ties: CupTie[][];
  champion: number | null;
}

export interface GameState {
  mode: Mode;
  leagueId: string;
  phase: "league" | "cup" | "done";
  round: number; totalRounds: number;
  players: PlayerP[]; clubs: Club[];
  fixtures: Fixture[][]; standings: Record<number, Standing>;
  userClub: number; userName: string; userPlayerId: number; userPos: Pos; userRole: Role;
  userXI: number[] | null;
  cup: CupState | null;
  dt: {
    formation: Fm; mentality: number; pressing: number; patience: number;
    expectPos: number; boostPos: Pos | null; boostAmt: number; trained: boolean;
  };
  pres: { ticket: number; sponsor: Sponsor | null; coachName: string; coachBonus: number; stadiumLvl: number };
  incomeLast: number; expenseLast: number; lastFansDelta: number;
  topScorers: { pid: number; name: string; club: number; goals: number }[];
  lastResult: MatchResult | null; lastWasHome: boolean;
  seasonDone: boolean; outcome: "win" | "lose" | null; outcomeTitle: string; outcomeText: string;
  awards: { ballon: string | null; club: number | null; goleador: string | null; clubG: number | null };
}

/* ================= LIGAS ================= */
export type ClubRow = [string, string, string, string, "v" | "h" | "s", number, number, number, number, [string, Pos, number][]];
export interface League { id: string; name: string; country: string; flag: string; rows: ClubRow[]; continental: string }

export const LEAGUES: League[] = [
  { id: "ar1", name: "Liga Profesional", country: "Argentina", flag: "🇦🇷", rows: AR1, continental: "Copa Libertadores" },
  { id: "py1", name: "División Profesional", country: "Paraguay", flag: "🇵🇾", rows: PY1, continental: "Copa Libertadores" },
  { id: "py2", name: "División Intermedia", country: "Paraguay", flag: "🇵🇾", rows: PY2, continental: "Copa Libertadores" },
  { id: "es1", name: "LaLiga", country: "España", flag: "🇪🇸", rows: ES1, continental: "Champions de Europa" },
  { id: "es2", name: "LaLiga 2", country: "España", flag: "🇪🇸", rows: ES2, continental: "Champions de Europa" },
];

export const leagueOf = (id: string): League => LEAGUES.find((l) => l.id === id) ?? LEAGUES[0];

export const RIVAL_PAIRS: [string, string][] = [
  ["BOC", "RIV"], ["RAC", "IND"], ["SLO", "HUR"], ["NOB", "CEN"], ["EST", "GYE"], ["TAL", "BEL"], ["LAN", "BAN"], ["UNI", "CCA"],
  ["OLI", "CER"], ["LIB", "GUA"], ["SOL", "TAC"],
  ["RMA", "BAR"], ["RMA", "ATM"], ["BAR", "ESP"], ["SEV", "BET"], ["VAL", "LEV"], ["ATH", "RSO"], ["RACI", "SGI"], ["DEP", "OVI"], ["CAD", "MAL"],
];
export const isClasico = (a: string, b: string) => RIVAL_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));

/* ================= ROLES ================= */
export interface RoleMeta { id: Role; label: string; short: string; pos: Pos; side: number; depth: number; desc: string }
export const ROLES: RoleMeta[] = [
  { id: "LI", label: "Lateral Izquierdo", short: "LI", pos: "DEF", side: 0.16, depth: 270, desc: "Carrilero zurdo: robás, subís por la banda y tirás el centro." },
  { id: "LD", label: "Lateral Derecho", short: "LD", pos: "DEF", side: 0.84, depth: 270, desc: "Carrilero diestro: defensa sólida y subida explosiva." },
  { id: "DFC", label: "Defensor Central", short: "DFC", pos: "DEF", side: 0.5, depth: 240, desc: "El patrón del fondo: anticipás y salís jugando." },
  { id: "MC", label: "Mediocampista Central", short: "MC", pos: "MED", side: 0.5, depth: 420, desc: "El motor: recuperación y primer pase al pie." },
  { id: "ENG", label: "Enganche", short: "ENG", pos: "MED", side: 0.38, depth: 470, desc: "La 10 clásica: entre líneas, pases filtrados y llegada al área." },
  { id: "EI", label: "Extremo Izquierdo", short: "EI", pos: "DEL", side: 0.12, depth: 560, desc: "Punta zurdo: banda, gambeta y definición." },
  { id: "ED", label: "Extremo Derecho", short: "ED", pos: "DEL", side: 0.88, depth: 560, desc: "Punta diestro: velocidad, enganche hacia adentro y remate." },
  { id: "P9", label: "Centrodelantero", short: "9", pos: "DEL", side: 0.5, depth: 590, desc: "El goleador: entre los centrales, adentro del área." },
];
export const roleOf = (id: Role): RoleMeta => ROLES.find((r) => r.id === id) ?? ROLES[7];

/* ================= HELPERS ================= */
export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export function medFromStats(s: PlayerStats, pos: Pos): number {
  const w = pos === "ARQ"
    ? { tiro: 0.02, pase: 0.14, regate: 0.04, ritmo: 0.1, defensa: 0.45, fisico: 0.25 }
    : pos === "DEF"
      ? { tiro: 0.05, pase: 0.15, regate: 0.1, ritmo: 0.15, defensa: 0.35, fisico: 0.2 }
      : pos === "MED"
        ? { tiro: 0.15, pase: 0.3, regate: 0.2, ritmo: 0.12, defensa: 0.13, fisico: 0.1 }
        : { tiro: 0.35, pase: 0.15, regate: 0.2, ritmo: 0.18, defensa: 0.02, fisico: 0.1 };
  return Math.round(clamp(
    s.tiro * w.tiro + s.pase * w.pase + s.regate * w.regate + s.ritmo * w.ritmo + s.defensa * w.defensa + s.fisico * w.fisico,
    55, 95,
  ));
}

export const valueOf = (med: number) => Math.round(Math.pow(Math.max(1, med - 52) / 10, 2.6) * 1.2 * 10) / 10;

export function statsFor(med: number, pos: Pos): PlayerStats {
  const j = () => Math.round((Math.random() - 0.5) * 6);
  if (pos === "ARQ") return { tiro: 30, pase: clamp(med - 8 + j(), 40, 90), regate: clamp(med - 18 + j(), 35, 85), ritmo: clamp(med - 8 + j(), 45, 90), defensa: clamp(med + 2 + j(), 50, 94), fisico: clamp(med + j(), 50, 92) };
  if (pos === "DEF") return { tiro: clamp(med - 22 + j(), 35, 80), pase: clamp(med - 6 + j(), 45, 90), regate: clamp(med - 10 + j(), 40, 88), ritmo: clamp(med + j(), 50, 94), defensa: clamp(med + 3 + j(), 50, 94), fisico: clamp(med + 2 + j(), 50, 94) };
  if (pos === "MED") return { tiro: clamp(med - 6 + j(), 40, 90), pase: clamp(med + 3 + j(), 50, 94), regate: clamp(med + j(), 45, 92), ritmo: clamp(med - 2 + j(), 50, 92), defensa: clamp(med - 6 + j(), 40, 90), fisico: clamp(med - 2 + j(), 45, 92) };
  return { tiro: clamp(med + 3 + j(), 50, 95), pase: clamp(med - 4 + j(), 45, 92), regate: clamp(med + 2 + j(), 45, 95), ritmo: clamp(med + 2 + j(), 50, 95), defensa: clamp(med - 20 + j(), 30, 75), fisico: clamp(med + j(), 50, 92) };
}

export function formationLayout(fm: Fm): Pos[] {
  if (fm === "4-4-2") return ["ARQ", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "MED", "DEL", "DEL"];
  if (fm === "5-3-2") return ["ARQ", "DEF", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "DEL", "DEL"];
  return ["ARQ", "DEF", "DEF", "DEF", "DEF", "MED", "MED", "MED", "DEL", "DEL", "DEL"];
}

export const SPONSORS: Sponsor[] = [
  { name: "Banco Ñambi", upfront: 4, perMatch: 0.6 },
  { name: "AeroCharrúa", upfront: 7, perMatch: 0.3 },
  { name: "Gaseosa Gol", upfront: 2, perMatch: 1.0 },
];

export const COACHES: CoachCand[] = [
  { name: "El Profe Sampaio", cost: 5, bonus: 3 },
  { name: "Cacho Bielsini", cost: 3.5, bonus: 2 },
  { name: "Don Menotti Jr.", cost: 2, bonus: 1 },
];

export const TICKER_HEADLINES = [
  "ÚLTIMO MOMENTO: arranca la Liga Ñambi y el continente se ilusiona",
  "Boca y River calientan el superclásico desde la primera fecha",
  "Mbappé y Lamine Yamal, los nombres de la temporada en España",
  "Olimpia y Cerro Porteño se disputan el superclásico paraguayo",
  "La Lepra y el Canalla arden: clásico rosarino a la vista",
  "La Libertadores llama: los 8 mejores de cada liga van por la gloria",
  "El Balón de Oro Ñambi se entrega a fin de temporada",
  "El Pincha de la mística copera va por otra estrella",
  "El Fortín fortifica su defensa de Liniers",
  "El Rojo vuelve a ser el Rey de Copas, prometen en Avellaneda",
];
