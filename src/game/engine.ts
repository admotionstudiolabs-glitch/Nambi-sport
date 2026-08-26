import type {
  Club, CupState, CupTie, Fm, Fixture, GameState, MatchResult, Mode, PlayerP, PlayerStats, Pos, Role, Standing, Strength,
} from "./core";
import { COACHES, clamp, formationLayout, isClasico, leagueOf, medFromStats, statsFor, valueOf, wageOf } from "./core";
import type { GameEvent, MarketPlayer, MatchRecord } from "./core";

const FREE_AGENTS: [string, Pos, number, number, string][] = [
  ["Ángel Di María", "DEL", 86, 37, "🇦🇷"], ["Leandro Paredes", "MED", 85, 31, "🇦🇷"],
  ["Nicolás Otamendi", "DEF", 84, 37, "🇦🇷"], ["Gerónimo Rulli", "ARQ", 82, 33, "🇦🇷"],
  ["Papu Gómez", "MED", 80, 37, "🇦🇷"], ["Ramiro Funes Mori", "DEF", 77, 34, "🇦🇷"],
  ["Éver Banega", "MED", 79, 36, "🇦🇷"], ["Lucas Alario", "DEL", 78, 32, "🇦🇷"],
  ["Franco Cervi", "MED", 76, 30, "🇦🇷"], ["Matías Suárez", "DEL", 76, 36, "🇦🇷"],
];
const FIRST_NAMES = ["Thiago", "Mateo", "Bautista", "Luka", "Santiago", "Valentín", "Joaquín", "Simón", "Bruno", "Dante", "Facundo", "Nicolás", "Agustín", "Tomás", "Franco", "Gonzalo", "Emiliano", "Santiago", "Iker", "Dylan"];
const LAST_NAMES = ["Romero", "Álvarez", "Benítez", "Gómez", "Fernández", "Díaz", "Torres", "Vargas", "Molina", "Castro", "Ríos", "Sosa", "Peralta", "Ibarra", "Quiroga", "Ledesma", "Herrera", "Aguirre", "Navarro", "Ojeda"];
const NATIONS = ["🇦🇷", "🇵🇾", "🇪🇸", "🇺🇾", "🇧🇷", "🇨🇱", "🇨🇴", "🇲🇽", "🇪🇨", "🇵🇪"];

function buildMarket(): MarketPlayer[] {
  const out: MarketPlayer[] = FREE_AGENTS.map(([name, pos, med, age, nat]) => ({
    name, pos, med, age, num: 0, nat, price: valueOf(med), hidden: false,
  }));
  const posPool: Pos[] = ["ARQ", "DEF", "DEF", "MED", "MED", "MED", "DEL", "DEL"];
  for (let i = 0; i < 30; i++) {
    const pos = posPool[Math.floor(Math.random() * posPool.length)];
    const med = 62 + Math.floor(Math.random() * 20);
    const age = 17 + Math.floor(Math.random() * 18);
    const name = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
    out.push({
      name, pos, med, age, num: 0, nat: NATIONS[Math.floor(Math.random() * NATIONS.length)],
      price: valueOf(med), hidden: i % 3 === 0, // un tercio son "joyitas" que descubre el ojeador
    });
  }
  return out.sort((a, b) => b.med - a.med);
}

let pid = 1;

/* ================= CONSTRUCCIÓN ================= */
/* Arma todos los planteles desde los datos reales de la liga. Reutilizable para
   crear una temporada nueva Y para reparar partidas guardadas viejas. */
function buildRoster(leagueId: string, mode: Mode, clubId: number, name: string, pos: Pos): { players: PlayerP[]; userPlayerId: number } {
  const league = leagueOf(leagueId);
  const players: PlayerP[] = [];
  for (let ci = 0; ci < league.rows.length; ci++) {
    let autoNum = 0;
    for (const row of league.rows[ci][9]) {
      const [pname, ppos, med, pnum, page, pnat] = row;
      autoNum++;
      const age = page ?? 17 + Math.floor(Math.random() * 19);
      players.push({
        id: pid++, name: pname, pos: ppos, med, age,
        value: valueOf(med), energy: 100, clubId: ci, goals: 0, matches: 0, ratings: [],
        stats: statsFor(med, ppos),
        num: pnum ?? autoNum, nat: pnat ?? "—", wage: wageOf(med),
        contract: 1 + Math.floor(Math.random() * 4), injured: 0, form: 70, baseMed: med,
      });
    }
  }
  let userPlayerId = -1;
  if (mode === "player") {
    const stats: PlayerStats = { tiro: 68, pase: 66, regate: 70, ritmo: 72, defensa: 55, fisico: 64 };
    const med = medFromStats(stats, pos);
    const me: PlayerP = {
      id: pid++, name, pos, med, age: 19, value: valueOf(68),
      energy: 100, clubId, goals: 0, matches: 0, ratings: [], isUser: true, stats,
      num: 10, nat: league.country, wage: wageOf(med), contract: 3, injured: 0, form: 70, baseMed: med,
    };
    players.push(me);
    userPlayerId = me.id;
  }
  return { players, userPlayerId };
}

export function buildSeason(mode: Mode, leagueId: string, clubId: number, name: string, pos: Pos): GameState {
  pid = 1;
  const league = leagueOf(leagueId);
  const { players, userPlayerId } = buildRoster(leagueId, mode, clubId, name, pos);
  const clubs: Club[] = league.rows.map((r, i) => ({
    id: i, name: r[0], short: r[1], c1: r[2], c2: r[3], stripe: r[4],
    prestige: r[5], capacity: r[6], money: r[7], fans: r[8],
  }));
  const fixtures = roundRobin(clubs.length);
  const standings: Record<number, Standing> = {};
  clubs.forEach((c) => { standings[c.id] = { pts: 0, pj: 0, gf: 0, gc: 0 }; });
  const defaultRole: Role = pos === "DEF" ? "DFC" : pos === "MED" ? "MC" : "P9";
  const prestige = clubs[clubId].prestige;
  return {
    mode, leagueId, phase: "league", round: 0, totalRounds: fixtures.length,
    players, clubs, fixtures, standings,
    userClub: clubId, userName: name, userPlayerId, userPos: pos, userRole: defaultRole, userXI: null,
    cup: null,
    dt: {
      formation: "4-3-3", mentality: 1, pressing: 1, patience: 70,
      expectPos: Math.max(1, Math.round(clubs.length * 0.35) - prestige + 1),
      boostPos: null, boostAmt: 0, trained: false,
    },
    pres: { ticket: 3, sponsor: null, coachName: COACHES[2].name, coachBonus: COACHES[2].bonus, stadiumLvl: 1 },
    incomeLast: 0, expenseLast: 0, lastFansDelta: 0, topScorers: [],
    lastResult: null, lastWasHome: true,
    seasonDone: false, outcome: null, outcomeTitle: "", outcomeText: "",
    awards: { ballon: null, club: null, goleador: null, clubG: null },
    history: [], eventLog: [], market: buildMarket(), scoutUsed: false, youthPromoted: false, trainCount: 0,
    season: 2026, career: [],
  };
}

