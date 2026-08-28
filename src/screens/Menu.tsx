import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { Crown, HelpCircle, Landmark, Target, Trophy, UserRound, Volume2, VolumeX } from "lucide-react";
import type { Mode, Pos, Role } from "../game/core";
import { LEAGUES, ROLES, TICKER_HEADLINES, leagueOf } from "../game/core";
import { sfx } from "../game/audio";
import { Crest } from "../components/ui";

function SoccerBall({ size = 24, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7.2 L16.4 10.4 L14.7 15.4 L9.3 15.4 L7.6 10.4 Z" fill="currentColor" opacity="0.85" />
      <path d="M12 3v4.2M16.4 10.4l4-1.3M14.7 15.4l2.5 3.4M9.3 15.4l-2.5 3.4M7.6 10.4l-4-1.3" />
    </svg>
  );
}

export function TitleScreen({ onPlay, onContinue, onHelp, muted, onMute }: {
  onPlay: () => void; onContinue?: () => void; onHelp: () => void; muted: boolean; onMute: () => void;
}) {
  return (
    <div className="min-h-screen grain relative overflow-hidden flex flex-col">
      {/* reflectores */}
      <div className="absolute -top-24 left-[8%] w-72 h-[520px] bg-lima/10 blur-3xl origin-top animate-beam pointer-events-none" style={{ clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)" }} />
      <div className="absolute -top-24 right-[8%] w-72 h-[520px] bg-cielo/10 blur-3xl origin-top animate-beam pointer-events-none" style={{ clipPath: "polygon(40% 0, 60% 0, 100% 100%, 0 100%)", animationDelay: "1.2s" }} />
      <div className="absolute bottom-0 inset-x-0 h-64 pointer-events-none" style={{ background: "repeating-linear-gradient(90deg, rgba(15,138,68,0.28) 0 80px, rgba(13,124,61,0.28) 80px 160px)", maskImage: "linear-gradient(to top, black, transparent)" }} />

      <div className="flex justify-end p-4 relative z-10">
        <button className="btn btn-ghost px-4 py-2" onClick={onMute}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
        <motion.div initial={{ scale: 0.7, opacity: 0, rotate: -4 }} animate={{ scale: 1, opacity: 1, rotate: 0 }} transition={{ type: "spring", stiffness: 120, damping: 12 }} className="animate-floaty">
          <div className="w-24 h-24 mx-auto mb-2 rounded-full border-4 border-chalk/80 flex items-center justify-center" style={{ background: "radial-gradient(circle at 35% 30%, #17402b, #0d6b37)" }}>
            <SoccerBall size={56} className="text-chalk animate-spinball" />
          </div>
        </motion.div>

        <motion.h1 initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.15 }}
          className="font-display text-[19vw] md:text-[10rem] leading-[0.85] text-center tracking-wide"
          style={{ textShadow: "0 0 44px rgba(184,255,46,0.35), 0 10px 0 rgba(3,13,7,0.9)" }}>
          ÑAMBI<span className="text-lima">·</span><span className="text-gold">SPORT</span>
        </motion.h1>
        <motion.p initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.3 }}
          className="font-display tracking-[0.4em] text-chalk/70 text-sm md:text-lg text-center">
          DEL POTRERO A LA GLORIA · DT · JUGADOR · PRESIDENTE
        </motion.p>

        <motion.div initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.4 }} className="flex flex-wrap gap-4 justify-center mt-10">
          {onContinue && (
            <button className="btn btn-gold px-10 py-4 text-2xl" onClick={onContinue}><Trophy size={22} /><span>CONTINUAR TEMPORADA</span></button>
          )}
          <button className="btn btn-lima px-12 py-4 text-3xl animate-pulsering" onClick={onPlay}>
            <SoccerBall size={26} /><span>{onContinue ? "NUEVA TEMPORADA" : "JUGAR"}</span>
          </button>
          <button className="btn btn-ghost px-8 py-4 text-xl" onClick={onHelp}><span>CÓMO SE JUEGA</span></button>
        </motion.div>
      </div>

      {/* ticker */}
      <div className="relative z-10 border-t border-lima/25 bg-night-900/90 py-2 overflow-hidden">
        <div className="flex whitespace-nowrap animate-ticker">
          {[...TICKER_HEADLINES, ...TICKER_HEADLINES].map((h, i) => (
            <span key={i} className="mx-6 text-sm font-semibold text-chalk/80">
              <span className="text-lima font-display tracking-widest mr-2">{i % 3 === 0 ? "ÚLTIMO MOMENTO" : "ÑAMBI RADIO"}</span>{h}
              <span className="text-lima mx-4">///</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

export function ModeSelect({ onPick, onBack }: { onPick: (m: Mode) => void; onBack: () => void }) {
  const modes: { id: Mode; icon: React.ReactNode; t: string; d: string; c: string }[] = [
    { id: "dt", icon: <Target size={34} />, t: "DIRECTOR TÉCNICO", d: "Armá el once titular, la formación y la mentalidad. En vivo hacés cambios y movés la pizarra. Si no ganás, el presidente te echa.", c: "#b8ff2e" },
    { id: "player", icon: <UserRound size={34} />, t: "JUGADOR", d: "Sos el pibe que debuta con la 10. Corré, pasá, pedila y defini en un 11 vs 11 real. Tu promedio decide si Europa te compra.", c: "#41d6ff" },
    { id: "president", icon: <Landmark size={34} />, t: "PRESIDENTE", d: "El partido se juega solo: tu cancha es la oficina. Entradas, sponsors, técnicos y estadio. Caja en rojo o hinchada en contra = despido.", c: "#ffc233" },
  ];
  return (
    <div className="min-h-screen grain flex flex-col items-center justify-center px-6 py-10">
      <h2 className="font-display text-6xl md:text-7xl tracking-wide mb-2" style={{ textShadow: "0 0 30px rgba(184,255,46,0.3)" }}>ELEGÍ TU <span className="text-lima">ROL</span></h2>
      <p className="text-chalk/60 mb-10 text-center">Tres maneras de vivir la misma temporada.</p>
      <div className="grid md:grid-cols-3 gap-5 max-w-5xl w-full">
        {modes.map((m, i) => (
          <motion.button key={m.id} initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: i * 0.08 }}
            onClick={() => { sfx.tab(); onPick(m.id); }}
            className="panel p-6 text-left group hover:-translate-y-2 transition-transform duration-200 cursor-pointer"
            style={{ borderColor: `${m.c}55` }}>
            <div className="mb-3 transition-transform group-hover:scale-110 origin-left" style={{ color: m.c }}>{m.icon}</div>
            <div className="font-display text-3xl tracking-wide mb-2" style={{ color: m.c }}>{m.t}</div>
            <p className="text-sm text-chalk/70 leading-relaxed">{m.d}</p>
          </motion.button>
        ))}
      </div>
      <button className="btn btn-ghost px-8 py-3 mt-10" onClick={onBack}><span>VOLVER</span></button>
    </div>
  );
}

export function ClubSelect({ createPlayer, onPick, onBack }: {
  createPlayer: boolean;
  onPick: (leagueId: string, clubId: number) => void;
  onBack: () => void;
}) {
  const [leagueId, setLeagueId] = useState(LEAGUES[0].id);
  const league = useMemo(() => leagueOf(leagueId), [leagueId]);
  return (
    <div className="min-h-screen grain px-4 md:px-8 py-8">
      <div className="max-w-6xl mx-auto">
        <h2 className="font-display text-5xl md:text-6xl tracking-wide mb-1" style={{ textShadow: "0 0 30px rgba(184,255,46,0.3)" }}>
          {createPlayer ? <>¿DÓNDE DEBUTA <span className="text-lima">TU PIBE</span>?</> : <>ELEGÍ TU <span className="text-lima">CLUB</span></>}
        </h2>
        <p className="text-chalk/60 mb-5">
          {league.rows.length} clubes · los <b className="text-gold">8 primeros</b> clasifican a la <b className="text-gold">{league.continental}</b>.
        </p>

        <div className="flex flex-wrap gap-2 mb-6">
          {LEAGUES.map((l) => (
            <button key={l.id} onClick={() => { setLeagueId(l.id); sfx.tab(); }}
              className={`btn px-5 py-2 ${l.id === leagueId ? "btn-lima" : "btn-ghost"}`}>
              <span>{l.flag} {l.name.toUpperCase()}</span>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {league.rows.map((r, i) => {
            const club = { id: i, name: r[0], short: r[1], c1: r[2], c2: r[3], stripe: r[4], prestige: r[5], capacity: r[6], money: r[7], fans: r[8] };
            return (
              <motion.button key={r[0]} initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.02, 0.4) }}
                onClick={() => { sfx.whistle(); onPick(leagueId, i); }}
                className="panel-soft p-3 flex items-center gap-3 text-left hover:-translate-y-1 hover:border-lima/50 transition-all duration-150 cursor-pointer">
                <Crest club={club} size={46} />
                <div className="min-w-0">
                  <div className="font-display text-lg leading-tight tracking-wide truncate">{club.name}</div>
                  <div className="text-[11px] text-chalk/55">★ {"★".repeat(club.prestige)} · {Math.round(club.capacity / 1000)}k</div>
                </div>
              </motion.button>
            );
          })}
        </div>
        <button className="btn btn-ghost px-8 py-3 mt-8" onClick={onBack}><span>VOLVER</span></button>
      </div>
    </div>
  );
}

export function PlayerSetup({ leagueId, clubId, onDone, onBack }: {
  leagueId: string; clubId: number;
  onDone: (name: string, pos: Pos, role: Role) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [role, setRole] = useState<Role>("ENG");
  const league = leagueOf(leagueId);
  const row = league.rows[clubId];
  const meta = ROLES.find((r) => r.id === role)!;
  const club = { id: clubId, name: row[0], short: row[1], c1: row[2], c2: row[3], stripe: row[4], prestige: row[5], capacity: row[6], money: row[7], fans: row[8] };
  return (
    <div className="min-h-screen grain flex items-center justify-center px-4 py-10">
      <div className="panel p-8 max-w-3xl w-full animate-risein">
        <div className="flex items-center gap-4 mb-6">
          <Crest club={club} size={64} />
          <div>
            <h2 className="font-display text-4xl tracking-wide">TU <span className="text-lima">PIBE</span></h2>
            <p className="text-chalk/60 text-sm">Debutás en <b className="text-chalk">{club.name}</b> con la 10 en la espalda.</p>
          </div>
        </div>

        <label className="block text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Nombre del crack</label>
        <input type="text" className="w-full mb-5" maxLength={22} placeholder="Ej: Tony Ñamendez"
          value={name} onChange={(e) => setName(e.target.value)} />

        <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-2">Tu puesto en la cancha</div>
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2 mb-3">
          {ROLES.map((r) => (
            <button key={r.id} onClick={() => { setRole(r.id); sfx.tab(); }}
              className={`px-1 py-2 text-center border transition-all ${role === r.id ? "border-lima bg-lima/15 text-lima -translate-y-0.5" : "border-chalk/15 text-chalk/60 hover:text-chalk hover:border-chalk/40"}`}
              style={{ clipPath: "polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%)" }} title={r.desc}>
              <span className="block font-display text-xl leading-none">{r.short}</span>
            </button>
          ))}
        </div>
        <p className="text-sm text-chalk/60 mb-6"><b className="text-lima">{meta.label}</b> — {meta.desc}</p>

        <div className="flex gap-3">
          <button className="btn btn-ghost px-8 py-3" onClick={onBack}><span>VOLVER</span></button>
          <button className="btn btn-lima flex-1 py-3 text-2xl" disabled={name.trim().length < 2}
            onClick={() => { sfx.whistle(); onDone(name.trim(), meta.pos, role); }}>
            <SoccerBall size={22} /><span>¡A LA CANCHA!</span>
          </button>
        </div>
      </div>
    </div>
  );
}

export function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 bg-night-950/92 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="panel p-8 max-w-2xl w-full animate-popin my-8">
        <div className="flex items-center justify-between mb-5">
          <h3 className="font-display text-4xl tracking-wide flex items-center gap-3"><HelpCircle size={30} className="text-lima" />CÓMO SE JUEGA</h3>
          <button className="btn btn-ghost px-4 py-2" onClick={onClose}><span>CERRAR</span></button>
        </div>
        <div className="space-y-4 text-sm text-chalk/80 leading-relaxed">
          <p><b className="text-lima">DT:</b> elegí formación, mentalidad y presión en TÁCTICAS y armá tu once titular. Durante el partido podés cambiar en vivo (se pausa solo) y mover la pizarra. La barra de PACIENCIA es tu vida: si llega a cero, te echan.</p>
          <p><b className="text-cielo">JUGADOR:</b> <b>WASD/flechas</b> moverte, <b>SHIFT</b> sprint, <b>ESPACIO</b> remate al arco o pase largo, <b>E</b> pase al pie, <b>Q</b> pedir la pelota, <b>F</b> despeje. Tu puesto define dónde arrancás. Promedio 7.2+ y podio = Europa.</p>
          <p><b className="text-gold">PRESIDENTE:</b> ajustá el precio de la entrada, firmá sponsors, contratá técnico y ampliá el estadio. Los partidos se simulan en vivo. Caja en rojo o hinchada harta = despido.</p>
          <p><b className="text-chalk">TEMPORADA:</b> liga de todos contra todos. Los <b>8 primeros</b> juegan la copa continental (Libertadores o Champions). Al final se entrega el <b className="text-gold">Balón de Oro Ñambi</b> al mejor jugador.</p>
          <p><b className="text-chalk">FECHAS:</b> podés jugar EN VIVO, SIMULAR la fecha, SALTAR hasta el próximo partido clave (clásicos y rivales directos) o SIMULAR TODA la temporada.</p>
          <p className="text-chalk/50">El juego se guarda solo: cerrá cuando quieras y seguí con CONTINUAR TEMPORADA.</p>
        </div>
      </div>
    </div>
  );
}

export function CrownIcon(props: { size?: number }) {
  return <Crown {...props} />;
}
