import { Component, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import type { GameState, Mode, PlayerP, Pos, Screen } from "./game/core";
import { LEAGUES } from "./game/core";
import {
  buildSeason, clearSeason, closeRound, getClub, hasSavedSeason, loadSeason, playCupRound,
  saveSeason, simOthers, squadOf, teamStrength, userNextFixture, xiOf,
} from "./game/engine";
import { sfx } from "./game/audio";
import SimMatch from "./components/SimMatch";
import ArcadeMatch from "./components/ArcadeMatch";
import { ClubSelect, HelpOverlay, ModeSelect, PlayerSetup, TitleScreen } from "./screens/Menu";
import { EndScreen, Hub, PostMatch } from "./screens/Career";

class Guard extends Component<{ children: ReactNode; onReset: () => void }, { err: boolean }> {
  state = { err: false };
  static getDerivedStateFromError() { return { err: true }; }
  componentDidCatch(err: unknown) { console.error("Ñambi Sport — error atrapado:", err); }
  render() {
    if (this.state.err) {
      return (
        <div className="min-h-screen grain flex items-center justify-center px-6">
          <div className="panel p-10 text-center max-w-md animate-popin">
            <div className="font-display text-4xl text-hot tracking-wider mb-3">¡SE TRABÓ LA PELOTA!</div>
            <p className="text-chalk/70 text-sm mb-6">Hubo un error inesperado, pero tu partida está guardada. Volvé al vestuario y seguí desde ahí.</p>
            <button className="btn btn-lima px-10 py-3 text-xl" onClick={() => { this.setState({ err: false }); this.props.onReset(); }}>
              <span>IR AL VESTUARIO</span>
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* garantiza que tu pibe esté siempre en el once (modo jugador) */
function ensureUserXI(g: GameState): PlayerP[] {
  const xi = xiOf(g, g.userClub, g.dt.formation);
  if (xi.some((p) => p.isUser)) return xi;
  const me = g.players.find((p) => p.id === g.userPlayerId);
  if (!me) return xi;
  const samePos = xi.filter((p) => p.pos === me.pos && !p.isUser).sort((a, b) => a.med - b.med);
  const victim = samePos[0] ?? [...xi].filter((p) => p.pos !== "ARQ").sort((a, b) => a.med - b.med)[0];
  if (!victim) return xi;
  return xi.map((p) => (p.id === victim.id ? me : p));
}

export default function App() {
  const [screen, setScreen] = useState<Screen>("menu");
  const [mode, setMode] = useState<Mode>("dt");
  const [leagueId, setLeagueId] = useState(LEAGUES[0].id);
  const [pendingClub, setPendingClub] = useState(0);
  const [matchKey, setMatchKey] = useState(0);
  const [hasSave, setHasSave] = useState(() => hasSavedSeason());
  const [savedAt, setSavedAt] = useState(0);
  const [muted, setMuted] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [, setTick] = useState(0);
  const gameRef = useRef<GameState | null>(null);
  const lastSaveAt = useRef(0);

  const persist = (force = false) => {
    const gm = gameRef.current;
    if (!gm) return;
    const now = Date.now();
    if (!force && now - lastSaveAt.current < 900) return;
    lastSaveAt.current = now;
    if (saveSeason(gm)) { setHasSave(true); setSavedAt(now); }
  };
  const refresh = () => { setTick((t) => t + 1); persist(); };

  useEffect(() => {
    if (!savedAt) return;
    const t = setTimeout(() => setSavedAt(0), 1700);
    return () => clearTimeout(t);
  }, [savedAt]);

  useEffect(() => {
    const unlock = () => sfx.unlock();
    window.addEventListener("pointerdown", unlock);
    return () => window.removeEventListener("pointerdown", unlock);
  }, []);

  const g = gameRef.current;

  /* si la temporada terminó (simulada o jugada), pasamos al desenlace */
  useEffect(() => {
    if (g?.seasonDone && (screen === "hub" || screen === "post")) setScreen("end");
  }, [g?.seasonDone, screen]);

  /* si entrás a la pantalla de partido pero ya no hay fixture (copa/fin), volvemos solos */
  useEffect(() => {
    if (screen === "match" && g && !userNextFixture(g)) {
      setScreen(g.seasonDone ? "end" : "hub");
    }
  }, [screen, g]);

  const toggleMute = () => setMuted(sfx.toggleMute());

  const continueSeason = () => {
    const st = loadSeason();
    if (!st) { setHasSave(false); return; }
    gameRef.current = st;
    setMatchKey((k) => k + 1);
    setScreen("hub");
    setTick((t) => t + 1);
    sfx.whistle();
  };

  /* ---- pantallas de arranque ---- */
  if (screen === "menu") {
    return (
      <Guard onReset={() => { gameRef.current = null; setScreen("menu"); }}>
        <TitleScreen
          onPlay={() => { sfx.whistle(); setScreen("modes"); }}
          onContinue={hasSave ? continueSeason : undefined}
          onHelp={() => setShowHelp(true)}
          muted={muted} onMute={toggleMute}
        />
        {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      </Guard>
    );
  }
  if (screen === "modes") {
    return (
      <Guard onReset={() => setScreen("menu")}>
        <ModeSelect
          onPick={(m) => { setMode(m); setScreen("clubs"); }}
          onBack={() => setScreen("menu")}
        />
      </Guard>
    );
  }
  if (screen === "clubs") {
    return (
      <Guard onReset={() => setScreen("menu")}>
        <ClubSelect
          createPlayer={mode === "player"}
          onPick={(lg, clubId) => {
            setLeagueId(lg);
            if (mode === "player") { setPendingClub(clubId); setScreen("create"); }
            else {
              gameRef.current = buildSeason(mode, lg, clubId, "", "DEL");
              setMatchKey((k) => k + 1);
              setScreen("hub");
              persist(true);
            }
          }}
          onBack={() => setScreen("modes")}
        />
      </Guard>
    );
  }
  if (screen === "create") {
    return (
      <Guard onReset={() => setScreen("menu")}>
        <PlayerSetup
          leagueId={leagueId}
          clubId={pendingClub}
          onDone={(name, pos, role) => {
            const st = buildSeason("player", leagueId, pendingClub, name, pos);
            st.userRole = role;
            gameRef.current = st;
            setMatchKey((k) => k + 1);
            setScreen("hub");
            persist(true);
          }}
          onBack={() => setScreen("clubs")}
        />
      </Guard>
    );
  }

  if (!g) return null;

  /* ---- partido en vivo ---- */
  if (screen === "match") {
    const fx = userNextFixture(g);
    if (!fx) return null; // el effect de arriba te devuelve a hub/end
    const isHome = fx.home === g.userClub;
    const userSide: 0 | 1 = isHome ? 0 : 1;
    const rivalId = isHome ? fx.away : fx.home;
    const userXi = ensureUserXI(g);
    const home = getClub(g, fx.home), away = getClub(g, fx.away);
    const userClub = getClub(g, g.userClub);
    const rivalClub = getClub(g, rivalId);
    const rivalXi = xiOf(g, rivalId, "4-3-3");
    const me = g.players.find((p) => p.id === g.userPlayerId);

    const finish = (res: Parameters<typeof closeRound>[1]) => {
      try {
        simOthers(g);
        closeRound(g, res, fx, userXi.map((p) => p.id));
      } catch (e) { console.error("closeRound:", e); }
      refresh();
      persist(true);
      setScreen("post");
    };

    return (
      <Guard onReset={() => { gameRef.current = loadSeason(); setScreen(gameRef.current ? "hub" : "menu"); }}>
        <div className="min-h-screen grain px-3 md:px-6 py-5">
          <div className="max-w-6xl mx-auto">
            {g.mode === "player" && me ? (
              <ArcadeMatch
                key={`arc-${matchKey}`}
                user={me}
                home={home}
                away={away}
                userXi={userXi}
                rivalXi={rivalXi}
                role={g.userRole}
                onFinish={finish}
              />
            ) : (
              <SimMatch
                key={`sim-${matchKey}`}
                home={home}
                away={away}
                userSide={userSide}
                getHomeXi={() => xiOf(g, fx.home, g.dt.formation)}
                getAwayXi={() => xiOf(g, fx.away, "4-3-3")}
                getUserXi={() => xiOf(g, g.userClub, g.dt.formation)}
                getSquad={() => squadOf(g, g.userClub)}
                getStrengths={() => ({
                  h: teamStrength(g, fx.home, xiOf(g, fx.home, g.dt.formation)),
                  a: teamStrength(g, fx.away, xiOf(g, fx.away, "4-3-3")),
                })}
                interactive={g.mode === "dt"}
                mentality={g.dt.mentality}
                pressing={g.dt.pressing}
                onTactics={(patch) => {
                  if (patch.mentality !== undefined) g.dt.mentality = patch.mentality;
                  if (patch.pressing !== undefined) g.dt.pressing = patch.pressing;
                  setTick((t) => t + 1);
                }}
                onSub={(outId, inId) => {
                  const ids = xiOf(g, g.userClub, g.dt.formation).map((p) => (p.id === outId ? inId : p.id));
                  if (new Set(ids).size === 11) {
                    g.userXI = ids;
                    setTick((t) => t + 1);
                  }
                }}
                onFinish={finish}
              />
            )}
            <div className="mt-4 flex items-center justify-between">
              <span className="chip bg-night-800 border border-chalk/15 text-chalk/70 text-sm">
                {userClub.name} vs {rivalClub.name} · Fecha {g.round + 1}
              </span>
              <span className="text-xs text-chalk/45">ESC pausa · 1/2/4 velocidad</span>
            </div>
          </div>
        </div>
      </Guard>
    );
  }

  /* ---- resumen ---- */
  if (screen === "post") {
    return (
      <Guard onReset={() => setScreen("hub")}>
        <PostMatch g={g} onNext={() => { setScreen(g.seasonDone ? "end" : "hub"); setMatchKey((k) => k + 1); }} />
      </Guard>
    );
  }

  /* ---- desenlace ---- */
  if (screen === "end") {
    return (
      <Guard onReset={() => { clearSeason(); setHasSave(false); gameRef.current = null; setScreen("menu"); }}>
        <EndScreen g={g} onRestart={() => { clearSeason(); setHasSave(false); gameRef.current = null; setScreen("menu"); }} />
      </Guard>
    );
  }

  /* ---- hub ---- */
  return (
    <Guard onReset={() => { gameRef.current = loadSeason(); setScreen(gameRef.current ? "hub" : "menu"); }}>
      <Hub
        g={g}
        refresh={refresh}
        onPlayLive={() => { setMatchKey((k) => k + 1); setScreen("match"); sfx.tab(); }}
        onCupRound={() => {
          try {
            const res = playCupRound(g);
            if (res) {
              g.lastResult = res;
              g.lastWasHome = true;
              persist(true);
              setScreen("post");
              setMatchKey((k) => k + 1);
              return;
            }
          } catch (e) { console.error("cup:", e); }
          refresh();
        }}
        onHelp={() => setShowHelp(true)}
        muted={muted}
        onMute={toggleMute}
      />
      {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      {savedAt > 0 && (
        <div key={savedAt} className="fixed bottom-4 right-4 z-50 animate-popin pointer-events-none">
          <div className="panel-soft px-4 py-2 flex items-center gap-2.5">
            <span className="w-2 h-2 bg-lima rounded-full animate-pulse" />
            <span className="font-display tracking-[0.18em] text-lima text-sm">PARTIDA GUARDADA</span>
          </div>
        </div>
      )}
    </Guard>
  );
}