function roundRobin(n: number): Fixture[][] {
  const ids = Array.from({ length: n }, (_, i) => i);
  const rounds: Fixture[][] = [];
  const arr = [...ids];
  for (let r = 0; r < n - 1; r++) {
    const fx: Fixture[] = [];
    for (let i = 0; i < n / 2; i++) {
      const home = arr[i], away = arr[n - 1 - i];
      fx.push(r % 2 === 0 ? { home, away, gh: null, ga: null } : { home: away, away: home, gh: null, ga: null });
    }
    rounds.push(fx);
    arr.splice(1, 0, arr.pop() as number);
  }
  return rounds;
}

/* ================= ACCESOS ================= */
export const squadOf = (g: GameState, clubId: number) => g.players.filter((p) => p.clubId === clubId);
export const getClub = (g: GameState, id: number): Club => g.clubs[id];
export const clubMoney = (g: GameState) => getClub(g, g.userClub).money;
export const setClubMoney = (g: GameState, v: number) => { getClub(g, g.userClub).money = Math.round(v * 10) / 10; };
export const setClubFans = (g: GameState, v: number) => { getClub(g, g.userClub).fans = clamp(Math.round(v), 5, 100); };
export const leagueName = (g: GameState) => leagueOf(g.leagueId).name;
export const cupName = (g: GameState) => leagueOf(g.leagueId).continental;

export function xiOf(g: GameState, clubId: number, fm: Fm): PlayerP[] {
  if (clubId === g.userClub && g.userXI && g.userXI.length === 11) {
    const picked = g.userXI
      .map((id) => g.players.find((p) => p.id === id && p.clubId === clubId))
      .filter((p): p is PlayerP => !!p);
    if (picked.length === 11 && new Set(picked.map((p) => p.id)).size === 11) return picked;
  }
  const layout = formationLayout(fm);
  const squad = squadOf(g, clubId).filter((p) => p.energy > 25);
  const out: PlayerP[] = [];
  const used = new Set<number>();
  for (const pos of layout) {
    const cands = squad.filter((p) => p.pos === pos && !used.has(p.id)).sort((a, b) => b.med - a.med);
    const pick = cands[0] ?? squad.filter((p) => !used.has(p.id)).sort((a, b) => b.med - a.med)[0];
    if (pick) { out.push(pick); used.add(pick.id); }
  }
  return out;
}

export const setUserXI = (g: GameState, ids: number[] | null) => { g.userXI = ids; };

export function teamStrength(g: GameState, clubId: number, xi: PlayerP[]): Strength {
  const avg = (f: (p: PlayerP) => number) => (xi.length ? xi.reduce((s, p) => s + f(p), 0) / xi.length : 60);
  const atk = avg((p) => (p.pos === "DEL" ? p.med * 1.35 : p.pos === "MED" ? p.med : p.med * 0.7));
  const def = avg((p) => (p.pos === "ARQ" || p.pos === "DEF" ? p.med * 1.25 : p.med * 0.8));
  const mid = avg((p) => (p.pos === "MED" ? p.med * 1.2 : p.med * 0.9));
  const coach = clubId === g.userClub ? g.pres.coachBonus : 1;
  const user = clubId === g.userClub;
  const men = user ? g.dt.mentality : 1;
  const press = user ? g.dt.pressing : 1;
  return {
    atk: atk + coach * 0.5 + (men === 2 ? 4 : men === 0 ? -2 : 0),
    def: def + coach * 0.5 + (press === 2 ? 3 : 0) + (men === 0 ? 3 : 0),
    mid: mid + coach * 0.4,
  };
}

export const userNextFixture = (g: GameState): Fixture | null =>
  g.phase === "league" && g.round < g.totalRounds
    ? g.fixtures[g.round].find((f) => f.home === g.userClub || f.away === g.userClub) ?? null
    : null;

/* ================= SIMULACIÓN RÁPIDA ================= */
function poisson(lambda: number): number {
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= Math.random(); } while (p > L);
  return k - 1;
}

/* el mejor equipo gana más: la diferencia de fuerzas abre el marcador */
function quickGoals(hs: Strength, as: Strength): { gh: number; ga: number } {
  const expH = clamp((hs.atk / as.def - 0.78) * 2.0 + 0.25, 0.2, 4.4);
  const expA = clamp((as.atk / hs.def - 0.78) * 1.9 + 0.2, 0.2, 4.0);
  return { gh: poisson(expH), ga: poisson(expA) };
}

/* los mejores jugadores (más media) convierten más */
function pickScorers(g: GameState, clubId: number, n: number) {
  const xi = xiOf(g, clubId, "4-3-3");
  const attackers = xi.filter((p) => p.pos === "DEL" || p.pos === "MED");
  const out: { pid: number; name: string; club: number; min: number }[] = [];
  for (let i = 0; i < n; i++) {
    const weights = attackers.map((p) => Math.pow(p.med - 55, 2));
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    let r = Math.random() * total, s = attackers[0];
    for (let j = 0; j < attackers.length; j++) { r -= weights[j]; if (r <= 0) { s = attackers[j]; break; } }
    if (!s) continue;
    s.goals++;
    out.push({ pid: s.id, name: s.name, club: clubId, min: 5 + Math.floor(Math.random() * 85) });
  }
  return out;
}

