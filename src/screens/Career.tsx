import { useMemo, useState } from "react";
import {
  ArrowRight, CalendarClock, Coins, FastForward, HelpCircle, Landmark, ListOrdered,
  Newspaper, Play, Shirt, Sparkles, Star, Target, TrendingUp, Trophy, UserRound, Users, Zap,
} from "lucide-react";
import type { Fm, GameState, PlayerP, Pos } from "../game/core";
import { ROLES, isClasico, roleOf, valueOf } from "../game/core";
import {
  buyPlayer, changeRole, clubMoney, computeNews, cupName, getClub, isKeyMatch, jumpToKeyMatch,
  leagueName, marketList, setUserXI, simDateQuick, simRestOfSeason, sortedTable,
  squadOf, trainLine, userCupTie, userInCup, userNextFixture, xiOf,
} from "../game/engine";
import { sfx } from "../game/audio";
import { Crest, MedBadge, PosTag } from "../components/ui";

type Tab = "plantel" | "tacticas" | "finanzas" | "carrera" | "mercado" | "liga" | "copa";

export function Hub({ g, refresh, onPlayLive, onCupRound, onHelp, muted, onMute }: {
  g: GameState; refresh: () => void; onPlayLive: () => void; onCupRound: () => void;
  onHelp: () => void; muted: boolean; onMute: () => void;
}) {
  const [tab, setTab] = useState<Tab>(g.mode === "dt" ? "tacticas" : g.mode === "player" ? "carrera" : "finanzas");
  const club = getClub(g, g.userClub);
  const fx = userNextFixture(g);
  const cupTie = userCupTie(g);
  const news = useMemo(() => computeNews(g), [g]);
  const nextIsKey = fx ? isKeyMatch(g, fx) : false;
  const rival = fx ? getClub(g, fx.home === g.userClub ? fx.away : fx.home) : null;
  const rivalShort = rival?.short ?? "";
  const isClasicoNext = fx && rival ? isClasico(club.short, rivalShort) : false;

  const tabs: { id: Tab; label: string; icon: React.ReactNode; show: boolean }[] = [
    { id: "plantel", label: "PLANTEL", icon: <Users size={16} />, show: true },
    { id: "tacticas", label: "TÁCTICAS", icon: <Target size={16} />, show: g.mode === "dt" },
    { id: "carrera", label: "CARRERA", icon: <UserRound size={16} />, show: g.mode === "player" },
    { id: "finanzas", label: g.mode === "president" ? "OFICINA" : "FINANZAS", icon: g.mode === "president" ? <Landmark size={16} /> : <Coins size={16} />, show: g.mode !== "player" },
    { id: "mercado", label: "MERCADO", icon: <TrendingUp size={16} />, show: g.mode !== "player" },
    { id: "liga", label: "LIGA", icon: <ListOrdered size={16} />, show: true },
    { id: "copa", label: "COPA", icon: <Trophy size={16} />, show: !!g.cup },
  ];

  return (
    <div className="min-h-screen grain pb-16">
      {/* barra superior */}
      <div className="sticky top-0 z-40 border-b border-lima/20 bg-night-950/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center gap-3 flex-wrap">
          <div className="font-display text-2xl tracking-wide">ÑAMBI<span className="text-gold">·</span><span className="text-lima">SPORT</span></div>
          <span className="chip bg-night-800 border border-chalk/15 text-chalk/80 text-sm">{g.mode === "dt" ? "DT" : g.mode === "player" ? "JUGADOR" : "PRESIDENTE"}</span>
          <div className="flex items-center gap-2">
            <Crest club={club} size={30} />
            <span className="font-display text-xl tracking-wide">{club.name}</span>
          </div>
          <div className="flex-1" />
          <span className="chip bg-night-800 border border-chalk/15 text-cielo text-sm">
            {g.phase === "league" ? `FECHA ${Math.min(g.round + 1, g.totalRounds)}/${g.totalRounds}` : g.phase === "cup" ? cupName(g).toUpperCase() : "FIN DE TEMPORADA"}
          </span>
          {g.mode === "dt" && (
            <span className="chip bg-night-800 border border-chalk/15 text-sm" style={{ color: g.dt.patience > 40 ? "#b8ff2e" : "#ff4257" }}>
              PACIENCIA {Math.round(g.dt.patience)}
            </span>
          )}
          {g.mode !== "player" && (
            <span className="chip bg-night-800 border border-gold/40 text-gold text-sm">$ {clubMoney(g).toFixed(1)}M</span>
          )}
          <button className="btn btn-ghost px-3 py-1.5" onClick={onMute}>{muted ? "🔇" : "🔊"}</button>
          <button className="btn btn-ghost px-3 py-1.5" onClick={onHelp}><HelpCircle size={16} /></button>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 pt-5">
        {/* cartel próximo partido + acciones de fecha */}
        <div className="panel p-5 mb-5 animate-risein">
          {g.phase === "done" ? (
            <div className="text-center py-4">
              <div className="font-display text-4xl text-gold tracking-wide mb-2">TEMPORADA COMPLETA</div>
              <p className="text-chalk/70">{g.outcomeText}</p>
            </div>
          ) : (
            <div className="flex flex-col lg:flex-row gap-5 items-center">
              <div className="flex items-center gap-4 flex-1 w-full justify-center lg:justify-start">
                {fx && rival ? (
                  <>
                    <Crest club={club} size={64} />
                    <div className="text-center">
                      <div className="text-[11px] uppercase tracking-widest text-chalk/50">{fx.home === g.userClub ? "Local" : "Visitante"} · Fecha {g.round + 1}</div>
                      <div className="font-display text-3xl tracking-wide">VS</div>
                      {(isClasicoNext || nextIsKey) && <span className="chip bg-hot/20 border border-hot/50 text-hot text-xs animate-pulse">¡PARTIDO CLAVE!</span>}
                    </div>
                    <Crest club={rival} size={64} />
                    <div>
                      <div className="font-display text-2xl leading-tight">{rival.name}</div>
                      <div className="text-xs text-chalk/55">{isClasicoNext ? "¡Es el clásico! La ciudad está partida." : nextIsKey ? "Rival directo: vale doble." : "Un partido más de la liga."}</div>
                    </div>
                  </>
                ) : cupTie ? (
                  <>
                    <Crest club={club} size={64} />
                    <div className="text-center">
                      <div className="text-[11px] uppercase tracking-widest text-gold">{cupTie.round === 0 ? "Cuartos de final" : cupTie.round === 1 ? "Semifinal" : "¡LA FINAL!"}</div>
                      <div className="font-display text-3xl tracking-wide text-gold">{g.cup!.name.toUpperCase()}</div>
                    </div>
                    <Crest club={getClub(g, cupTie.tie.home === g.userClub ? cupTie.tie.away : cupTie.tie.home)} size={64} />
                    <div>
                      <div className="font-display text-2xl leading-tight">{getClub(g, cupTie.tie.home === g.userClub ? cupTie.tie.away : cupTie.tie.home).name}</div>
                      <div className="text-xs text-chalk/55">Noche de copa: el que pierde, a casa.</div>
                    </div>
                  </>
                ) : (
                  <div className="font-display text-2xl text-chalk/60">Tu equipo quedó eliminado de la copa. Se juega el resto.</div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
                {fx && g.mode !== "player" && (
                  <button className="btn btn-lima px-6 py-3 text-xl" onClick={onPlayLive}><Play size={20} /><span>VER EN VIVO</span></button>
                )}
                {fx && g.mode === "player" && (
                  <button className="btn btn-lima px-6 py-3 text-xl" onClick={onPlayLive}><Zap size={20} /><span>¡A LA CANCHA!</span></button>
                )}
                {fx && (
                  <>
                    <button className="btn btn-gold px-5 py-3" onClick={() => { simDateQuick(g); refresh(); sfx.kick(); }}><CalendarClock size={17} /><span>SIMULAR FECHA</span></button>
                    <button className="btn btn-cielo px-5 py-3" onClick={() => { const found = jumpToKeyMatch(g); if (!found && !g.seasonDone) simRestOfSeason(g); refresh(); sfx.tab(); }}>
                      <FastForward size={17} /><span>SALTAR A CLAVE</span>
                    </button>
                  </>
                )}
                {cupTie && (
                  <button className="btn btn-gold px-5 py-3" onClick={onCupRound}><Trophy size={17} /><span>JUGAR RONDA</span></button>
                )}
                <button className="btn btn-ghost px-5 py-3" onClick={() => { simRestOfSeason(g); refresh(); sfx.whistle(true); }}><FastForward size={17} /><span>SIMULAR TODO</span></button>
              </div>
            </div>
          )}
        </div>

        {/* diario */}
        <div className="panel-soft p-4 mb-5 flex items-start gap-3 overflow-hidden">
          <Newspaper size={22} className="text-gold shrink-0 mt-0.5" />
          <div>
            <div className="font-display text-lg text-gold tracking-wider">DIARIO ÑAMBI</div>
            <div className="text-sm text-chalk/75 space-y-0.5">{news.map((n, i) => <div key={i}>· {n}</div>)}</div>
          </div>
        </div>

        {/* tabs */}
        <div className="flex flex-wrap gap-1 border-b border-chalk/10 mb-5">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.id} className={`tabbtn ${tab === t.id ? "on" : ""}`} onClick={() => { setTab(t.id); sfx.tab(); }}>
              {t.icon}{t.label}
            </button>
          ))}
        </div>

        {tab === "plantel" && <SquadTab g={g} />}
        {tab === "tacticas" && g.mode === "dt" && <TacticsTab g={g} refresh={refresh} />}
        {tab === "carrera" && g.mode === "player" && <CareerTab g={g} refresh={refresh} />}
        {tab === "finanzas" && g.mode !== "player" && <FinanceTab g={g} refresh={refresh} />}
        {tab === "mercado" && g.mode !== "player" && <MarketTab g={g} refresh={refresh} />}
        {tab === "liga" && <LeagueTab g={g} />}
        {tab === "copa" && g.cup && <CupTab g={g} />}
      </div>
    </div>
  );
}

