import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import type { Club, MatchEvent, MatchResult, PlayerP, Pos, Scorer, Strength } from "../game/core";
import { sfx } from "../game/audio";

/* cancha en coords locales; el canvas agrega tribunas alrededor */
const FW = 840, FH = 500, OX = 60, OY = 50;
const W = FW + OX * 2, H = FH + OY * 2; // 960x600
const MOUTH = 40;

interface Props {
  home: Club;
  away: Club;
  userSide: 0 | 1;
  getHomeXi: () => PlayerP[];
  getAwayXi: () => PlayerP[];
  getUserXi: () => PlayerP[];
  getSquad: () => PlayerP[];
  getStrengths: () => { h: Strength; a: Strength };
  interactive: boolean;
  mentality: number;
  pressing: number;
  onTactics: (patch: { mentality?: number; pressing?: number }) => void;
  onSub: (outId: number, inId: number) => void;
  onFinish: (res: MatchResult) => void;
}

interface Ent {
  x: number; y: number; vx: number; vy: number; hx: number; hy: number;
  team: 0 | 1; role: Pos; num: number; p: PlayerP;
  cd: number; sent: boolean; carded: boolean; face: number; runT: number;
}
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface Popup { x: number; y: number; text: string; color: string; t: number }
interface RawStats { possH: number; possA: number; shotsH: number; shotsA: number; onH: number; onA: number; passesH: number; passesA: number; foulsH: number; foulsA: number }