export function simOthers(g: GameState) {
  const round = g.fixtures[g.round];
  for (const fx of round) {
    if (fx.home === g.userClub || fx.away === g.userClub || fx.gh !== null) continue;
    const hs = teamStrength(g, fx.home, xiOf(g, fx.home, "4-3-3"));
    const as = teamStrength(g, fx.away, xiOf(g, fx.away, "4-3-3"));
    const r = quickGoals(hs, as);
    fx.gh = r.gh; fx.ga = r.ga;
    applyToTable(g, fx, r.gh, r.ga);
    pickScorers(g, fx.home, r.gh);
    pickScorers(g, fx.away, r.ga);
    g.topScorers = topScorersOf(g);
  }
}

function applyToTable(g: GameState, fx: Fixture, gh: number, ga: number) {
  const h = g.standings[fx.home], a = g.standings[fx.away];
  h.pj++; a.pj++; h.gf += gh; h.gc += ga; a.gf += ga; a.gc += gh;
  if (gh > ga) h.pts += 3; else if (ga > gh) a.pts += 3; else { h.pts++; a.pts++; }
}

function topScorersOf(g: GameState) {
  return g.players.filter((p) => p.goals > 0).sort((a, b) => b.goals - a.goals).slice(0, 8)
    .map((p) => ({ pid: p.id, name: p.name, club: p.clubId, goals: p.goals }));
}

export function sortedTable(g: GameState) {
  return Object.entries(g.standings)
    .map(([id, s]) => ({ id: Number(id), ...s }))
    .sort((a, b) => b.pts - a.pts || (b.gf - b.gc) - (a.gf - a.gc) || b.gf - a.gf);
}

/* ================= FECHA RÁPIDA / SALTOS ================= */
export function simDateQuick(g: GameState): MatchResult | null {
  const fx = userNextFixture(g);
  if (!fx) return null;
  simOthers(g);
  const isHome = fx.home === g.userClub;
  const hs = teamStrength(g, fx.home, xiOf(g, fx.home, g.dt.formation));
  const as = teamStrength(g, fx.away, xiOf(g, fx.away, "4-3-3"));
  const r = quickGoals(hs, as);
  fx.gh = r.gh; fx.ga = r.ga;
  const hNames = pickScorers(g, fx.home, r.gh);
  const aNames = pickScorers(g, fx.away, r.ga);
  const hClub = getClub(g, fx.home), aClub = getClub(g, fx.away);
  const events = [
    ...hNames.map((s) => ({ min: s.min, text: `¡Gol de ${s.name} para ${hClub.name}!`, kind: "goal" as const, club: fx.home })),
    ...aNames.map((s) => ({ min: s.min, text: `¡Gol de ${s.name} para ${aClub.name}!`, kind: "goal" as const, club: fx.away })),
    { min: 90, text: `Final: ${hClub.name} ${r.gh} - ${r.ga} ${aClub.name}.`, kind: "info" as const, club: -1 },
  ].sort((a, b) => b.min - a.min);
  const res: MatchResult = { gh: r.gh, ga: r.ga, events, scorers: [...hNames, ...aNames], cards: Math.floor(Math.random() * 4) };
  closeRound(g, res, fx, isHome ? [] : []);
  return res;
}

export function isKeyMatch(g: GameState, fx: Fixture): boolean {
  const me = getClub(g, g.userClub);
  const rival = getClub(g, fx.home === g.userClub ? fx.away : fx.home);
  if (isClasico(me.short, rival.short)) return true;
  if (g.round >= g.totalRounds - 3) return true;
  const sorted = sortedTable(g);
  const myPos = sorted.findIndex((s) => s.id === g.userClub);
  const rivalPos = sorted.findIndex((s) => s.id === rival.id);
  return myPos >= 0 && rivalPos >= 0 && Math.abs(myPos - rivalPos) <= 1 && myPos < 6;
}

export function jumpToKeyMatch(g: GameState): boolean {
  let guard = 0;
  while (!g.seasonDone && g.phase === "league" && guard++ < 80) {
    const fx = userNextFixture(g);
    if (fx && isKeyMatch(g, fx)) return true;
    simDateQuick(g);
  }
  return false;
}

export function simRestOfSeason(g: GameState) {
  let guard = 0;
  while (!g.seasonDone && guard++ < 200) {
    if (g.phase === "league") simDateQuick(g);
    else if (g.phase === "cup") playCupRound(g);
    else break;
  }
}

/* ================= CIERRE DE RONDA ================= */
export function closeRound(g: GameState, res: MatchResult, fx: Fixture, usedIds: number[]) {
  const isHome = fx.home === g.userClub;
  const gf = isHome ? res.gh : res.ga;
  const gc = isHome ? res.ga : res.gh;
  applyToTable(g, fx, res.gh, res.ga);
  for (const sc of res.scorers) {
    const p = g.players.find((x) => x.id === sc.pid);
    if (p) p.goals++;
  }
  g.topScorers = topScorersOf(g);

  const xi = xiOf(g, g.userClub, g.dt.formation);
  const ids = usedIds.length ? usedIds : xi.map((p) => p.id);
  for (const id of ids) {
    const p = g.players.find((x) => x.id === id);
    if (p) { p.energy = clamp(p.energy - 22 + 26, 20, 100); p.matches++; }
  }
  g.players.forEach((p) => { if (!ids.includes(p.id)) p.energy = clamp(p.energy + 12, 20, 100); });

  if (g.mode === "player") {
    const me = g.players.find((p) => p.id === g.userPlayerId);
    if (me && res.rating !== undefined) {
      me.ratings.push(res.rating);
      me.med = me.stats ? medFromStats(me.stats, me.pos) : me.med;
    }
  }

  const club = getClub(g, g.userClub);
  let income = 0, expense = 0;
  const attendance = Math.round(club.capacity * (club.fans / 100) * (isHome ? 1 : 0.35));
  income += (attendance * g.pres.ticket) / 1e6 * 4;
  if (g.pres.sponsor) income += g.pres.sponsor.perMatch;
  const wages = squadOf(g, g.userClub).reduce((s, p) => s + (p.wage || wageOf(p.med)), 0);
  expense += wages + (g.mode === "president" ? 0.8 : 0.4);
  club.money = Math.round((club.money + income - expense) * 10) / 10;
  g.incomeLast = income; g.expenseLast = expense;

  const won = gf > gc, drew = gf === gc;
  let fansDelta = won ? 3 : drew ? 0 : -3;
  if (g.mode === "president" && g.pres.ticket > 5) fansDelta -= 1;
  g.lastFansDelta = fansDelta;
  setClubFans(g, club.fans + fansDelta);
  if (g.mode === "dt") g.dt.patience = clamp(g.dt.patience + (won ? 8 : drew ? 0 : -10), 0, 100);

  g.lastResult = res;
  g.lastWasHome = isHome;

  // historial del partido del usuario
  recordMatch(g, {
    round: g.round, homeId: fx.home, awayId: fx.away, gh: res.gh, ga: res.ga,
    comp: "liga", stats: res.stats, scorers: res.scorers,
  });

  g.round++;
  g.dt.trained = false;
  g.trainCount = 0;
  g.scoutUsed = false;

  // lesiones, forma, contratos, eventos inesperados
  processRound(g, ids);

  if (g.round >= g.totalRounds) startCup(g);
  else if (g.mode === "dt" && g.dt.patience <= 0) finishAll(g);
}