/* ---------------- PLANTEL ---------------- */
function SquadTab({ g }: { g: GameState }) {
  const squad = [...squadOf(g, g.userClub)].sort((a, b) => {
    const order = { ARQ: 0, DEF: 1, MED: 2, DEL: 3 };
    return order[a.pos] - order[b.pos] || b.med - a.med;
  });
  return (
    <div className="panel p-5 animate-risein">
      <div className="flex justify-between items-center mb-3">
        <h3 className="font-display text-3xl tracking-wide">PLANTEL <span className="text-lima">({squad.length})</span></h3>
        <span className="text-xs text-chalk/50">Media del equipo: <b className="text-lima">{Math.round(squad.reduce((s, p) => s + p.med, 0) / (squad.length || 1))}</b></span>
      </div>
      <div className="overflow-x-auto">
        <table className="tbl w-full text-sm">
          <thead><tr><th></th><th>JUGADOR</th><th>PUESTO</th><th>MEDIA</th><th>EDAD</th><th>ENERGÍA</th><th>GOLES</th><th>VALOR</th></tr></thead>
          <tbody>
            {squad.map((p) => (
              <tr key={p.id} className={p.isUser ? "user-row" : ""}>
                <td className="font-display text-chalk/40">{p.isUser ? "★" : ""}</td>
                <td className="font-semibold">{p.name}</td>
                <td><PosTag pos={p.pos} /></td>
                <td><MedBadge med={p.med} /></td>
                <td>{p.age}</td>
                <td>
                  <div className="w-20 h-2 inline-block align-middle" style={{ background: "rgba(3,13,7,0.7)", border: "1px solid rgba(242,255,233,0.15)" }}>
                    <div className="h-full" style={{ width: `${p.energy}%`, background: p.energy > 40 ? "#b8ff2e" : "#ff4257" }} />
                  </div>
                </td>
                <td className="font-display text-lg text-lima">{p.goals}</td>
                <td className="text-gold">${p.value}M</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ---------------- TÁCTICAS (DT) ---------------- */
function TacticsTab({ g, refresh }: { g: GameState; refresh: () => void }) {
  const [selPos, setSelPos] = useState<number | null>(null);
  const xi = xiOf(g, g.userClub, g.dt.formation);
  const squad = squadOf(g, g.userClub);
  const bench = squad.filter((p) => !xi.some((x) => x.id === p.id));

  const swap = (outId: number, inId: number) => {
    const ids = xi.map((p) => (p.id === outId ? inId : p.id));
    setUserXI(g, ids);
    setSelPos(null);
    refresh();
    sfx.tab();
  };

  return (
    <div className="grid lg:grid-cols-2 gap-5">
      <div className="panel p-5 animate-risein space-y-4">
        <h3 className="font-display text-3xl tracking-wide">PIZARRA</h3>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Formación</div>
          <div className="seg">
            {(["4-4-2", "4-3-3", "5-3-2"] as Fm[]).map((f) => (
              <button key={f} className={g.dt.formation === f ? "on" : ""} onClick={() => { g.dt.formation = f; setUserXI(g, null); refresh(); sfx.tab(); }}>{f}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Mentalidad</div>
          <div className="seg">
            {["DEFENSIVA", "NEUTRA", "OFENSIVA"].map((m, i) => (
              <button key={m} className={g.dt.mentality === i ? "on" : ""} onClick={() => { g.dt.mentality = i; refresh(); sfx.tab(); }}>{m}</button>
            ))}
          </div>
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Presión</div>
          <div className="seg">
            {["BAJA", "MEDIA", "ALTA"].map((m, i) => (
              <button key={m} className={g.dt.pressing === i ? "on" : ""} onClick={() => { g.dt.pressing = i; refresh(); sfx.tab(); }}>{m}</button>
            ))}
          </div>
        </div>
        <div className="border-t border-chalk/10 pt-3">
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-2">Entrenamiento semanal (1 por fecha)</div>
          <div className="flex gap-2">
            {(["DEF", "MED", "DEL"] as Pos[]).map((pos) => (
              <button key={pos} className="btn btn-ghost flex-1 py-2" disabled={g.dt.trained}
                onClick={() => { trainLine(g, pos); refresh(); sfx.kick(); }}>
                <Shirt size={15} /><span>{pos} +2</span>
              </button>
            ))}
          </div>
          {g.dt.trained && <p className="text-xs text-lima mt-2">✓ Entrenamiento hecho: línea {g.dt.boostPos} mejorada.</p>}
        </div>
      </div>

      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-3xl tracking-wide mb-1">TU <span className="text-lima">ONCE</span></h3>
        <p className="text-xs text-chalk/50 mb-3">Tocá un titular para cambiarlo por alguien del banco.</p>
        <div className="space-y-1.5">
          {xi.map((p, i) => (
            <div key={p.id} className="flex items-center gap-2">
              <span className="font-display text-chalk/40 w-6">{i + 1}</span>
              <PosTag pos={p.pos} />
              <button className={`flex-1 text-left px-2 py-1 text-sm border transition-colors ${selPos === i ? "border-lima bg-lima/10 text-lima" : "border-chalk/10 hover:border-chalk/40"}`}
                onClick={() => { setSelPos(selPos === i ? null : i); sfx.click(); }}>
                {p.name} <span className="text-chalk/40">({p.med})</span>
              </button>
              <MedBadge med={p.med} />
            </div>
          ))}
        </div>
        {selPos !== null && (
          <div className="mt-3 border-t border-chalk/10 pt-3">
            <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-2">Entra por {xi[selPos].name}:</div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto">
              {bench.filter((p) => p.pos === xi[selPos].pos || true).sort((a, b) => (a.pos === xi[selPos].pos ? -1 : 1) - (b.pos === xi[selPos].pos ? -1 : 1)).map((p) => (
                <button key={p.id} className="btn btn-ghost py-1.5 px-3 text-sm" onClick={() => swap(xi[selPos].id, p.id)}>
                  <span>{p.pos} · {p.name} ({p.med})</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------------- CARRERA (JUGADOR) ---------------- */
function CareerTab({ g, refresh }: { g: GameState; refresh: () => void }) {
  const me = g.players.find((p) => p.id === g.userPlayerId);
  if (!me || !me.stats) return null;
  const avg = me.ratings.length ? me.ratings.reduce((a, b) => a + b, 0) / me.ratings.length : 0;
  const meta = roleOf(g.userRole);
  return (
    <div className="space-y-5">
      <div className="panel p-5 animate-risein">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-3">
          <h3 className="font-display text-3xl tracking-wide">TU <span className="text-lima">PUESTO</span></h3>
          <span className="chip bg-night-800 border border-lima/40 text-lima">{meta.label.toUpperCase()}</span>
        </div>
        <p className="text-sm text-chalk/60 mb-3">{meta.desc}</p>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {ROLES.map((r) => (
            <button key={r.id} onClick={() => { if (r.id !== g.userRole) { changeRole(g, r.id); sfx.tab(); refresh(); } }}
              className={`px-1 py-2.5 text-center border transition-all ${r.id === g.userRole ? "border-lima bg-lima/15 text-lima -translate-y-0.5 shadow-[0_6px_18px_-6px_rgba(184,255,46,0.5)]" : "border-chalk/12 text-chalk/60 hover:border-chalk/40 hover:text-chalk"}`}
              style={{ clipPath: "polygon(7px 0, 100% 0, calc(100% - 7px) 100%, 0 100%)" }} title={r.desc}>
              <span className="block font-display text-2xl leading-none">{r.short}</span>
              <span className="block text-[9px] uppercase tracking-widest mt-1 opacity-80">{r.label}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-5">
        <div className="panel p-5 text-center animate-risein">
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Puntaje promedio</div>
          <div className="font-display text-7xl" style={{ color: avg >= 7 ? "#b8ff2e" : avg >= 6 ? "#ffc233" : "#ff4257" }}>{avg ? avg.toFixed(1) : "—"}</div>
          <div className="text-xs text-chalk/50">{me.ratings.length} partidos jugados</div>
        </div>
        <div className="panel p-5 animate-risein">
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-2">Temporada</div>
          <div className="grid grid-cols-2 gap-2 text-center">
            <div><div className="font-display text-4xl text-lima">{me.goals}</div><div className="text-[10px] uppercase text-chalk/50">Goles</div></div>
            <div><div className="font-display text-4xl text-gold">{me.med}</div><div className="text-[10px] uppercase text-chalk/50">Media</div></div>
          </div>
          <div className="mt-3 text-xs text-chalk/60">Objetivo: promedio <b className="text-lima">7.2+</b> y equipo en podio para ir a Europa.</div>
        </div>
        <div className="panel p-5 animate-risein">
          <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-2">Atributos</div>
          {([["Tiro", me.stats.tiro], ["Pase", me.stats.pase], ["Regate", me.stats.regate], ["Ritmo", me.stats.ritmo]] as [string, number][]).map(([k, v]) => (
            <div key={k} className="flex items-center gap-2 mb-1.5">
              <span className="w-14 text-xs text-chalk/60">{k}</span>
              <div className="flex-1 h-2" style={{ background: "rgba(3,13,7,0.7)", border: "1px solid rgba(242,255,233,0.15)" }}>
                <div className="h-full" style={{ width: `${v}%`, background: "linear-gradient(90deg,#0f8a44,#b8ff2e)" }} />
              </div>
              <span className="font-display w-7 text-right">{v}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- FINANZAS / OFICINA ---------------- */
function FinanceTab({ g, refresh }: { g: GameState; refresh: () => void }) {
  const club = getClub(g, g.userClub);
  const isPres = g.mode === "president";
  return (
    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-2xl tracking-wide mb-3 flex items-center gap-2"><Coins size={20} className="text-gold" />CAJA</h3>
        <div className="font-display text-5xl mb-2" style={{ color: club.money >= 0 ? "#b8ff2e" : "#ff4257" }}>${club.money.toFixed(1)}M</div>
        <div className="text-sm text-chalk/60 space-y-1">
          <div className="flex justify-between"><span>Última recaudación</span><b className="text-lima">+${g.incomeLast.toFixed(1)}M</b></div>
          <div className="flex justify-between"><span>Últimos gastos</span><b className="text-hot">-${g.expenseLast.toFixed(1)}M</b></div>
          <div className="flex justify-between"><span>Hinchada</span><b>{club.fans}/100 {g.lastFansDelta >= 0 ? "▲" : "▼"}</b></div>
        </div>
      </div>

      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-2xl tracking-wide mb-3">ENTRADA</h3>
        <div className="font-display text-4xl mb-2 text-gold">$ {g.pres.ticket}</div>
        <div className="flex gap-2">
          <button className="btn btn-ghost flex-1 py-2" onClick={() => { g.pres.ticket = Math.max(1, g.pres.ticket - 1); refresh(); sfx.click(); }}><span>BAJAR</span></button>
          <button className="btn btn-ghost flex-1 py-2" onClick={() => { g.pres.ticket = Math.min(10, g.pres.ticket + 1); refresh(); sfx.click(); }}><span>SUBIR</span></button>
        </div>
        <p className="text-xs text-chalk/50 mt-2">Cara = más plata, pero la hinchada se enoja. Barata = estadio lleno.</p>
      </div>

      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-2xl tracking-wide mb-3">SPONSOR</h3>
        {g.pres.sponsor ? (
          <p className="text-sm text-chalk/80 mb-3">Contrato firmado con <b className="text-gold">{g.pres.sponsor.name}</b> (+${g.pres.sponsor.perMatch}M por partido).</p>
        ) : (
          <p className="text-sm text-chalk/50 mb-3">Todavía no hay sponsor. Ofertas sobre la mesa:</p>
        )}
        <div className="space-y-2">
          {[{ name: "Banco Ñambi", upfront: 4, perMatch: 0.6 }, { name: "AeroCharrúa", upfront: 7, perMatch: 0.3 }, { name: "Gaseosa Gol", upfront: 2, perMatch: 1.0 }].map((sp) => (
            <button key={sp.name} className="btn btn-ghost w-full py-2" disabled={g.pres.sponsor?.name === sp.name}
              onClick={() => { g.pres.sponsor = sp; club.money += sp.upfront; refresh(); sfx.coins(); }}>
              <span>{sp.name} · +${sp.upfront}M ya · +${sp.perMatch}M/fecha</span>
            </button>
          ))}
        </div>
      </div>

      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-2xl tracking-wide mb-3 flex items-center gap-2"><Target size={20} className="text-lima" />CUERPO TÉCNICO</h3>
        <p className="text-sm text-chalk/70 mb-3">DT actual: <b className="text-lima">{g.pres.coachName}</b> (+{g.pres.coachBonus} al equipo).</p>
        <div className="space-y-2">
          {[{ name: "El Profe Sampaio", cost: 5, bonus: 3 }, { name: "Cacho Bielsini", cost: 3.5, bonus: 2 }, { name: "Don Menotti Jr.", cost: 2, bonus: 1 }].map((c) => (
            <button key={c.name} className="btn btn-ghost w-full py-2" disabled={g.pres.coachName === c.name || club.money < c.cost}
              onClick={() => { g.pres.coachName = c.name; g.pres.coachBonus = c.bonus; club.money -= c.cost; refresh(); sfx.coins(); }}>
              <span>{c.name} · +{c.bonus} · ${c.cost}M</span>
            </button>
          ))}
        </div>
      </div>

      {isPres && (
        <div className="panel p-5 animate-risein">
          <h3 className="font-display text-2xl tracking-wide mb-3 flex items-center gap-2"><Landmark size={20} className="text-cielo" />ESTADIO</h3>
          <p className="text-sm text-chalk/70 mb-3">Capacidad: <b className="text-cielo">{Math.round(club.capacity * (1 + (g.pres.stadiumLvl - 1) * 0.15)).toLocaleString()}</b> (nivel {g.pres.stadiumLvl})</p>
          <button className="btn btn-cielo w-full py-2" disabled={g.pres.stadiumLvl >= 4 || club.money < 6}
            onClick={() => { g.pres.stadiumLvl++; club.capacity = Math.round(club.capacity * 1.15); club.money -= 6; refresh(); sfx.coins(); }}>
            <span>AMPLIAR · $6M</span>
          </button>
          <p className="text-xs text-chalk/50 mt-2">Más butacas = más recaudación por fecha.</p>
        </div>
      )}
    </div>
  );
}

/* ---------------- MERCADO ---------------- */
function MarketTab({ g, refresh }: { g: GameState; refresh: () => void }) {
  const market = marketList();
  return (
    <div className="panel p-5 animate-risein">
      <h3 className="font-display text-3xl tracking-wide mb-1">MERCADO DE <span className="text-gold">PASES</span></h3>
      <p className="text-sm text-chalk/60 mb-4">Libres de lujo y pibes de proyección. Plata disponible: <b className="text-gold">${clubMoney(g).toFixed(1)}M</b>.</p>
      <div className="grid md:grid-cols-2 gap-2">
        {market.map((m, i) => (
          <div key={m.name} className="panel-soft p-3 flex items-center gap-3">
            <PosTag pos={m.pos} />
            <div className="flex-1">
              <div className="font-semibold">{m.name}</div>
              <div className="text-xs text-chalk/50">{m.age} años · libre</div>
            </div>
            <MedBadge med={m.med} />
            <button className="btn btn-gold px-4 py-1.5 text-sm" disabled={clubMoney(g) < valueOf(m.med)}
              onClick={() => { if (buyPlayer(g, i)) { refresh(); sfx.coins(); } }}>
              <span>${valueOf(m.med)}M</span>
            </button>
          </div>
        ))}
        {!market.length && <p className="text-chalk/50">Mercado cerrado: ya compraste todo lo que había.</p>}
      </div>
    </div>
  );
}

/* ---------------- LIGA ---------------- */
function LeagueTab({ g }: { g: GameState }) {
  const table = sortedTable(g);
  return (
    <div className="grid lg:grid-cols-3 gap-5">
      <div className="panel p-5 lg:col-span-2 animate-risein">
        <h3 className="font-display text-3xl tracking-wide mb-3">{leagueName(g).toUpperCase()}</h3>
        <div className="overflow-x-auto">
          <table className="tbl w-full text-sm">
            <thead><tr><th>#</th><th>EQUIPO</th><th>PJ</th><th>PTS</th><th>GF</th><th>GC</th><th>DIF</th></tr></thead>
            <tbody>
              {table.map((row, i) => {
                const c = getClub(g, row.id);
                return (
                  <tr key={row.id} className={row.id === g.userClub ? "user-row" : ""}>
                    <td className={`font-display text-lg ${i < 8 ? "text-gold" : "text-chalk/50"}`}>{i + 1}</td>
                    <td><span className="flex items-center gap-2"><Crest club={c} size={22} />{c.name}</span></td>
                    <td>{row.pj}</td>
                    <td className="font-display text-lg text-lima">{row.pts}</td>
                    <td>{row.gf}</td>
                    <td>{row.gc}</td>
                    <td>{row.gf - row.gc > 0 ? `+${row.gf - row.gc}` : row.gf - row.gc}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-gold mt-2">★ Del 1º al 8º clasifican a la {cupName(g)}.</p>
      </div>
      <div className="panel p-5 animate-risein">
        <h3 className="font-display text-3xl tracking-wide mb-3">GOLEADORES</h3>
        {g.topScorers.length ? (
          <div className="space-y-2">
            {g.topScorers.map((t, i) => (
              <div key={t.pid} className="flex items-center gap-2 text-sm">
                <span className="font-display text-chalk/40 w-5">{i + 1}</span>
                <Crest club={getClub(g, t.club)} size={20} />
                <span className="flex-1">{t.name}</span>
                <span className="font-display text-xl text-lima">{t.goals}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-chalk/50 text-sm">Todavía no hay goles en la liga.</p>}
      </div>
    </div>
  );
}

/* ---------------- COPA ---------------- */
function CupTab({ g }: { g: GameState }) {
  const c = g.cup!;
  const stages = ["CUARTOS", "SEMIFINAL", "FINAL"];
  return (
    <div className="panel p-5 animate-risein">
      <h3 className="font-display text-3xl tracking-wide mb-1 flex items-center gap-3"><Trophy size={28} className="text-gold" />{c.name.toUpperCase()}</h3>
      <p className="text-sm text-chalk/60 mb-5">Los 8 mejores de la liga. El que pierde, a casa. {userInCup(g) ? "Tu club está en carrera." : "Tu club no clasificó esta vez."}</p>
      <div className="grid md:grid-cols-3 gap-5">
        {c.ties.map((round, ri) => (
          <div key={ri}>
            <div className="font-display text-xl tracking-widest text-gold mb-2">{stages[ri]}</div>
            <div className="space-y-3">
              {round.map((t, ti) => {
                const h = getClub(g, t.home), a = getClub(g, t.away);
                const userIn = t.home === g.userClub || t.away === g.userClub;
                return (
                  <div key={ti} className={`panel-soft p-3 ${userIn ? "border-lima/60" : ""}`}>
                    <TeamLine club={h} goals={t.gh} winner={t.gh !== null && t.ga !== null && t.gh >= t.ga} user={t.home === g.userClub} />
                    <TeamLine club={a} goals={t.ga} winner={t.gh !== null && t.ga !== null && t.ga > t.gh} user={t.away === g.userClub} />
                  </div>
                );
              })}
            </div>
          </div>
        ))}
        {c.champion !== null && (
          <div className="md:col-span-3 text-center mt-4">
            <div className="inline-block panel-soft px-8 py-4">
              <div className="font-display text-lg tracking-widest text-gold mb-1">CAMPEÓN</div>
              <div className="flex items-center gap-3 justify-center">
                <Crest club={getClub(g, c.champion)} size={44} />
                <span className="font-display text-4xl text-lima tracking-wide">{getClub(g, c.champion).name}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TeamLine({ club, goals, winner, user }: { club: ReturnType<typeof getClub>; goals: number | null; winner: boolean; user: boolean }) {
  return (
    <div className={`flex items-center gap-2 text-sm py-0.5 ${user ? "text-lima font-bold" : ""}`}>
      <Crest club={club} size={20} />
      <span className="flex-1 truncate">{club.name}</span>
      <span className={`font-display text-lg ${winner ? "text-lima" : "text-chalk/50"}`}>{goals ?? "–"}</span>
    </div>
  );
}

/* ---------------- RESUMEN POST PARTIDO ---------------- */
export function PostMatch({ g, onNext }: { g: GameState; onNext: () => void }) {
  const res = g.lastResult;
  const club = getClub(g, g.userClub);
  if (!res) return null;
  const gf = g.lastWasHome ? res.gh : res.ga;
  const gc = g.lastWasHome ? res.ga : res.gh;
  const won = gf > gc, drew = gf === gc;
  const best = res.scorers.length ? res.scorers.reduce((a, b) => (Math.random() < 0.5 ? a : b)) : null;
  const stats = res.stats;
  return (
    <div className="min-h-screen grain flex items-center justify-center px-4 py-10">
      <div className="panel p-8 max-w-2xl w-full animate-popin text-center">
        <div className="text-[11px] uppercase tracking-[0.3em] text-chalk/50 mb-2">{res.cup ? res.cupLabel : `${leagueName(g)} · Fecha ${Math.max(1, g.round)}`}</div>
        <div className="font-display text-7xl md:text-8xl tracking-wide mb-1" style={{ color: won ? "#b8ff2e" : drew ? "#ffc233" : "#ff4257" }}>
          {res.gh} - {res.ga}
        </div>
        <div className="font-display text-2xl tracking-widest mb-1">{won ? "¡VICTORIA!" : drew ? "EMPATE" : "DERROTA"}</div>
        <p className="text-chalk/60 text-sm mb-5">{res.cup ? (won ? "Avanzás de ronda en la copa." : "La copa se terminó para vos.") : won ? "La hinchada canta tu nombre." : drew ? "Sumaste, aunque quedó gusto a poco." : "La tribuna pide cabezas."}</p>

        {g.mode === "player" && res.rating !== undefined && (
          <div className="grid grid-cols-4 gap-2 mb-5">
            {[["PUNTAJE", res.rating.toFixed(1), "#b8ff2e"], ["GOLES", res.userGoals ?? 0, "#ffc233"], ["ASIST.", res.userAssists ?? 0, "#41d6ff"], ["RECUPE.", res.tackles ?? 0, "#ff4257"]].map(([l, v, c]) => (
              <div key={l as string} className="panel-soft py-2">
                <div className="font-display text-3xl" style={{ color: c as string }}>{v as string}</div>
                <div className="text-[10px] uppercase tracking-widest text-chalk/50">{l as string}</div>
              </div>
            ))}
          </div>
        )}

        {res.scorers.length > 0 && (
          <div className="text-left mb-4">
            <div className="font-display text-lg text-gold tracking-wider mb-1">GOLES</div>
            <div className="space-y-1 text-sm">
              {[...res.scorers].sort((a, b) => a.min - b.min).map((s, i) => (
                <div key={i} className="flex gap-2"><span className="font-display text-chalk/50 w-8">{s.min}'</span><span>⚽ {s.name} <span className="text-chalk/45">({getClub(g, s.club).name})</span></span></div>
              ))}
            </div>
          </div>
        )}

        {best && (
          <div className="flex items-center gap-3 panel-soft p-3 mb-4 text-left">
            <Star size={26} className="text-gold shrink-0" />
            <div><div className="text-[10px] uppercase tracking-widest text-gold">Figura del partido</div><b>{best.name}</b> <span className="text-chalk/50 text-sm">({getClub(g, best.club).name})</span></div>
          </div>
        )}

        {stats && (
          <div className="space-y-1.5 mb-5 text-left">
            {[["Posesión", `${stats.possH}%`, `${stats.possA}%`, stats.possH, stats.possA], ["Tiros", stats.shotsH, stats.shotsA, stats.shotsH, stats.shotsA], ["Al arco", stats.onH, stats.onA, stats.onH, stats.onA], ["Pases", stats.passesH, stats.passesA, stats.passesH, stats.passesA], ["Faltas", stats.foulsH, stats.foulsA, stats.foulsH, stats.foulsA]].map(([label, hv, av, hp, ap]) => {
              const tot = (hp as number) + (ap as number) || 1;
              return (
                <div key={label as string} className="flex items-center gap-2 text-sm">
                  <span className="w-12 text-right font-display text-base text-lima">{hv as string}</span>
                  <div className="flex-1 h-2 flex overflow-hidden" style={{ background: "rgba(3,13,7,0.7)" }}>
                    <div style={{ width: `${((hp as number) / tot) * 100}%`, background: "linear-gradient(90deg,#0f8a44,#b8ff2e)" }} />
                    <div className="flex-1" style={{ background: "rgba(242,255,233,0.12)" }} />
                  </div>
                  <span className="w-12 font-display text-base text-chalk/60">{av as string}</span>
                  <span className="w-16 text-[10px] uppercase tracking-widest text-chalk/45">{label as string}</span>
                </div>
              );
            })}
          </div>
        )}

        <div className="flex items-center justify-center gap-3 text-chalk/50 text-xs mb-5">
          <Crest club={club} size={22} /> hinchada {g.lastFansDelta >= 0 ? "▲" : "▼"} · caja {g.incomeLast - g.expenseLast >= 0 ? "+" : ""}${(g.incomeLast - g.expenseLast).toFixed(1)}M
          {g.mode === "dt" && <span>· paciencia {Math.round(g.dt.patience)}</span>}
        </div>

        <button className="btn btn-lima px-12 py-4 text-2xl animate-pulsering" onClick={() => { sfx.tab(); onNext(); }}>
          <span>SEGUIR</span><ArrowRight size={22} />
        </button>
      </div>
    </div>
  );
}

/* ---------------- FINAL DE TEMPORADA ---------------- */
export function EndScreen({ g, onRestart }: { g: GameState; onRestart: () => void }) {
  const win = g.outcome === "win";
  const table = sortedTable(g).slice(0, 8);
  const me = g.players.find((p) => p.id === g.userPlayerId);
  const ballonUser = me && g.awards.ballon === me.name;
  return (
    <div className="min-h-screen grain flex items-center justify-center px-4 py-10 relative overflow-hidden">
      {win && Array.from({ length: 26 }).map((_, i) => (
        <div key={i} className="absolute w-2.5 h-4 pointer-events-none" style={{
          left: `${(i * 37) % 100}%`, top: "-5vh",
          background: ["#b8ff2e", "#ffc233", "#41d6ff", "#ff4257"][i % 4],
          animation: `confetti-fall ${2.4 + (i % 5) * 0.5}s linear ${ (i % 7) * 0.3}s infinite`,
        }} />
      ))}
      <style>{`@keyframes confetti-fall { 0% { transform: translateY(-8vh) rotate(0deg); opacity: 1; } 100% { transform: translateY(110vh) rotate(720deg); opacity: 0.5; } }`}</style>
      <div className="panel p-10 max-w-2xl w-full text-center animate-popin">
        <div className="mb-4 flex justify-center">{win ? <Trophy size={70} className="text-gold" /> : <Sparkles size={70} className="text-hot" />}</div>
        <h2 className="font-display text-5xl md:text-7xl tracking-wide mb-3" style={{ color: win ? "#b8ff2e" : "#ff4257", textShadow: "0 0 40px rgba(184,255,46,0.3)" }}>
          {g.outcomeTitle}
        </h2>
        <p className="text-chalk/70 text-lg mb-6">{g.outcomeText}</p>

        <div className="grid md:grid-cols-2 gap-4 mb-6 text-left">
          <div className="panel-soft p-4">
            <div className="font-display text-xl tracking-wider text-gold mb-2 flex items-center gap-2"><Trophy size={16} />{cupName(g)}</div>
            {g.cup?.champion !== null && g.cup ? (
              <div className="flex items-center gap-2">
                <Crest club={getClub(g, g.cup.champion!)} size={30} />
                <b>{getClub(g, g.cup.champion!).name}</b>
                {g.cup.champion === g.userClub && <span className="chip bg-lima/20 border border-lima/50 text-lima text-xs">¡VOS!</span>}
              </div>
            ) : <span className="text-chalk/50 text-sm">No se jugó.</span>}
          </div>
          <div className="panel-soft p-4">
            <div className="font-display text-xl tracking-wider text-gold mb-2 flex items-center gap-2"><Star size={16} />BALÓN DE ORO ÑAMBI</div>
            {g.awards.ballon ? (
              <div className="flex items-center gap-2">
                <Crest club={getClub(g, g.awards.club!)} size={30} />
                <b>{g.awards.ballon}</b>
                {ballonUser && <span className="chip bg-lima/20 border border-lima/50 text-lima text-xs">¡VOS!</span>}
              </div>
            ) : <span className="text-chalk/50 text-sm">—</span>}
            {g.awards.goleador && (
              <div className="text-sm text-chalk/60 mt-2">Goleador: <b className="text-chalk">{g.awards.goleador}</b></div>
            )}
          </div>
        </div>

        <div className="panel-soft p-4 mb-8 text-left">
          <div className="font-display text-xl tracking-wider text-gold mb-2">TABLA FINAL (TOP 8)</div>
          {table.map((row, i) => {
            const c = getClub(g, row.id);
            return (
              <div key={row.id} className={`flex items-center gap-2 text-sm py-0.5 ${row.id === g.userClub ? "text-lima font-bold" : ""}`}>
                <span className="font-display w-5 text-chalk/40">{i + 1}</span>
                <Crest club={c} size={18} />
                <span className="flex-1">{c.name}</span>
                <span className="font-display text-lima">{row.pts} pts</span>
              </div>
            );
          })}
        </div>

        <button className="btn btn-lima px-12 py-4 text-2xl" onClick={onRestart}><span>NUEVA TEMPORADA</span></button>
      </div>
    </div>
  );
}