interface SimState {
  ents: Ent[];
  ball: { x: number; y: number; vx: number; vy: number; owner: number; spin: number };
  trail: { x: number; y: number; t: number }[];
  passTarget: number; passFrom: number; crossBall: boolean;
  shotTeam: number; shotTested: boolean; shotShooter: number; shotD: number;
  min: number; acc: number; scoreH: number; scoreA: number;
  events: MatchEvent[]; scorers: Scorer[]; cards: number; stats: RawStats;
  particles: Particle[]; popups: Popup[];
  shake: number; flash: number; banner: { text: string; t: number } | null;
  momentum: number; done: boolean; htShown: boolean; pauseK: number; kickTeam: 0 | 1;
  decT: number; looseT: number; graceT: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const lastName = (n: string) => n.split(" ").slice(-1)[0];
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export default function SimMatch(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<SimState>({
    ents: [], ball: { x: FW / 2, y: FH / 2, vx: 0, vy: 0, owner: -1, spin: 0 },
    trail: [], passTarget: -1, passFrom: -1, crossBall: false,
    shotTeam: -1, shotTested: false, shotShooter: -1, shotD: 300,
    min: 0, acc: 0, scoreH: 0, scoreA: 0,
    events: [{ min: 0, text: "¡Arranca el partido! Rueda la pelota.", kind: "info", club: -1 }],
    scorers: [], cards: 0,
    stats: { possH: 0, possA: 0, shotsH: 0, shotsA: 0, onH: 0, onA: 0, passesH: 0, passesA: 0, foulsH: 0, foulsA: 0 },
    particles: [], popups: [],
    shake: 0, flash: 0, banner: { text: "¡COMIENZA!", t: 1.4 },
    momentum: 0, done: false, htShown: false, pauseK: 0.5, kickTeam: 0,
    decT: 0.4, looseT: 0, graceT: 0,
  });
  const pausedRef = useRef(false);
  const autoPausedRef = useRef(false);
  const speedRef = useRef(1);
  const propsRef = useRef(props);
  propsRef.current = props;

  const [ui, setUi] = useState({ min: 0, scoreH: 0, scoreA: 0, momentum: 0, speed: 1 });
  const [paused, setPaused] = useState(false);
  const [subOpen, setSubOpen] = useState(false);
  const [subOut, setSubOut] = useState(-1);
  const [subIn, setSubIn] = useState(-1);
  const [, force] = useState(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" || e.key === "p" || e.key === "P") {
        pausedRef.current = !pausedRef.current;
        setPaused(pausedRef.current);
        sfx.click();
      }
      if (e.key === "1") speedRef.current = 1;
      if (e.key === "2") speedRef.current = 2;
      if (e.key === "4") speedRef.current = 4;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    const pr0 = propsRef.current;
    const us = pr0.userSide;

    /* ============ TRIBUNA PRE-RENDERIZADA ============ */
    const standCv = document.createElement("canvas");
    standCv.width = FW + 300; standCv.height = FH + 220;
    const sc = standCv.getContext("2d");
    if (sc) {
      sc.fillStyle = "#04100a";
      sc.fillRect(0, 0, standCv.width, standCv.height);
      // gradiente de tribuna
      const tg = sc.createLinearGradient(0, 0, 0, standCv.height);
      tg.addColorStop(0, "#0a1a12"); tg.addColorStop(0.5, "#071409"); tg.addColorStop(1, "#0a1a12");
      sc.fillStyle = tg;
      sc.fillRect(0, 0, standCv.width, standCv.height);
      // hinchada: mitad local, mitad visitante
      const homeCols = [pr0.home.c1, pr0.home.c1, pr0.home.c2, "#d8dde6", "#8b8f98"];
      const awayCols = [pr0.away.c1, pr0.away.c1, pr0.away.c2, "#d8dde6", "#8b8f98"];
      for (let x = 3; x < standCv.width; x += 9) {
        for (let y = 3; y < standCv.height; y += 9) {
          const fx = x - 150, fy = y - 110;
          if (fx > -16 && fx < FW + 16 && fy > -16 && fy < FH + 16) continue;
          if (Math.random() < 0.14) continue;
          const cols = fx < FW / 2 ? homeCols : awayCols;
          sc.fillStyle = cols[Math.floor(Math.random() * cols.length)];
          sc.globalAlpha = 0.45 + Math.random() * 0.5;
          sc.fillRect(x + Math.random() * 3 - 1.5, y + Math.random() * 3 - 1.5, 3.6, 3.6);
        }
      }
      sc.globalAlpha = 1;
      // cartelería
      const ads = ["ÑAMBI SPORT", "GOL TV", "BANCO ÑAMBI", "AEROCHARRÚA", "LA POTRERA"];
      sc.font = "800 10px Barlow, sans-serif";
      for (let x = 0; x < FW; x += 100) {
        const k = Math.floor(x / 100) % 3;
        for (const yy of [-27, FH + 13]) {
          sc.fillStyle = ["#0f3020", "#13293f", "#38121e"][k];
          sc.fillRect(x + 150, yy + 110, 96, 14);
          sc.fillStyle = ["#b8ff2e", "#41d6ff", "#ffc233"][k];
          sc.globalAlpha = 0.9;
          sc.fillText(ads[Math.floor(x / 100) % ads.length], x + 158, yy + 120.5);
          sc.globalAlpha = 1;
        }
      }
      // pasillos de tribuna
      sc.fillStyle = "rgba(242,255,233,0.05)";
      sc.fillRect(0, 110 - 60, standCv.width, 2);
      sc.fillRect(0, FH + 110 + 58, standCv.width, 2);
    }

    /* ============ CONSTRUCCIÓN ============ */
    const buildEnts = () => {
      const out: Ent[] = [];
      const mk = (xi: PlayerP[], team: 0 | 1) => {
        const order: Pos[] = ["ARQ", "DEF", "MED", "DEL"];
        const rowsX: Record<Pos, number> = { ARQ: 48, DEF: 178, MED: 338, DEL: 488 };
        let n = 0;
        order.forEach((role) => {
          const ps = xi.filter((p) => p.pos === role).sort((a, b) => b.med - a.med);
          ps.forEach((p, i) => {
            n++;
            const y = FH * ((i + 1) / (ps.length + 1));
            out.push({
              x: team === 0 ? rowsX[role] : FW - rowsX[role], y, vx: 0, vy: 0, hx: rowsX[role], hy: y,
              team, role, num: n, p, cd: 0, sent: false, carded: false, face: team === 0 ? 0 : Math.PI, runT: 0,
            });
          });
        });
      };
      mk(pr0.getHomeXi(), 0);
      mk(pr0.getAwayXi(), 1);
      return out;
    };
    const s0 = st.current;
    s0.ents = buildEnts();
    const first = s0.ents.find((e) => e.team === 0 && e.role !== "ARQ");
    if (first) s0.ball.owner = s0.ents.indexOf(first);
    sfx.whistle();

    /* ============ HELPERS ============ */
    const popup = (x: number, y: number, text: string, color: string) => {
      st.current.popups.push({ x, y, text, color, t: 0 });
    };
    const burst = (x: number, y: number, n: number, colors: string[]) => {
      const s = st.current;
      for (let i = 0; i < n; i++) {
        s.particles.push({
          x, y, vx: (Math.random() - 0.5) * 460, vy: -Math.random() * 400 - 60,
          life: 0, max: 1 + Math.random(), color: colors[i % colors.length], size: 3 + Math.random() * 5,
        });
      }
    };

    const takeBall = (i: number) => {
      const s = st.current;
      s.ball.owner = i;
      s.passTarget = -1; s.passFrom = -1;
      s.shotTeam = -1; s.ball.vx = 0; s.ball.vy = 0;
      s.graceT = 0.45;
    };

    const resetToGK = (team: 0 | 1) => {
      const s = st.current;
      const gk = s.ents.find((e) => e.team === team && e.role === "ARQ" && !e.sent);
      if (gk) {
        s.ball.x = gk.x + (team === 0 ? 16 : -16);
        s.ball.y = gk.y;
        s.ball.vx = 0; s.ball.vy = 0;
        s.ball.owner = s.ents.indexOf(gk);
      }
      s.passTarget = -1; s.passFrom = -1; s.shotTeam = -1;
    };

    const assignKickoff = () => {
      const s = st.current;
      const opts = s.ents.filter((e) => e.team === s.kickTeam && e.role !== "ARQ" && !e.sent);
      if (opts.length) takeBall(s.ents.indexOf(opts[Math.floor(Math.random() * opts.length)]));
    };

    const goalScored = (team: 0 | 1, shooterIdx: number) => {
      const s = st.current; const pr = propsRef.current;
      if (team === 0) s.scoreH++; else s.scoreA++;
      const sp = s.ents[shooterIdx]?.p;
      const clubId = team === 0 ? pr.home.id : pr.away.id;
      if (sp) s.scorers.push({ pid: sp.id, name: sp.name, club: clubId, min: Math.floor(s.min) });
      s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "goal", text: `¡GOOOOL DE ${lastName(sp?.name ?? "LA CASA")}! Grita ${team === 0 ? pr.home.name : pr.away.name}.` });
      const gx = team === 0 ? FW - 20 : 20;
      const col = team === 0 ? pr.home.c1 : pr.away.c1;
      burst(gx, FH / 2, 90, [col === "#f2f2f2" || col === "#f4f4f4" ? "#ffd400" : col, "#ffc233", "#f2ffe9", "#b8ff2e"]);
      popup(gx, FH / 2 - 40, "¡GOL!", "#b8ff2e");
      s.shake = 13; s.flash = 0.6; s.banner = { text: "¡GOOOL!", t: 1.5 };
      sfx.goal();
      force((t) => t + 1);
      s.passTarget = -1; s.passFrom = -1; s.shotTeam = -1;
      s.pauseK = 1.4; s.kickTeam = (1 - team) as 0 | 1;
      s.ball.x = FW / 2; s.ball.y = FH / 2; s.ball.vx = 0; s.ball.vy = 0; s.ball.owner = -1;
    };

    const nearestOppDist = (e: Ent) => {
      const s = st.current; let bd = 1e9;
      for (const o of s.ents) {
        if (o.team === e.team || o.sent || o.role === "ARQ") continue;
        bd = Math.min(bd, dist(o, e));
      }
      return bd;
    };

    const advance = (e: Ent) => (e.team === 0 ? e.x : FW - e.x) / FW; // 0..1 hacia el arco rival

    const doShot = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const gx = o.team === 0 ? FW - 12 : 12;
      const acc2 = o.p.stats?.tiro ?? o.p.med;
      const dGoal = Math.hypot(gx - o.x, FH / 2 - o.y);
      const spread = clamp(150 - acc2 * 0.92 - (240 - Math.min(240, dGoal)) * 0.26, 15, 108);
      const ty = FH / 2 + (Math.random() * 2 - 1) * spread;
      const onT = Math.abs(ty - FH / 2) <= MOUTH - 2;
      const dx = gx - s.ball.x, dy = ty - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      const pw = 520 + acc2 * 2 + Math.random() * 60;
      s.ball.vx = (dx / dl) * pw; s.ball.vy = (dy / dl) * pw;
      s.ball.owner = -1; s.passTarget = -1; s.passFrom = -1;
      s.shotTeam = o.team; s.shotTested = false; s.shotShooter = oi; s.shotD = dGoal;
      if (o.team === 0) s.stats.shotsH++; else s.stats.shotsA++;
      if (onT) { if (o.team === 0) s.stats.onH++; else s.stats.onA++; }
      sfx.kick();
    };

    /* pase al hueco: apunta delante del receptor según su velocidad */
    const doPass = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const dir = o.team === 0 ? 1 : -1;
      let mates = s.ents.map((e, i) => ({ e, i }))
        .filter((z) => z.e.team === o.team && z.i !== oi && !z.e.sent && z.e.role !== "ARQ");
      if (!mates.length) return;
      if (o.role === "ARQ") {
        const out = mates.filter((z) => (z.e.x * dir) > 200);
        if (out.length) mates = out;
      }
      const scored = mates.map((z) => {
        const adv = z.e.x * dir;
        const free = nearestOppDist(z.e);
        return { z, score: adv * 0.6 + free * 1.25 - dist(o, z.e) * 0.32 };
      }).sort((a, b) => b.score - a.score);
      let pick = scored[0];
      if (Math.random() < 0.3 && scored.length > 2) {
        const widest = [...scored].sort((a, b) => Math.abs(b.z.e.y - FH / 2) - Math.abs(a.z.e.y - FH / 2))[0];
        if (Math.abs(widest.z.e.y - FH / 2) > 120) pick = widest;
      } else if (Math.random() < 0.35) {
        pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
      }
      const t = pick.z.e;
      const dx0 = t.x + dir * 34 - s.ball.x, dy0 = t.y - s.ball.y;
      const d = Math.hypot(dx0, dy0) || 1;
      const pw = clamp(d * 2.4, 360, 640);
      const tEst = d / pw;
      const leadX = t.x + t.vx * tEst * 0.8 + dir * 34;
      const leadY = t.y + t.vy * tEst * 0.8;
      const ldx = leadX - s.ball.x, ldy = leadY - s.ball.y;
      const ld = Math.hypot(ldx, ldy) || 1;
      s.ball.vx = (ldx / ld) * pw; s.ball.vy = (ldy / ld) * pw;
      s.ball.owner = -1; s.passTarget = pick.z.i; s.passFrom = oi;
      s.shotTeam = -1; s.crossBall = false;
      // pared: el que pasa pica al espacio
      if (o.role === "MED" && Math.random() < 0.45) o.runT = 1.3;
      if (d > 300) sfx.kick(); else sfx.pass();
    };

    /* centro desde la banda al área */
    const doCross = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const dir = o.team === 0 ? 1 : -1;
      const strikers = s.ents.filter((e) => e.team === o.team && e.role === "DEL" && !e.sent);
      const target = strikers.length ? strikers.reduce((a, b) => (Math.abs(a.y - FH / 2) < Math.abs(b.y - FH / 2) ? a : b)) : null;
      const tx = target ? target.x + target.vx * 0.25 : (o.team === 0 ? FW - 120 : 120);
      const ty = target ? clamp(target.y, FH / 2 - 90, FH / 2 + 90) : FH / 2 + (Math.random() * 2 - 1) * 70;
      const dx = tx - s.ball.x, dy = ty - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      const pw = clamp(dl * 2.1, 420, 600);
      s.ball.vx = (dx / dl) * pw; s.ball.vy = (dy / dl) * pw;
      s.ball.owner = -1;
      s.passTarget = target ? s.ents.indexOf(target) : -1;
      s.passFrom = oi; s.shotTeam = -1; s.crossBall = true;
      const clubId = o.team === 0 ? propsRef.current.home.id : propsRef.current.away.id;
      s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡Centro de ${lastName(o.p.name)} al corazón del área!` });
      popup(s.ball.x, s.ball.y - 26, "¡CENTRO!", "#41d6ff");
      sfx.kick();
      void dir;
      force((t) => t + 1);
    };

    /* pelotazo de contra */
    const doLong = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const dir = o.team === 0 ? 1 : -1;
      const strikers = s.ents.filter((e) => e.team === o.team && e.role === "DEL" && !e.sent);
      if (!strikers.length) { doPass(oi); return; }
      const t = strikers.reduce((a, b) => ((b.x * dir) > (a.x * dir) ? b : a));
      const tx = clamp(t.x + dir * 120, 40, FW - 40);
      const dx = tx - s.ball.x, dy = t.y - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      const pw = clamp(dl * 1.7, 480, 680);
      s.ball.vx = (dx / dl) * pw; s.ball.vy = (dy / dl) * pw;
      s.ball.owner = -1; s.passTarget = s.ents.indexOf(t); s.passFrom = oi;
      s.shotTeam = -1; s.crossBall = false;
      t.runT = 1.5;
      const clubId = o.team === 0 ? propsRef.current.home.id : propsRef.current.away.id;
      s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡Contragolpe de ${clubId === propsRef.current.home.id ? propsRef.current.home.name : propsRef.current.away.name}! ${lastName(o.p.name)} mete el pelotazo.` });
      popup(s.ball.x, s.ball.y - 26, "¡CONTRA!", "#ffc233");
      sfx.kick();
      force((t) => t + 1);
    };

    /* ============ FÍSICA ============ */
    const steer = (e: Ent, tx: number, ty: number, maxSp: number, h: number) => {
      const dx = tx - e.x, dy = ty - e.y;
      const d = Math.hypot(dx, dy);
      const f = 1 - Math.exp(-5.2 * h);
      if (d > 1) {
        e.vx += ((dx / d) * maxSp - e.vx) * f;
        e.vy += ((dy / d) * maxSp - e.vy) * f;
      } else {
        e.vx *= 1 - f; e.vy *= 1 - f;
      }
      e.x += e.vx * h; e.y += e.vy * h;
      const sp = Math.hypot(e.vx, e.vy);
      if (sp > 24) e.face = Math.atan2(e.vy, e.vx);
    };

    const stepPhysics = (h: number, now: number) => {
      const s = st.current; const pr = propsRef.current;
      if (s.done) return;
      s.acc += h * 1.5;
      while (s.acc >= 1) {
        s.acc -= 1; s.min++;
        if (s.min === 45 && !s.htShown) { s.htShown = true; s.banner = { text: "ENTRETIEMPO", t: 1.4 }; sfx.whistle(); }
        if (s.min >= 90) { s.done = true; s.banner = { text: "FINAL", t: 2 }; sfx.whistle(true); }
      }
      if (s.done) return;

      // sincronizar cambios hechos por el usuario
      for (const team of [0, 1] as const) {
        const xi = team === 0 ? pr.getHomeXi() : pr.getAwayXi();
        const used = new Set<number>();
        for (const e of s.ents) if (e.team === team) used.add(e.p.id);
        for (const e of s.ents) {
          if (e.team !== team) continue;
          if (!xi.some((p) => p.id === e.p.id)) {
            const repl = xi.find((p) => !used.has(p.id) && p.pos === e.role) ?? xi.find((p) => !used.has(p.id));
            if (repl) { used.delete(e.p.id); used.add(repl.id); e.p = repl; }
          }
        }
      }

      const b = s.ball;
      s.graceT -= h;

      if (s.pauseK > 0) {
        s.pauseK -= h;
        s.ents.forEach((e) => {
          if (e.sent) return;
          const tx = e.team === 0 ? e.hx : FW - e.hx;
          steer(e, tx, e.hy, 150, h);
        });
        b.x = FW / 2; b.y = FH / 2; b.vx = 0; b.vy = 0;
        if (s.pauseK <= 0) assignKickoff();
        return;
      }

      const str = pr.getStrengths();
      const mentality = pr.mentality;

      if (b.owner >= 0) {
        const t = s.ents[b.owner].team;
        if (t === 0) s.stats.possH += h; else s.stats.possA += h;
        s.momentum += ((t === 0 ? 0.55 : -0.55) - s.momentum) * h * 0.9;
      } else {
        s.momentum *= 1 - h * 0.4;
      }
      s.momentum = clamp(s.momentum, -1, 1);

      // presionan pocos; el resto sostiene el bloque
      const pressers = new Set<number>();
      if (b.owner >= 0) {
        const defTeam = (1 - s.ents[b.owner].team) as 0 | 1;
        const nPress = defTeam === us ? 1 + pr.pressing : 2;
        const cands = s.ents.map((e, i) => ({ e, i })).filter((z) => z.e.team === defTeam && z.e.role !== "ARQ" && !z.e.sent);
        cands.sort((a, z) => dist(a.e, b) - dist(z.e, b));
        cands.slice(0, nPress).forEach((c) => pressers.add(c.i));
      } else {
        for (const t of [0, 1] as const) {
          const cands = s.ents.map((e, i) => ({ e, i })).filter((z) => z.e.team === t && z.e.role !== "ARQ" && !z.e.sent);
          cands.sort((a, z) => dist(a.e, b) - dist(z.e, b));
          cands.slice(0, 2).forEach((c) => pressers.add(c.i));
        }
      }

      /* ---- MOVIMIENTO (física con inercia) ---- */
      const ownerTeam = b.owner >= 0 ? s.ents[b.owner].team : -1;
      s.ents.forEach((e, i) => {
        if (e.sent) { e.x = -80; e.y = -80; return; }
        e.cd = Math.max(0, e.cd - h);
        e.runT = Math.max(0, e.runT - h);
        const spd = 0.82 + (e.p.stats?.ritmo ?? e.p.med) / 230;
        const dir = e.team === 0 ? 1 : -1;
        let tx: number, ty: number, sp: number;

        if (e.role === "ARQ") {
          const gx = e.team === 0 ? 42 : FW - 42;
          tx = gx;
          ty = clamp(b.y, FH / 2 - 85, FH / 2 + 85);
          sp = 150 * (s.shotTeam >= 0 && s.shotTeam !== e.team ? 2.1 : 1);
          if (b.owner < 0 && dist(e, b) < 27 && Math.abs(b.x - gx) < 110) takeBall(i);
        } else if (e.runT > 0 && e.team === ownerTeam && b.owner !== i) {
          // pique al espacio (pared / contra)
          tx = clamp(e.x + dir * 160, 30, FW - 30);
          ty = e.hy + (b.y - FH / 2) * 0.2;
          sp = 128 * spd;
        } else if (pressers.has(i) && ownerTeam !== e.team) {
          tx = b.x; ty = b.y;
          const mul = e.team === us ? 1 + pr.pressing * 0.1 : 1.05;
          sp = 114 * spd * mul;
        } else if (b.owner === i) {
          tx = e.team === 0 ? FW - 24 : 24;
          ty = FH / 2 + Math.sin(now / 500 + i * 1.7) * 46;
          let nearest: Ent | null = null, nd = 1e9;
          for (const o of s.ents) { if (o.team !== e.team && !o.sent && o.role !== "ARQ") { const d = dist(o, e); if (d < nd) { nd = d; nearest = o; } } }
          if (nearest && nd < 60) ty = e.y + (e.y < nearest.y ? -100 : 100);
          ty = clamp(ty, 30, FH - 30);
          const menBoost = e.team === us && mentality === 2 ? 1.08 : 1;
          sp = 120 * spd * menBoost;
        } else if (ownerTeam === e.team) {
          // desmarques y apertura
          const lead = e.role === "DEL" ? 46 : e.role === "MED" ? 16 : -36;
          const baseX = e.hx + (b.x - FW / 2) * (e.role === "DEL" ? 0.55 : e.role === "MED" ? 0.4 : 0.28);
          tx = e.team === 0 ? baseX + lead : FW - baseX - lead;
          const wide = Math.abs(e.hy - FH / 2) > 110 ? (e.hy < FH / 2 ? -46 : 46) : 0;
          ty = e.hy + (b.y - FH / 2) * 0.3 + wide;
          tx = clamp(tx, 24, FW - 24); ty = clamp(ty, 26, FH - 26);
          sp = (e.role === "DEL" ? 110 : 98) * spd;
        } else if (ownerTeam >= 0) {
          // bloque defensivo entre la pelota y el arco
          const back = e.role === "DEF" ? 0.75 : e.role === "MED" ? 0.5 : 0.2;
          tx = e.team === 0
            ? clamp(b.x - 140 * back - 40, 60, FW - 60)
            : clamp(b.x + 140 * back + 40, 60, FW - 60);
          ty = clamp(e.hy + (b.y - FH / 2) * 0.34, 26, FH - 26);
          sp = 98 * spd;
        } else {
          tx = e.team === 0 ? e.hx : FW - e.hx;
          ty = e.hy;
          sp = 92 * spd;
        }

        steer(e, tx, ty, sp, h);
        e.x = clamp(e.x, -6, FW + 6);
        e.y = clamp(e.y, -6, FH + 6);
      });

      /* ---- decisiones del dueño ---- */
      if (b.owner >= 0) {
        const o = s.ents[b.owner];
        if (!o.sent) {
          b.x = o.x + Math.cos(o.face) * 12;
          b.y = o.y + Math.sin(o.face) * 12 + Math.sin(now / 90) * 1.2;
          b.vx = 0; b.vy = 0;
          s.decT -= h;
          if (s.decT <= 0) {
            s.decT = 0.15 + Math.random() * 0.16;
            const gx = o.team === 0 ? FW - 24 : 24;
            const dGoal = Math.hypot(gx - o.x, FH / 2 - o.y);
            const atk = o.team === 0 ? str.h.atk : str.a.atk;
            let nearestD = 1e9;
            for (const z of s.ents) if (z.team !== o.team && !z.sent && z.role !== "ARQ") nearestD = Math.min(nearestD, dist(z, o));
            const shootRange = 240 + (o.team === us ? (mentality === 2 ? 45 : mentality === 0 ? -55 : 0) : 0);
            let shootP = o.role === "ARQ" ? 0 : dGoal < shootRange ? clamp(0.3 + 0.62 * (1 - dGoal / (shootRange + 25)) + (atk - 72) / 130, 0.1, 0.85) : 0;
            if (o.team === us && o.role !== "ARQ") shootP *= mentality === 2 ? 1.25 : mentality === 0 ? 0.75 : 1;

            const inWideZone = Math.abs(o.y - FH / 2) > FH * 0.3 && advance(o) > 0.55 && o.role !== "ARQ";
            if (inWideZone && Math.random() < 0.5) {
              doCross(b.owner);
            } else {
              const passP = o.role === "ARQ" ? 1 : clamp(0.16 + (nearestD < 46 ? 0.34 : 0) + (o.role === "MED" ? 0.1 : 0) - (dGoal < 230 ? 0.08 : 0), 0.05, 0.85);
              const r = Math.random();
              if (r < shootP) doShot(b.owner);
              else if (r < shootP + passP) doPass(b.owner);
            }
          }

          /* quite */
          if (b.owner >= 0 && s.graceT <= 0) {
            let zi = -1, zd = 1e9;
            for (let i = 0; i < s.ents.length; i++) {
              const z = s.ents[i];
              if (z.team === o.team || z.sent || z.role === "ARQ" || z.cd > 0) continue;
              const d = dist(z, o); if (d < zd) { zd = d; zi = i; }
            }
            if (zi >= 0 && zd < 18) {
              const z = s.ents[zi]; z.cd = 1.15;
              const reg = o.p.stats?.regate ?? o.p.med;
              const fis = o.p.stats?.fisico ?? o.p.med;
              const defSkill = (z.p.stats?.defensa ?? z.p.med) + (z.role === "DEF" ? 7 : 0);
              const pWin = clamp(0.26 + (defSkill - reg) / 95 - (fis - 75) / 220, 0.1, 0.62);
              const roll = Math.random();
              if (roll < pWin) {
                takeBall(zi);
                sfx.tackle();
                popup(o.x, o.y - 24, "¡RECUPERÓ!", z.team === 0 ? "#b8ff2e" : "#ffc233");
                // contra: si recuperó profundo, pelotazo
                if (advance(z) < 0.32 && Math.random() < 0.5) doLong(zi);
              } else if (roll < pWin + 0.18) {
                const defT = z.team;
                if (defT === 0) s.stats.foulsH++; else s.stats.foulsA++;
                const clubId = defT === 0 ? pr.home.id : pr.away.id;
                if (!z.carded && Math.random() < 0.15) {
                  const red = Math.random() < 0.07; s.cards++; z.carded = true;
                  if (red) { z.sent = true; s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "card", text: `¡ROJA DIRECTA! ${lastName(z.p.name)} deja a su equipo con uno menos.` }); }
                  else s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "card", text: `Amarilla para ${lastName(z.p.name)} por el planchazo.` });
                  sfx.card(); s.shake = Math.max(s.shake, 5);
                } else s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "info", text: `Falta de ${lastName(z.p.name)} sobre ${lastName(o.p.name)}.` });
                force((t) => t + 1);
              } else { const push = o.team === 0 ? 1 : -1; z.x += push * 16; o.x += push * 7; }
            }
          }
        }
      }

      /* ---- pelota libre ---- */
      if (b.owner < 0) {
        b.x += b.vx * h; b.y += b.vy * h;
        const fr = s.shotTeam >= 0 ? Math.pow(0.8, h * 60 / 16) : Math.pow(0.55, h * 60 / 16);
        b.vx *= fr; b.vy *= fr;
        b.spin += Math.hypot(b.vx, b.vy) * h * 0.04;
        if (Math.hypot(b.vx, b.vy) > 250) s.trail.push({ x: b.x, y: b.y, t: 0 });
        if (b.y < 24) { b.y = 24; b.vy = Math.abs(b.vy) * 0.6; }
        if (b.y > FH - 24) { b.y = FH - 24; b.vy = -Math.abs(b.vy) * 0.6; }

        if (s.passTarget >= 0) {
          const t = s.ents[s.passTarget];
          if (t && !t.sent && dist(t, b) < 24) {
            const wasCross = s.crossBall;
            takeBall(s.passTarget);
            if (t.team === 0) s.stats.passesH++; else s.stats.passesA++;
            // pared: el receptor devuelve al que picó
            if (!wasCross && s.ents[s.passFrom] && Math.random() < 0.4 && nearestOppDist(t) > 40) {
              // pequeño delay: deja que el pase normal fluya; la pared se da vía runT del pasador
            }
            if (wasCross && t.role === "DEL") s.decT = 0.05; // el 9 define de primera
          } else {
            const fromTeam = s.ents[s.passTarget]?.team ?? 0;
            for (let i = 0; i < s.ents.length; i++) {
              const z = s.ents[i];
              if (z.team === fromTeam || z.sent || z.role === "ARQ") continue;
              if (dist(z, b) < 15 && Math.random() < 0.12 + ((z.p.stats?.defensa ?? z.p.med) / 900)) {
                takeBall(i);
                if (advance(z) < 0.32 && Math.random() < 0.4) doLong(i);
                break;
              }
            }
          }
          if (s.passTarget >= 0 && (b.x < 18 || b.x > FW - 18)) resetToGK(b.x < 18 ? 0 : 1);
          if (s.passTarget >= 0 && Math.hypot(b.vx, b.vy) < 60) { s.passTarget = -1; s.passFrom = -1; }
        }

        /* remate */
        if (s.shotTeam >= 0) {
          const team = s.shotTeam as 0 | 1;
          const gkTeam = (1 - team) as 0 | 1;
          const gk = s.ents.find((e) => e.team === gkTeam && e.role === "ARQ" && !e.sent);
          const planeX = team === 0 ? FW - 60 : 60;

          if (!s.shotTested) {
            for (const z of s.ents) {
              if (z.team === team || z.sent || z.role === "ARQ") continue;
              if ((team === 0 ? z.x > planeX - 30 : z.x < planeX + 30) && Math.abs(z.y - b.y) < 13 && Math.random() < 0.4) {
                b.vx = (team === 0 ? -1 : 1) * (140 + Math.random() * 120);
                b.vy = (Math.random() - 0.5) * 300;
                s.shotTeam = -1;
                const clubId = z.team === 0 ? pr.home.id : pr.away.id;
                s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡${lastName(z.p.name)} la sacó con el cuerpo! Bloqueo salvador.` });
                popup(z.x, z.y - 24, "¡BLOQUEO!", "#ff4257");
                burst(b.x, b.y, 12, ["#ffc233", "#f2ffe9"]);
                s.shake = Math.max(s.shake, 4); sfx.kick();
                force((t) => t + 1);
                break;
              }
            }
          }

          if (s.shotTeam >= 0 && !s.shotTested && ((team === 0 && b.x > planeX) || (team === 1 && b.x < planeX))) {
            s.shotTested = true;
            const dShot = s.shotD;
            const reach = clamp(19 + (gk ? gk.p.med - 70 : 0) * 0.42 - Math.max(0, 220 - dShot) * 0.06, 10, 28);
            if (gk && Math.abs(b.y - gk.y) < reach) {
              b.vx = (team === 0 ? -1 : 1) * (180 + Math.random() * 170);
              b.vy = (Math.random() - 0.5) * 360;
              s.shotTeam = -1; sfx.kick();
              const clubId = gkTeam === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡ATAJADÓN de ${lastName(gk.p.name)}! La sacó del ángulo.` });
              popup(gk.x, gk.y - 30, "¡ATAJADÓN!", "#41d6ff");
              burst(b.x, b.y, 14, ["#ffc233", "#f2ffe9"]);
              s.shake = Math.max(s.shake, 5);
              force((t) => t + 1);
            }
          }
          if (s.shotTeam >= 0 && ((team === 0 && b.x >= FW - 18) || (team === 1 && b.x <= 18))) {
            if (Math.abs(b.y - FH / 2) < MOUTH - 2) {
              goalScored(team, s.shotShooter);
            } else if (Math.abs(Math.abs(b.y - FH / 2) - MOUTH) < 8 && Math.random() < 0.5) {
              const clubId = team === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: "¡EN EL PALO! Todo el estadio con las manos en la cabeza." });
              popup(team === 0 ? FW - 14 : 14, b.y - 20, "¡PALO!", "#ff4257");
              b.vx = (team === 0 ? -1 : 1) * 220; b.vy = (Math.random() - 0.5) * 260;
              s.shotTeam = -1; sfx.post(); s.shake = Math.max(s.shake, 7);
              force((t) => t + 1);
            } else {
              const shooter = s.ents[s.shotShooter];
              const clubId = team === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `${lastName(shooter?.p.name ?? "El 9")} la mandó a la tribuna.` });
              force((t) => t + 1);
              resetToGK(gkTeam);
            }
          }
        }

        /* suelta */
        if (b.owner < 0 && s.shotTeam < 0 && s.passTarget < 0) {
          let best = -1, bd = 1e9;
          for (let i = 0; i < s.ents.length; i++) {
            const e = s.ents[i]; if (e.sent) continue;
            const d = dist(e, b); if (d < bd) { bd = d; best = i; }
          }
          const slow = Math.hypot(b.vx, b.vy) < 70;
          if (best >= 0 && s.ents[best].cd <= 0 && ((bd < 14) || (slow && bd < 30))) {
            takeBall(best); s.ents[best].cd = 0.25;
          }
          if (b.x < 14 || b.x > FW - 14) resetToGK(b.x < 14 ? 0 : 1);
        }

        // anti-traba
        s.looseT = b.owner >= 0 ? 0 : s.looseT + h;
        const inCorner = (b.x < 80 || b.x > FW - 80) && (b.y < 90 || b.y > FH - 90);
        if (b.owner < 0 && (s.looseT > 2.4 || (inCorner && s.looseT > 1.2))) {
          let best = -1, bd = 1e9;
          for (let i = 0; i < s.ents.length; i++) {
            const e = s.ents[i]; if (e.sent || e.role === "ARQ") continue;
            const d = dist(e, b); if (d < bd) { bd = d; best = i; }
          }
          if (best < 0) {
            for (let i = 0; i < s.ents.length; i++) {
              const e = s.ents[i]; if (e.sent) continue;
              const d = dist(e, b); if (d < bd) { bd = d; best = i; }
            }
          }
          if (best >= 0 && bd < 380) { s.passTarget = -1; s.passFrom = -1; s.shotTeam = -1; b.x = s.ents[best].x; b.y = s.ents[best].y; takeBall(best); }
          s.looseT = 0;
        }
      }
    };

    /* ============ DIBUJO ============ */
    const cam = { x: FW / 2, y: FH / 2, z: 1 };
    const draw = () => {
      const s = st.current; const pr = propsRef.current;
      // cámara
      const nearGoal = 1 - clamp(Math.min(s.ball.x, FW - s.ball.x) / (FW * 0.3), 0, 1);
      const zT = 1 + 0.09 * nearGoal;
      cam.z += (zT - cam.z) * 0.05;
      cam.x += (s.ball.x - cam.x) * 0.06;
      cam.y += (clamp(s.ball.y, FH * 0.3, FH * 0.7) - cam.y) * 0.05;
      const viewHalfW = W / 2 / cam.z, viewHalfH = H / 2 / cam.z;
      cam.x = viewHalfW - OX > FW + 60 - viewHalfW + OX ? FW / 2 : clamp(cam.x, viewHalfW - OX - 60, FW + 60 - viewHalfW + OX);
      cam.y = FH / 2;

      ctx.clearRect(0, 0, W, H);
      ctx.save();
      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      ctx.translate(W / 2 + shakeX, H / 2 + shakeY);
      ctx.scale(cam.z, cam.z);
      ctx.translate(-cam.x - OX, -cam.y - OY);

      // tribuna
      ctx.drawImage(standCv, -150, -110);

      // césped
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? "#0f8a44" : "#0d7c3d";
        ctx.fillRect((FW / 12) * i, 0, FW / 12 + 1, FH);
      }
      // brillo de reflectores
      const lg = ctx.createRadialGradient(FW / 2, FH / 2, 60, FW / 2, FH / 2, FW * 0.6);
      lg.addColorStop(0, "rgba(255,255,240,0.07)");
      lg.addColorStop(1, "rgba(0,0,0,0.16)");
      ctx.fillStyle = lg;
      ctx.fillRect(0, 0, FW, FH);

      // líneas
      ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      ctx.strokeRect(14, 14, FW - 28, FH - 28);
      ctx.beginPath(); ctx.moveTo(FW / 2, 14); ctx.lineTo(FW / 2, FH - 14); ctx.stroke();
      ctx.beginPath(); ctx.arc(FW / 2, FH / 2, 60, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(242,255,233,0.85)";
      ctx.beginPath(); ctx.arc(FW / 2, FH / 2, 4, 0, Math.PI * 2); ctx.fill();
      for (const side of [0, 1]) {
        const x = side === 0 ? 14 : FW - 14;
        const dir = side === 0 ? 1 : -1;
        ctx.strokeRect(Math.min(x, x + dir * 110), FH / 2 - 108, 110, 216);
        ctx.strokeRect(Math.min(x, x + dir * 44), FH / 2 - 50, 44, 100);
        // red del arco
        const netX = side === 0 ? 0 : FW - 14;
        ctx.fillStyle = "rgba(242,255,233,0.1)";
        ctx.fillRect(netX, FH / 2 - MOUTH, 14, MOUTH * 2);
        ctx.strokeStyle = "rgba(242,255,233,0.35)";
        ctx.lineWidth = 1;
        for (let k = 0; k <= 4; k++) {
          ctx.beginPath();
          ctx.moveTo(netX, FH / 2 - MOUTH + (MOUTH * 2 * k) / 4);
          ctx.lineTo(netX + 14, FH / 2 - MOUTH + (MOUTH * 2 * k) / 4);
          ctx.stroke();
        }
        ctx.beginPath(); ctx.moveTo(netX + 7, FH / 2 - MOUTH); ctx.lineTo(netX + 7, FH / 2 + MOUTH); ctx.stroke();
        // postes dorados
        ctx.strokeStyle = "rgba(255,194,51,0.95)"; ctx.lineWidth = 3.5;
        ctx.beginPath();
        ctx.moveTo(side === 0 ? 14 : FW - 14, FH / 2 - MOUTH);
        ctx.lineTo(side === 0 ? 14 : FW - 14, FH / 2 + MOUTH);
        ctx.stroke();
        ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      }

      // estela de la pelota
      for (const tp of s.trail) {
        const a = 1 - tp.t / 0.28;
        ctx.globalAlpha = a * 0.35;
        ctx.fillStyle = "#f2ffe9";
        ctx.beginPath();
        ctx.arc(tp.x, tp.y, 4.5 * a + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;

      // jugadores
      const ownerEnt = s.ball.owner >= 0 ? s.ents[s.ball.owner] : null;
      for (const e of s.ents) {
        if (e.sent) continue;
        const isGk = e.role === "ARQ";
        const c1 = isGk ? "#ffc233" : e.team === 0 ? pr.home.c1 : pr.away.c1;
        const c2 = e.team === 0 ? pr.home.c2 : pr.away.c2;
        const bob = Math.hypot(e.vx, e.vy) > 30 ? Math.sin(now / 90 + e.num) * 1.4 : 0;
        // sombra
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 9, 9, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(3,13,7,0.35)"; ctx.fill();
        // anillo del dueño
        if (ownerEnt === e) {
          ctx.beginPath(); ctx.arc(e.x, e.y + bob, 14.5, 0, Math.PI * 2);
          ctx.strokeStyle = "#b8ff2e"; ctx.lineWidth = 2.5; ctx.stroke();
        }
        // cuerpo
        ctx.beginPath(); ctx.arc(e.x, e.y + bob, isGk ? 10 : 8.5, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(3,13,7,0.8)"; ctx.stroke();
        if (!isGk) { ctx.beginPath(); ctx.arc(e.x, e.y + bob, 4, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill(); }
        // muesca de orientación
        ctx.beginPath();
        ctx.moveTo(e.x + Math.cos(e.face) * (isGk ? 10 : 8.5), e.y + bob + Math.sin(e.face) * (isGk ? 10 : 8.5));
        ctx.lineTo(e.x + Math.cos(e.face + 2.6) * 5, e.y + bob + Math.sin(e.face + 2.6) * 5);
        ctx.lineTo(e.x + Math.cos(e.face - 2.6) * 5, e.y + bob + Math.sin(e.face - 2.6) * 5);
        ctx.closePath();
        ctx.fillStyle = "rgba(255,255,255,0.75)";
        ctx.fill();
        // número
        ctx.font = "800 9px Barlow, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = lum(c1) > 0.55 ? "#06170a" : "#f2ffe9";
        ctx.fillText(String(e.num), e.x, e.y + bob + 0.5);
      }

      // cartel del dueño
      if (ownerEnt && !ownerEnt.sent) {
        const label = `${lastName(ownerEnt.p.name)} · ${ownerEnt.num}`;
        ctx.font = "700 12px Barlow, sans-serif";
        const tw = ctx.measureText(label).width;
        const lx = clamp(ownerEnt.x - tw / 2 - 7, 6, FW - tw - 20);
        const ly = ownerEnt.y - 36;
        ctx.fillStyle = "rgba(3,13,7,0.82)";
        ctx.fillRect(lx, ly, tw + 14, 19);
        ctx.fillStyle = "#b8ff2e"; ctx.textAlign = "left";
        ctx.fillText(label, lx + 7, ly + 10);
      }

      // pelota con giro
      ctx.beginPath(); ctx.ellipse(s.ball.x, s.ball.y + 8, 6, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(3,13,7,0.4)"; ctx.fill();
      ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f2ffe9"; ctx.fill();
      ctx.strokeStyle = "#06170a"; ctx.lineWidth = 1.5; ctx.stroke();
      for (let k = 0; k < 3; k++) {
        const a = s.ball.spin + (k * Math.PI * 2) / 3;
        ctx.beginPath();
        ctx.arc(s.ball.x + Math.cos(a) * 3.2, s.ball.y + Math.sin(a) * 3.2, 1.5, 0, Math.PI * 2);
        ctx.fillStyle = "#06170a";
        ctx.fill();
      }

      // partículas
      for (const pt of s.particles) {
        ctx.globalAlpha = 1 - pt.life / pt.max;
        ctx.fillStyle = pt.color;
        ctx.fillRect(pt.x, pt.y, pt.size, pt.size * 0.6);
      }
      ctx.globalAlpha = 1;

      // textos flotantes
      for (const pp of s.popups) {
        const a = 1 - pp.t;
        ctx.globalAlpha = Math.max(0, a);
        ctx.font = "800 22px 'Bebas Neue', sans-serif";
        ctx.textAlign = "center";
        ctx.lineWidth = 4;
        ctx.strokeStyle = "rgba(3,13,7,0.85)";
        ctx.strokeText(pp.text, pp.x, pp.y - pp.t * 30);
        ctx.fillStyle = pp.color;
        ctx.fillText(pp.text, pp.x, pp.y - pp.t * 30);
      }
      ctx.globalAlpha = 1;

      ctx.restore();

      // flash de gol (fuera de la cámara)
      if (s.flash > 0) {
        ctx.fillStyle = `rgba(255,194,51,${s.flash * 0.28})`;
        ctx.fillRect(0, 0, W, H);
      }
      // viñeta
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.7);
      vg.addColorStop(0, "rgba(3,13,7,0)");
      vg.addColorStop(1, "rgba(3,13,7,0.5)");
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, W, H);
    };

    /* ============ LOOP ============ */
    let raf = 0;
    let lastT = performance.now();
    let finishTimer = 0;
    let finished = false;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      const dtReal = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;
      const s = st.current; const pr = propsRef.current;
      if (!pausedRef.current) {
        for (let i = 0; i < speedRef.current; i++) stepPhysics(dtReal, now);
        if (s.banner) { s.banner.t -= dtReal; if (s.banner.t <= 0) s.banner = null; }
        s.particles = s.particles.filter((pt) => {
          pt.life += dtReal; pt.x += pt.vx * dtReal; pt.y += pt.vy * dtReal; pt.vy += 520 * dtReal;
          return pt.life < pt.max;
        });
        s.trail = s.trail.filter((tp) => { tp.t += dtReal; return tp.t < 0.28; });
        s.popups = s.popups.filter((pp) => { pp.t += dtReal * 0.9; return pp.t < 1; });
        if (s.shake > 0) s.shake = Math.max(0, s.shake - dtReal * 26);
        if (s.flash > 0) s.flash = Math.max(0, s.flash - dtReal * 1.4);
        if (s.done && !finished) {
          finishTimer += dtReal;
          if (finishTimer > 1.6) {
            finished = true;
            cancelAnimationFrame(raf);
            const tot = s.stats.possH + s.stats.possA || 1;
            pr.onFinish({
              gh: s.scoreH, ga: s.scoreA, events: s.events, scorers: s.scorers, cards: s.cards,
              stats: {
                possH: Math.round((s.stats.possH / tot) * 100), possA: Math.round((s.stats.possA / tot) * 100),
                shotsH: s.stats.shotsH, shotsA: s.stats.shotsA, onH: s.stats.onH, onA: s.stats.onA,
                passesH: s.stats.passesH, passesA: s.stats.passesA, foulsH: s.stats.foulsH, foulsA: s.stats.foulsA,
              },
            });
            return;
          }
        }
      }
      draw();
      setUi((u) =>
        u.min !== Math.floor(s.min) || u.scoreH !== s.scoreH || u.scoreA !== s.scoreA || u.speed !== speedRef.current
          ? { min: Math.floor(s.min), scoreH: s.scoreH, scoreA: s.scoreA, momentum: s.momentum, speed: speedRef.current }
          : u
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setSpeed = (v: number) => { speedRef.current = v; sfx.tab(); };
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); sfx.click(); };

  const openSub = () => {
    autoPausedRef.current = !pausedRef.current;
    pausedRef.current = true; setPaused(true);
    setSubOpen(true); sfx.click();
  };
  const closeSub = () => {
    if (autoPausedRef.current) { pausedRef.current = false; setPaused(false); }
    setSubOpen(false); setSubOut(-1); setSubIn(-1);
  };

  const s = st.current;
  const lastEvents = s.events.slice(0, 7);
  const userXiNow = props.getUserXi();
  const stt = s.stats;
  const possTot = stt.possH + stt.possA || 1;
  const possH = Math.round((stt.possH / possTot) * 100);

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-center gap-0 mb-3 select-none">
        <div className="scoreled px-5 py-1.5 text-2xl flex items-center" style={{ borderRight: "none" }}>
          <span className="mr-2 inline-block w-3 h-3" style={{ background: props.home.c1 === "#f2f2f2" || props.home.c1 === "#f4f4f4" ? "#fff" : props.home.c1 }} />
          {props.home.short}
        </div>
        <div className="scoreled px-6 py-1.5 text-4xl">{ui.scoreH}&nbsp;-&nbsp;{ui.scoreA}</div>
        <div className="scoreled px-5 py-1.5 text-2xl flex items-center" style={{ borderLeft: "none" }}>
          {props.away.short}
          <span className="ml-2 inline-block w-3 h-3" style={{ background: props.away.c1 === "#f2f2f2" || props.away.c1 === "#f4f4f4" ? "#fff" : props.away.c1 }} />
        </div>
        <div className="scoreled px-4 py-1.5 text-2xl flex items-center text-cielo" style={{ borderLeft: "none" }}>{ui.min}'</div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1 relative">
          <div className={`relative ${s.shake > 0.5 ? "animate-shake" : ""}`}>
            <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block border border-lima/25" style={{ background: "#04100a" }} />
            {s.banner && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="font-display text-6xl md:text-8xl tracking-widest text-chalk animate-popin"
                  style={{ textShadow: "0 0 30px rgba(184,255,46,0.9), 0 6px 0 rgba(3,13,7,0.8)" }}>
                  {s.banner.text}
                </div>
              </div>
            )}
            {paused && (
              <div className="absolute inset-0 bg-night-950/80 flex flex-col items-center justify-center gap-3 z-10">
                <div className="font-display text-5xl text-gold tracking-widest">PAUSA</div>
                <div className="text-chalk/70 text-sm">ESC o P para seguir — 1/2/4 velocidad</div>
                <button className="btn btn-lima px-8 py-2 text-xl" onClick={togglePause}><span>SEGUIR</span></button>
              </div>
            )}
          </div>

          <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2 text-center">
            {[
              ["Posesión", `${possH}%`, `${100 - possH}%`],
              ["Tiros", stt.shotsH, stt.shotsA],
              ["Al arco", stt.onH, stt.onA],
              ["Pases", stt.passesH, stt.passesA],
              ["Faltas", stt.foulsH, stt.foulsA],
            ].map(([label, hv, av]) => (
              <div key={label as string} className="panel-soft px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-widest text-chalk/50">{label}</div>
                <div className="font-display text-xl"><span className="text-lima">{hv}</span><span className="text-chalk/40 text-sm"> / {av}</span></div>
              </div>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost px-4 py-1.5" onClick={togglePause}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
            {[1, 2, 4].map((v) => (
              <button key={v} className={`btn px-4 py-1.5 ${ui.speed === v ? "btn-lima" : "btn-ghost"}`} onClick={() => setSpeed(v)}><span>x{v}</span></button>
            ))}
            <button className="btn btn-gold px-4 py-1.5" onClick={() => setSpeed(12)} title="Simular lo que resta"><SkipForward size={16} /><span>SIMULAR</span></button>
            <div className="flex-1 min-w-[140px]">
              <div className="text-[10px] uppercase tracking-widest text-chalk/50 mb-1">Iniciativa</div>
              <div className="h-2.5 relative" style={{ background: "rgba(3,13,7,0.8)", border: "1px solid rgba(242,255,233,0.15)" }}>
                <div className="absolute top-0 bottom-0 transition-all duration-500" style={{
                  left: ui.momentum >= 0 ? "50%" : `${50 + ui.momentum * 50}%`,
                  width: `${Math.abs(ui.momentum) * 50}%`,
                  background: ui.momentum >= 0 ? (props.home.c1 === "#f2f2f2" ? "#e8e8ee" : props.home.c1) : (props.away.c1 === "#f2f2f2" ? "#e8e8ee" : props.away.c1),
                }} />
                <div className="absolute left-1/2 top-0 bottom-0 w-px bg-chalk/40" />
              </div>
            </div>
          </div>
        </div>

        <div className="w-full lg:w-72 flex flex-col gap-3">
          {props.interactive && (
            <div className="panel-soft p-3">
              <div className="font-display text-lg text-lima tracking-wider mb-2">TU PIZARRA</div>
              <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Mentalidad</div>
              <div className="seg mb-2">
                {["DEFENSIVA", "NEUTRA", "OFENSIVA"].map((m, i) => (
                  <button key={m} className={props.mentality === i ? "on" : ""} onClick={() => { props.onTactics({ mentality: i }); sfx.tab(); }}>{m}</button>
                ))}
              </div>
              <div className="text-[11px] uppercase tracking-widest text-chalk/50 mb-1">Presión</div>
              <div className="seg mb-2">
                {["BAJA", "MEDIA", "ALTA"].map((m, i) => (
                  <button key={m} className={props.pressing === i ? "on" : ""} onClick={() => { props.onTactics({ pressing: i }); sfx.tab(); }}>{m}</button>
                ))}
              </div>
              {!subOpen ? (
                <button className="btn btn-ghost w-full py-1.5 mt-1" onClick={openSub}><span>HACER CAMBIO</span></button>
              ) : (
                <div className="mt-1 space-y-2">
                  <div className="text-[11px] uppercase tracking-widest text-chalk/50">Sale</div>
                  <select className="w-full" value={subOut} onChange={(e) => setSubOut(Number(e.target.value))}>
                    <option value={-1}>Elegir…</option>
                    {userXiNow.map((p) => <option key={p.id} value={p.id}>{p.pos} — {p.name}</option>)}
                  </select>
                  <div className="text-[11px] uppercase tracking-widest text-chalk/50">Entra (banco)</div>
                  <select className="w-full" value={subIn} onChange={(e) => setSubIn(Number(e.target.value))}>
                    <option value={-1}>Elegir…</option>
                    {props.getSquad().filter((p) => !userXiNow.some((x) => x.id === p.id)).map((p) => <option key={p.id} value={p.id}>{p.pos} — {p.name}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button className="btn btn-ghost flex-1 py-1 text-sm" onClick={closeSub}><span>CANCELAR</span></button>
                    <button className="btn btn-lima flex-1 py-1 text-sm" disabled={subOut < 0 || subIn < 0 || subOut === subIn}
                      onClick={() => { props.onSub(subOut, subIn); sfx.tab(); closeSub(); }}><span>APLICAR</span></button>
                  </div>
                </div>
              )}
            </div>
          )}
          <div className="panel-soft p-3 flex-1 min-h-[220px]">
            <div className="font-display text-lg text-gold tracking-wider mb-2">MINUTO A MINUTO</div>
            <div className="space-y-1.5">
              {lastEvents.map((e, i) => (
                <div key={`${e.min}-${i}-${e.text.slice(0, 8)}`} className={`text-[13px] leading-snug flex gap-2 ${i === 0 ? "animate-risein" : ""}`}>
                  <span className="font-display text-base leading-none mt-0.5 shrink-0 w-7" style={{
                    color: e.kind === "goal" ? "#b8ff2e" : e.kind === "card" ? "#ff4257" : e.kind === "chance" ? "#41d6ff" : "rgba(242,255,233,0.5)",
                  }}>{e.min}'</span>
                  <span className={e.kind === "goal" ? "text-chalk font-bold" : "text-chalk/75"}>{e.text}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