/* ================= COPA (Libertadores / Champions) ================= */
function startCup(g: GameState) {
  g.phase = "cup";
  const sorted = sortedTable(g).slice(0, 8).map((s) => s.id);
  const seeds: CupTie[] = [
    { home: sorted[0], away: sorted[7], gh: null, ga: null },
    { home: sorted[3], away: sorted[4], gh: null, ga: null },
    { home: sorted[1], away: sorted[6], gh: null, ga: null },
    { home: sorted[2], away: sorted[5], gh: null, ga: null },
  ];
  g.cup = { name: cupName(g), stage: 0, ties: [seeds], champion: null };
}

export const userCupTie = (g: GameState): { tie: CupTie; round: number } | null => {
  if (!g.cup || g.cup.champion !== null) return null;
  const round = g.cup.ties[g.cup.stage];
  const tie = round.find((t) => t.home === g.userClub || t.away === g.userClub);
  return tie ? { tie, round: g.cup.stage } : null;
};

export const userInCup = (g: GameState): boolean => {
  if (!g.cup) return false;
  return g.cup.ties[0].some((t) => t.home === g.userClub || t.away === g.userClub);
};

function simCupMatch(g: GameState, tie: CupTie) {
  const hs = teamStrength(g, tie.home, xiOf(g, tie.home, "4-3-3"));
  const as = teamStrength(g, tie.away, xiOf(g, tie.away, "4-3-3"));
  let { gh, ga } = quickGoals(hs, as);
  if (gh === ga) { if (hs.atk + hs.mid >= as.atk + as.mid ? Math.random() < 0.6 : Math.random() < 0.4) gh++; else ga++; }
  tie.gh = gh; tie.ga = ga;
  pickScorers(g, tie.home, gh);
  pickScorers(g, tie.away, ga);
  g.topScorers = topScorersOf(g);
}

/* avanza la copa: juega tu cruce (si estás) y simula el resto de la ronda */
export function playCupRound(g: GameState): MatchResult | null {
  const c = g.cup;
  if (!c || c.champion !== null) return null;
  const round = c.ties[c.stage];
  let userRes: MatchResult | null = null;
  for (const tie of round) {
    if (tie.gh !== null) continue;
    simCupMatch(g, tie);
    if (tie.home === g.userClub || tie.away === g.userClub) {
      const isHome = tie.home === g.userClub;
      const hClub = getClub(g, tie.home), aClub = getClub(g, tie.away);
      const stageName = c.stage === 0 ? "Cuartos de final" : c.stage === 1 ? "Semifinal" : "FINAL";
      const events = [
        { min: 90, text: `${stageName} — ${hClub.name} ${tie.gh} - ${tie.ga} ${aClub.name}. ${isHome ? (tie.gh! > tie.ga! ? "¡Tu equipo avanza!" : "Eliminado de la copa.") : tie.ga! > tie.gh! ? "¡Tu equipo avanza!" : "Eliminado de la copa."}`, kind: "info" as const, club: -1 },
      ];
      userRes = { gh: tie.gh!, ga: tie.ga!, events, scorers: [], cards: 2, cup: true, cupLabel: `${c.name} — ${stageName}` };
      recordMatch(g, {
        round: g.round, homeId: tie.home, awayId: tie.away, gh: tie.gh!, ga: tie.ga!,
        comp: "copa", cupStage: stageName, scorers: [],
      });
    }
  }
  // siguiente ronda
  const winners = round.map((t) => (t.gh! >= t.ga! ? t.home : t.away));
  if (c.stage < 2) {
    const next: CupTie[] = [];
    for (let i = 0; i < winners.length; i += 2) next.push({ home: winners[i], away: winners[i + 1], gh: null, ga: null });
    c.ties.push(next);
    c.stage++;
  } else {
    c.champion = winners[0];
    g.seasonDone = true;
    finishAll(g);
  }
  return userRes;
}

/* ================= FINAL DE TEMPORADA ================= */
function finishAll(g: GameState) {
  g.seasonDone = true;
  g.phase = "done";
  const sorted = sortedTable(g);
  const pos = sorted.findIndex((s) => s.id === g.userClub) + 1;

  // Balón de Oro Ñambi: goles x3 + promedio x10
  let best: { name: string; club: number; pts: number } | null = null;
  for (const p of g.players) {
    const avg = p.ratings.length ? p.ratings.reduce((a, b) => a + b, 0) / p.ratings.length : 0;
    const pts = p.goals * 3 + avg * 10 + p.med * 0.4;
    if (!best || pts > best.pts) best = { name: p.name, club: p.clubId, pts };
  }
  if (best) { g.awards.ballon = best.name; g.awards.club = best.club; }
  const goleador = g.topScorers[0];
  if (goleador) { g.awards.goleador = goleador.name; g.awards.clubG = goleador.club; }

  const cupWon = g.cup?.champion === g.userClub;
  const cupOut = g.cup && g.cup.champion !== null && g.cup.champion !== g.userClub && userInCup(g);

  // guardo esta temporada en la carrera (el outcome lo completa end())
  const me = g.players.find((p) => p.id === g.userPlayerId);
  g.career.push({
    season: g.season, club: g.userClub, pos, cupWon,
    outcome: "win", ballon: g.awards.ballon === me?.name,
  });

  if (g.mode === "dt") {
    if (g.dt.patience <= 0) end(g, "lose", "TE ECHARON", "La paciencia del presidente se agotó. Te dejan la caja de cartón y el buzo.");
    else if (cupWon) end(g, "win", `¡CAMPEÓN DE ${g.cup!.name.toUpperCase()}!`, "Gloria continental: tu nombre queda grabado en la historia del club.");
    else if (pos === 1) end(g, "win", "¡CAMPEÓN DE LA LIGA ÑAMBI!", "Vuelta olímpica y tu nombre cantado por la popular.");
    else if (pos <= g.dt.expectPos) end(g, "win", "OBJETIVO CUMPLIDO", `Terminaste ${pos}º${cupOut ? ", aunque la copa quedó en el camino" : ""}. Renuevan tu contrato.`);
    else end(g, "lose", "NO ALCANZÓ", `El objetivo era ${g.dt.expectPos}º y quedaste ${pos}º. La comisión busca otro rumbo.`);
  } else if (g.mode === "player") {
    const me = g.players.find((p) => p.id === g.userPlayerId);
    const avg = me && me.ratings.length ? me.ratings.reduce((s, r) => s + r, 0) / me.ratings.length : 0;
    const ballon = g.awards.ballon === me?.name;
    if (ballon) end(g, "win", "¡BALÓN DE ORO ÑAMBI!", `Sos el mejor jugador de la temporada. Premio ${avg.toFixed(1)} de promedio, ${me!.goals} goles y la tapa de todos los diarios.`);
    else if (avg >= 7.2 && (pos <= 3 || cupWon)) end(g, "win", "¡EUROPA TE LLAMA!", `Promedio ${avg.toFixed(1)}${cupWon ? " y campeón continental" : ""}. Te compran la cláusula.`);
    else if (avg >= 6.2) end(g, "win", "RENOVÁS COMO FIGURA", `Promedio ${avg.toFixed(1)}: mejor contrato y la 10 en la espalda.`);
    else end(g, "lose", "A PRÉSTAMO", `Promedio ${avg.toFixed(1)}: te mandan a sumar minutos al ascenso.`);
  } else {
    if (clubMoney(g) < 0) end(g, "lose", "QUIEBRA", "La caja quedó en rojo. El club entra en convocatoria.");
    else if (getClub(g, g.userClub).fans <= 12) end(g, "lose", "LA HINCHADA TE ECHÓ", "La popular se hartó. Sos historia.");
    else if (cupWon) end(g, "win", `PRESIDENTE DE ${g.cup!.name.toUpperCase()}`, "Título continental, superávit y estadio lleno. Estatua en la puerta.");
    else if (pos === 1) end(g, "win", "PRESIDENTE CAMPEÓN", "Liga, superávit y estadio lleno. Estatua en la puerta.");
    else end(g, "win", "GESTIÓN APROBADA", `Terminaste ${pos}º con las cuentas saneadas. Te ratifican.`);
  }
}

function end(g: GameState, outcome: "win" | "lose", title: string, text: string) {
  g.outcome = outcome; g.outcomeTitle = title; g.outcomeText = text;
  const last = g.career[g.career.length - 1];
  if (last && last.season === g.season) last.outcome = outcome;
}

/* ================= CAMBIO DE ROL ================= */
export function changeRole(g: GameState, roleId: Role) {
  const me = g.players.find((p) => p.id === g.userPlayerId);
  if (!me || !me.stats) return;
  g.userRole = roleId;
  const posMap: Record<Role, Pos> = { LI: "DEF", LD: "DEF", DFC: "DEF", MC: "MED", ENG: "MED", EI: "DEL", ED: "DEL", P9: "DEL" };
  me.pos = posMap[roleId];
  g.userPos = me.pos;
  const boost: Partial<PlayerStats> =
    roleId === "ENG" ? { pase: 2, regate: 1 }
      : roleId === "EI" || roleId === "ED" ? { ritmo: 2, regate: 1 }
        : roleId === "P9" ? { tiro: 2, fisico: 1 }
          : roleId === "MC" ? { pase: 2, defensa: 1 }
            : { defensa: 2, fisico: 1 };
  (Object.keys(boost) as (keyof PlayerStats)[]).forEach((k) => {
    me.stats![k] = Math.min(94, me.stats![k] + (boost[k] ?? 0));
  });
  me.med = medFromStats(me.stats, me.pos);
  me.value = valueOf(me.med);
}

/* ================= ENTRENAMIENTO (DT) ================= */
export function trainLine(g: GameState, pos: Pos) {
  if (g.dt.trained) return;
  g.dt.trained = true;
  g.dt.boostPos = pos;
  g.dt.boostAmt = 2;
  squadOf(g, g.userClub).forEach((p) => {
    if (p.pos === pos && p.stats) {
      const key = pos === "DEL" ? "tiro" : pos === "MED" ? "pase" : "defensa";
      p.stats[key] = Math.min(94, p.stats[key] + 2);
      p.med = medFromStats(p.stats, p.pos);
    }
  });
}

/* ================= MERCADO ================= */
export function buyPlayer(g: GameState, idx: number): boolean {
  const target = g.market[idx];
  if (!target) return false;
  const cost = target.price;
  if (clubMoney(g) < cost) return false;
  setClubMoney(g, clubMoney(g) - cost);
  const med = target.med;
  g.players.push({
    id: pid++, name: target.name, pos: target.pos, med, age: target.age,
    value: cost, energy: 100, clubId: g.userClub, goals: 0, matches: 0, ratings: [],
    stats: statsFor(med, target.pos),
    num: 0, nat: target.nat, wage: wageOf(med), contract: 3, injured: 0, form: 70, baseMed: med,
  });
  g.market.splice(idx, 1);
  pushEvent(g, `FICHAJE: llegó ${target.name} (${target.pos} · ${med}) por $${cost}M.`, "good");
  return true;
}

/* ================= VENDER JUGADOR ================= */
export function sellPlayer(g: GameState, playerId: number): boolean {
  const p = g.players.find((x) => x.id === playerId);
  if (!p || p.isUser) return false;
  if (squadOf(g, g.userClub).length <= 14) return false; // plantel mínimo
  const fee = Math.round(p.value * (0.85 + Math.random() * 0.3) * 10) / 10;
  setClubMoney(g, clubMoney(g) + fee);
  g.players = g.players.filter((x) => x.id !== playerId);
  pushEvent(g, `VENTA: ${p.name} se fue por $${fee}M. La dirigencia respira.`, "info");
  return true;
}

/* ================= RENOVACIÓN / CONTRATO ================= */
export function negotiateContract(g: GameState, playerId: number): boolean {
  const p = g.players.find((x) => x.id === playerId);
  if (!p) return false;
  const rise = Math.round(p.wage * 0.25 * 100) / 100;
  const cost = Math.round(p.value * 0.12 * 10) / 10; // prima de renovación
  if (clubMoney(g) < cost) return false;
  setClubMoney(g, clubMoney(g) - cost);
  p.wage = Math.round((p.wage + rise) * 100) / 100;
  p.contract = 3 + Math.floor(Math.random() * 2);
  pushEvent(g, `CONTRATO: ${p.name} renovó hasta ${p.contract} temporadas (+$${rise}M/fecha).`, "good");
  return true;
}

/* ================= OJEADOR ================= */
export function scoutAction(g: GameState): MarketPlayer | null {
  if (g.scoutUsed) return null;
  const cost = 1.5;
  if (clubMoney(g) < cost) return null;
  const hidden = g.market.filter((m) => m.hidden);
  if (!hidden.length) return null;
  setClubMoney(g, clubMoney(g) - cost);
  g.scoutUsed = true;
  const found = hidden[Math.floor(Math.random() * hidden.length)];
  found.hidden = false;
  pushEvent(g, `OJEADOR: descubrió a ${found.name} (${found.pos} · ${found.med}, ${found.age} años). ¡Joyita!`, "good");
  return found;
}

/* ================= CANTERA ================= */
export function promoteYouth(g: GameState): PlayerP | null {
  if (g.youthPromoted) return null;
  g.youthPromoted = true;
  const pos: Pos = (["DEF", "MED", "DEL"] as Pos[])[Math.floor(Math.random() * 3)];
  const med = 60 + Math.floor(Math.random() * 10);
  const name = `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;
  const nat = leagueOf(g.leagueId).country;
  const youth: PlayerP = {
    id: pid++, name, pos, med, age: 17, value: valueOf(med), energy: 100, clubId: g.userClub,
    goals: 0, matches: 0, ratings: [], stats: statsFor(med, pos),
    num: 0, nat, wage: wageOf(med), contract: 3, injured: 0, form: 75, baseMed: med,
  };
  g.players.push(youth);
  pushEvent(g, `CANTERA: subió ${name} (${pos} · ${med}), la joya de la reserva.`, "good");
  return youth;
}

/* ================= ENTRENAMIENTO INDIVIDUAL ================= */
export function trainPlayer(g: GameState, playerId: number, stat: keyof PlayerStats): boolean {
  const p = g.players.find((x) => x.id === playerId);
  if (!p || !p.stats) return false;
  if (g.trainCount >= 3) return false; // 3 sesiones por fecha
  const cost = 0.4;
  if (clubMoney(g) < cost) return false;
  setClubMoney(g, clubMoney(g) - cost);
  g.trainCount++;
  p.stats[stat] = Math.min(94, p.stats[stat] + 1);
  p.med = medFromStats(p.stats, p.pos);
  p.value = valueOf(p.med);
  return true;
}

/* ================= EVENTOS ================= */
export function pushEvent(g: GameState, text: string, kind: GameEvent["kind"]) {
  g.eventLog.unshift({ round: g.round, text, kind });
  if (g.eventLog.length > 40) g.eventLog.pop();
}

/* lesiones + forma + contratos al cerrar fecha */
export function processRound(g: GameState, playedIds: number[]) {
  // lesiones aleatorias
  const squad = squadOf(g, g.userClub);
  for (const p of squad) {
    if (p.injured > 0) { p.injured--; continue; }
    const risk = playedIds.includes(p.id) ? 0.06 : 0.015;
    if (Math.random() < risk) {
      p.injured = 1 + Math.floor(Math.random() * 5);
      pushEvent(g, `LESIÓN: ${p.name} se rompió en la semana. ${p.injured} fecha(s) afuera.`, "bad");
    }
  }
  // forma según resultado y medias que derivan
  const res = g.lastResult;
  const won = res ? (g.lastWasHome ? res.gh > res.ga : res.ga > res.gh) : false;
  const lost = res ? (g.lastWasHome ? res.gh < res.ga : res.ga < res.gh) : false;
  for (const p of squad) {
    if (!playedIds.includes(p.id)) continue;
    p.form = clamp(p.form + (won ? 4 : lost ? -4 : 1) + Math.round((Math.random() - 0.5) * 4), 30, 99);
    // la media se mueve con la forma y la edad
    const drift = (p.form - 70) / 40 + (p.age < 24 ? 0.4 : p.age > 32 ? -0.4 : 0);
    const newMed = Math.round(clamp(p.baseMed + drift, 55, 95));
    if (newMed !== p.med) { p.med = newMed; p.value = valueOf(p.med); p.wage = wageOf(p.med); }
  }
  // contratos que vencen
  for (const p of squad) {
    if (p.contract > 0) p.contract--;
    if (p.contract === 0 && !p.isUser && Math.random() < 0.4) {
      g.players = g.players.filter((x) => x.id !== p.id);
      pushEvent(g, `CONTRATO: ${p.name} quedó libre y se fue sin dejar un peso.`, "bad");
    }
  }
  // eventos inesperados
  const roll = Math.random();
  if (roll < 0.12) {
    const bonus = 1 + Math.round(Math.random() * 3);
    setClubMoney(g, clubMoney(g) + bonus);
    pushEvent(g, `SPONSOR SORPRESA: una marca pagó $${bonus}M por publicidad en la camiseta.`, "good");
  } else if (roll < 0.2) {
    setClubFans(g, getClub(g, g.userClub).fans + 2);
    pushEvent(g, `LA HINCHADA se ilusiona: +2 de popularidad tras la última fecha.`, "good");
  } else if (roll < 0.26) {
    setClubMoney(g, clubMoney(g) - 1);
    pushEvent(g, `MULTA: el tribunal disciplinario sancionó al club con $1M.`, "bad");
  }
}

/* ================= HISTORIAL ================= */
export function recordMatch(g: GameState, rec: MatchRecord) {
  g.history.unshift(rec);
  if (g.history.length > 60) g.history.pop();
}

export const coachCandidates = () => COACHES;

/* ================= NUEVA TEMPORADA (carrera continua) ================= */
export function startNextSeason(g: GameState) {
  g.season++;
  const n = g.clubs.length;
  const rndName = () => `${FIRST_NAMES[Math.floor(Math.random() * FIRST_NAMES.length)]} ${LAST_NAMES[Math.floor(Math.random() * LAST_NAMES.length)]}`;

  /* --- envejecimiento, desarrollo, retiro y contratos --- */
  const keep: PlayerP[] = [];
  for (const p of g.players) {
    p.age++;
    if (p.stats) {
      const ks = Object.keys(p.stats) as (keyof PlayerStats)[];
      if (p.age <= 23) {
        const ups = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < ups; i++) {
          const k = ks[Math.floor(Math.random() * ks.length)];
          p.stats[k] = Math.min(94, p.stats[k] + 1);
        }
      } else if (p.age >= 31) {
        const dec = p.age >= 34 ? 2 : 1;
        const downs = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < downs; i++) {
          const k = ks[Math.floor(Math.random() * ks.length)];
          p.stats[k] = Math.max(45, p.stats[k] - dec);
        }
      }
      p.med = medFromStats(p.stats, p.pos);
      p.baseMed = p.med;
    }
    p.value = valueOf(p.med);

    // el usuario nunca se retira ni se va por su cuenta
    if (p.isUser) {
      p.contract = Math.max(p.contract - 1, 1);
      keep.push(p);
      continue;
    }
    // retiro de veteranos
    if (p.age >= 35 && Math.random() < (p.age - 33) * 0.22) {
      g.eventLog.unshift({ round: 0, kind: "info", text: `${p.name} anunció su retiro a los ${p.age} años.` });
      continue;
    }
    // contratos: los buenos del club del usuario se van libres; el resto renueva
    p.contract--;
    if (p.contract <= 0) {
      if (p.clubId === g.userClub && p.med >= 70) {
        g.eventLog.unshift({ round: 0, kind: "bad", text: `${p.name} terminó contrato y se fue libre.` });
        continue;
      }
      p.contract = 1 + Math.floor(Math.random() * 3);
    }
    keep.push(p);
  }
  g.players = keep;

  /* --- relleno: ningún club con menos de 14 (suben juveniles) --- */
  g.clubs.forEach((c) => {
    const size = g.players.filter((p) => p.clubId === c.id).length;
    let need = 14 - size;
    while (need-- > 0) {
      const pos = (["DEF", "MED", "DEL"] as Pos[])[Math.floor(Math.random() * 3)];
      const med = 60 + Math.floor(Math.random() * 12);
      g.players.push({
        id: pid++, name: rndName(), pos, med, age: 17 + Math.floor(Math.random() * 4),
        value: valueOf(med), energy: 100, clubId: c.id, goals: 0, matches: 0, ratings: [],
        stats: statsFor(med, pos), num: 30 + size + need, nat: "—", wage: wageOf(med),
        contract: 2, injured: 0, form: 70, baseMed: med,
      });
    }
  });

  /* --- reset de la competición --- */
  g.fixtures = roundRobin(n);
  const standings: Record<number, Standing> = {};
  g.clubs.forEach((c) => { standings[c.id] = { pts: 0, pj: 0, gf: 0, gc: 0 }; });
  g.standings = standings;
  g.round = 0; g.phase = "league"; g.cup = null; g.userXI = null;
  g.seasonDone = false; g.outcome = null; g.outcomeTitle = ""; g.outcomeText = "";
  g.awards = { ballon: null, club: null, goleador: null, clubG: null };
  g.lastResult = null; g.topScorers = [];

  /* --- reset del estado de los jugadores --- */
  g.players.forEach((p) => { p.goals = 0; p.matches = 0; p.ratings = []; p.energy = 100; p.injured = 0; p.form = 70; });

  /* --- reset de la temporada --- */
  g.market = buildMarket();
  g.scoutUsed = false; g.youthPromoted = false; g.trainCount = 0;

  if (g.mode === "dt") {
    g.dt.patience = 70; g.dt.trained = false; g.dt.boostPos = null; g.dt.boostAmt = 0;
    g.dt.expectPos = Math.max(1, Math.round(n * 0.35) - g.clubs[g.userClub].prestige + 1);
  }

  g.eventLog.unshift({ round: 0, kind: "good", text: `🏁 Arranca la temporada ${g.season}. ¡A dejar todo!` });
}

/* ================= GUARDADO (a prueba de versiones) ================= */
const SAVE_KEY = "nambi_sport_save_v4";
const LEGACY_KEYS = ["nambi_sport_save_v3", "nambi_sport_save_v2", "nambi_sport_save_v1", "nambi_sport_save"];

export function saveSeason(g: GameState): boolean {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(g)); return true; } catch { return false; }
}

/* migra guardados viejos al formato actual: nunca se pierde una temporada */
function migrate(raw: string): GameState | null {
  let g: GameState;
  try { g = JSON.parse(raw) as GameState; } catch { return null; }
  if (!g || !Array.isArray(g.players) || !Array.isArray(g.fixtures)) return null;

  // campos que pudieron no existir en versiones anteriores
  if (!g.leagueId) g.leagueId = "ar1";
  if (!g.clubs) {
    const rows = leagueOf(g.leagueId).rows;
    g.clubs = rows.map((r, i) => ({
      id: i, name: r[0], short: r[1], c1: r[2], c2: r[3], stripe: r[4],
      prestige: r[5], capacity: r[6], money: r[7], fans: r[8],
    }));
  }
  if (!g.phase) g.phase = g.seasonDone ? "done" : g.round >= g.totalRounds ? "cup" : "league";
  if (g.cup === undefined) g.cup = null;
  if (!g.awards) g.awards = { ballon: null, club: null, goleador: null, clubG: null };
  if (g.userXI === undefined) g.userXI = null;
  if (!g.userRole) g.userRole = g.userPos === "DEF" ? "DFC" : g.userPos === "MED" ? "MC" : "P9";
  if (!g.userPos) g.userPos = "DEL";
  if (!g.standings) {
    g.standings = {};
    g.clubs.forEach((c) => { g.standings[c.id] = { pts: 0, pj: 0, gf: 0, gc: 0 }; });
  }
  if (!g.topScorers) g.topScorers = [];
  if (!g.dt) g.dt = { formation: "4-3-3", mentality: 1, pressing: 1, patience: 70, expectPos: 5, boostPos: null, boostAmt: 0, trained: false };
  if (!g.pres) g.pres = { ticket: 3, sponsor: null, coachName: "Don Menotti Jr.", coachBonus: 1, stadiumLvl: 1 };
  if (typeof g.incomeLast !== "number") g.incomeLast = 0;
  if (typeof g.expenseLast !== "number") g.expenseLast = 0;
  if (typeof g.lastFansDelta !== "number") g.lastFansDelta = 0;
  if (!g.outcomeTitle) g.outcomeTitle = "";
  if (!g.outcomeText) g.outcomeText = "";
  if (typeof g.season !== "number") g.season = 2026;
  if (!Array.isArray(g.career)) g.career = [];
  if (!Array.isArray(g.history)) g.history = [];
  if (!Array.isArray(g.eventLog)) g.eventLog = [];
  if (!Array.isArray(g.market)) g.market = buildMarket();
  if (typeof g.scoutUsed !== "boolean") g.scoutUsed = false;
  if (typeof g.youthPromoted !== "boolean") g.youthPromoted = false;
  if (typeof g.trainCount !== "number") g.trainCount = 0;

  /* REPARACIÓN DE PLANTELES: si la partida es anterior a los planteles reales
     (escuadras chicas o jugadores sin formato nuevo), reconstruimos TODOS los
     planteles desde los datos actuales, conservando la carrera del usuario. */
  const squadSizes = g.clubs.map((c) => g.players.filter((p) => p.clubId === c.id).length);
  const tooSmall = squadSizes.some((n) => n < 14);
  const staleFormat = g.players.length > 0 && g.players.some((p) => typeof (p as { baseMed?: number }).baseMed !== "number");
  if (tooSmall || staleFormat) {
    const oldUser = g.players.find((p) => p.isUser);
    const savedMoney = g.clubs.map((c) => c.money);
    const savedFans = g.clubs.map((c) => c.fans);
    const fresh = buildRoster(g.leagueId, g.mode, g.userClub, g.userName || "Tu Pibe", g.userPos || "DEL");
    g.players = fresh.players;
    g.userPlayerId = fresh.userPlayerId;
    g.userXI = null;
    g.topScorers = [];
    g.clubs.forEach((c, i) => { c.money = savedMoney[i] ?? c.money; c.fans = savedFans[i] ?? c.fans; });
    if (oldUser && g.mode === "player") {
      const me = g.players.find((p) => p.isUser);
      if (me && oldUser.stats) {
        me.stats = oldUser.stats; me.med = oldUser.med; me.goals = oldUser.goals;
        me.ratings = oldUser.ratings; me.age = oldUser.age; me.value = oldUser.value;
      }
    }
    g.eventLog.unshift({ round: 0, kind: "info", text: "📋 Se actualizaron los planteles a las plantillas reales." });
  }

  // campos nuevos por jugador
  g.players.forEach((p) => {
    if (typeof p.num !== "number") p.num = 0;
    if (!p.nat) p.nat = "—";
    if (typeof p.wage !== "number") p.wage = wageOf(p.med);
    if (typeof p.contract !== "number") p.contract = 2;
    if (typeof p.injured !== "number") p.injured = 0;
    if (typeof p.form !== "number") p.form = 70;
    if (typeof p.baseMed !== "number") p.baseMed = p.med;
  });
  return g;
}

export function loadSeason(): GameState | null {
  try {
    for (const key of [SAVE_KEY, ...LEGACY_KEYS]) {
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      const g = migrate(raw);
      if (g) {
        pid = g.players.reduce((m, p) => Math.max(m, p.id), 0) + 1;
        // normalizamos al formato nuevo para la próxima
        if (key !== SAVE_KEY) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(g)); } catch { /* noop */ } }
        return g;
      }
    }
    return null;
  } catch { return null; }
}

export function hasSavedSeason(): boolean {
  try { return [SAVE_KEY, ...LEGACY_KEYS].some((k) => !!localStorage.getItem(k)); } catch { return false; }
}

export function clearSeason() {
  try { [SAVE_KEY, ...LEGACY_KEYS].forEach((k) => localStorage.removeItem(k)); } catch { /* noop */ }
}

/* ================= NOTICIAS ================= */
export function computeNews(g: GameState): string[] {
  const out: string[] = [];
  if (g.phase === "cup" && g.cup) {
    out.push(`Noche de ${g.cup.name}: ${g.cup.stage === 0 ? "cuartos de final" : g.cup.stage === 1 ? "semifinales" : "LA GRAN FINAL"} en juego.`);
    if (userInCup(g)) out.push("Tu club sigue con vida en la copa. La hinchada agotó las entradas.");
  }
  const prev = g.round - 1;
  if (prev >= 0 && prev < g.fixtures.length) {
    const fx = g.fixtures[prev].find((f) => f.home === g.userClub || f.away === g.userClub);
    if (fx && fx.gh !== null && fx.ga !== null) {
      const me = getClub(g, g.userClub);
      const other = getClub(g, fx.home === g.userClub ? fx.away : fx.home);
      const gf = fx.home === g.userClub ? fx.gh : fx.ga;
      const gc = fx.home === g.userClub ? fx.ga : fx.gh;
      out.push(gf > gc ? `${me.name} venció ${gf}-${gc} a ${other.name} y la hinchada sueña.` : gf === gc ? `Repartieron puntos: ${me.name} ${gf}-${gc} ${other.name}.` : `Golpe duro: ${me.name} cayó ${gf}-${gc} ante ${other.name}.`);
    }
  }
  const top = g.topScorers[0];
  if (top) out.push(`${top.name} (${getClub(g, top.club).name}) manda entre los goleadores con ${top.goals}.`);
  const leader = sortedTable(g)[0];
  if (leader && g.round > 0 && g.phase !== "done") out.push(`${getClub(g, leader.id).name} lidera la ${leagueName(g)} con ${leader.pts} puntos.`);
  if (!out.length) out.push(`Arranca la ${leagueName(g)}: los 8 primeros clasifican a la ${cupName(g)}.`);
  return out.slice(0, 4);
}
