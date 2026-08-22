import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward } from "lucide-react";
import type { Club, MatchEvent, MatchResult, PlayerP, Pos, Scorer, Strength } from "../game/core";
import { sfx } from "../game/audio";

const W = 960, H = 540, MOUTH = 42;

interface Props {
  home: Club; away: Club; userSide: 0 | 1;
  getHomeXi: () => PlayerP[]; getAwayXi: () => PlayerP[];
  getUserXi: () => PlayerP[]; getSquad: () => PlayerP[];
  getStrengths: () => { h: Strength; a: Strength };
  interactive: boolean; mentality: number; pressing: number;
  onTactics: (patch: { mentality?: number; pressing?: number }) => void;
  onSub: (outId: number, inId: number) => void;
  onFinish: (res: MatchResult) => void;
}

interface Ent { x: number; y: number; hx: number; hy: number; team: 0 | 1; role: Pos; num: number; p: PlayerP; cd: number; sent: boolean; carded: boolean }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }
interface RawStats { possH: number; possA: number; shotsH: number; shotsA: number; onH: number; onA: number; passesH: number; passesA: number; foulsH: number; foulsA: number }

interface SimState {
  ents: Ent[];
  ball: { x: number; y: number; vx: number; vy: number; owner: number };
  passTarget: number;
  shotTeam: number; shotTested: boolean; shotShooter: number; shotD: number;
  min: number; acc: number; scoreH: number; scoreA: number;
  events: MatchEvent[]; scorers: Scorer[]; cards: number; stats: RawStats;
  particles: Particle[]; shake: number; banner: { text: string; t: number } | null;
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
    ents: [], ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, owner: -1 }, passTarget: -1,
    shotTeam: -1, shotTested: false, shotShooter: -1, shotD: 300,
    min: 0, acc: 0, scoreH: 0, scoreA: 0,
    events: [{ min: 0, text: "¡Arranca el partido! Rueda la pelota.", kind: "info", club: -1 }],
    scorers: [], cards: 0,
    stats: { possH: 0, possA: 0, shotsH: 0, shotsA: 0, onH: 0, onA: 0, passesH: 0, passesA: 0, foulsH: 0, foulsA: 0 },
    particles: [], shake: 0, banner: { text: "¡COMIENZA!", t: 1.4 },
    momentum: 0, done: false, htShown: false, pauseK: 0.4, kickTeam: 0,
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
        pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); sfx.click();
      }
      if (e.key === "1") speedRef.current = 1;
      if (e.key === "2") speedRef.current = 2;
      if (e.key === "4") speedRef.current = 4;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const pr0 = propsRef.current;
    const us = pr0.userSide;

    const buildEnts = () => {
      const out: Ent[] = [];
      const mk = (xi: PlayerP[], team: 0 | 1) => {
        const order: Pos[] = ["ARQ", "DEF", "MED", "DEL"];
        const rowsX: Record<Pos, number> = { ARQ: 52, DEF: 190, MED: 355, DEL: 505 };
        let n = 0;
        order.forEach((role) => {
          const ps = xi.filter((p) => p.pos === role).sort((a, b) => b.med - a.med);
          ps.forEach((p, i) => {
            n++;
            const y = H * ((i + 1) / (ps.length + 1));
            out.push({ x: team === 0 ? rowsX[role] : W - rowsX[role], y, hx: rowsX[role], hy: y, team, role, num: n, p, cd: 0, sent: false, carded: false });
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

    const burst = (x: number, y: number, n: number, colors: string[]) => {
      const s = st.current;
      for (let i = 0; i < n; i++) {
        s.particles.push({ x, y, vx: (Math.random() - 0.5) * 460, vy: -Math.random() * 400 - 60, life: 0, max: 1 + Math.random(), color: colors[i % colors.length], size: 3 + Math.random() * 5 });
      }
    };
    const takeBall = (i: number) => {
      const s = st.current;
      s.ball.owner = i; s.passTarget = -1;
      s.shotTeam = -1; s.ball.vx = 0; s.ball.vy = 0;
      s.graceT = 0.45;
    };
    const resetToGK = (team: 0 | 1) => {
      const s = st.current;
      const gk = s.ents.find((e) => e.team === team && e.role === "ARQ" && !e.sent);
      if (gk) {
        s.ball.x = gk.x + (team === 0 ? 16 : -16); s.ball.y = gk.y;
        s.ball.vx = 0; s.ball.vy = 0; s.ball.owner = s.ents.indexOf(gk);
      }
      s.passTarget = -1; s.shotTeam = -1;
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
      const gx = team === 0 ? W - 24 : 24;
      const col = team === 0 ? pr.home.c1 : pr.away.c1;
      burst(gx, H / 2, 85, [col === "#f2f2f2" || col === "#f4f4f4" ? "#ffd400" : col, "#ffc233", "#f2ffe9", "#b8ff2e"]);
      s.shake = 13; s.banner = { text: "¡GOOOL!", t: 1.5 };
      sfx.goal(); force((t) => t + 1);
      s.passTarget = -1; s.shotTeam = -1;
      s.pauseK = 1.3; s.kickTeam = (1 - team) as 0 | 1;
      s.ball.x = W / 2; s.ball.y = H / 2; s.ball.vx = 0; s.ball.vy = 0; s.ball.owner = -1;
    };
    const nearestOppDist = (e: Ent) => {
      const s = st.current; let bd = 1e9;
      for (const o of s.ents) { if (o.team === e.team || o.sent || o.role === "ARQ") continue; bd = Math.min(bd, dist(o, e)); }
      return bd;
    };
    const doShot = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const gx = o.team === 0 ? W - 14 : 14;
      const acc2 = o.p.stats?.tiro ?? o.p.med;
      const dGoal = Math.hypot(gx - o.x, H / 2 - o.y);
      const spread = clamp(160 - acc2 * 0.95 - (260 - Math.min(260, dGoal)) * 0.28, 16, 112);
      const ty = H / 2 + (Math.random() * 2 - 1) * spread;
      const onT = Math.abs(ty - H / 2) <= MOUTH - 2;
      const dx = gx - s.ball.x, dy = ty - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      const pw = 500 + acc2 * 2 + Math.random() * 60;
      s.ball.vx = (dx / dl) * pw; s.ball.vy = (dy / dl) * pw;
      s.ball.owner = -1; s.passTarget = -1;
      s.shotTeam = o.team; s.shotTested = false; s.shotShooter = oi; s.shotD = dGoal;
      if (o.team === 0) s.stats.shotsH++; else s.stats.shotsA++;
      if (onT) { if (o.team === 0) s.stats.onH++; else s.stats.onA++; }
      sfx.kick();
    };
    const doPass = (oi: number) => {
      const s = st.current; const o = s.ents[oi];
      const dir = o.team === 0 ? 1 : -1;
      let mates = s.ents.map((e, i) => ({ e, i })).filter((z) => z.e.team === o.team && z.i !== oi && !z.e.sent && z.e.role !== "ARQ");
      if (!mates.length) return;
      if (o.role === "ARQ") {
        const out = mates.filter((z) => z.e.x * dir > 210);
        if (out.length) mates = out;
      }
      const scored = mates.map((z) => ({ z, score: z.e.x * dir * 0.6 + nearestOppDist(z.e) * 1.2 - dist(o, z.e) * 0.35 }))
        .sort((a, b) => b.score - a.score);
      let pick = scored[0];
      if (Math.random() < 0.3 && scored.length > 2) {
        const widest = [...scored].sort((a, b) => Math.abs(b.z.e.y - H / 2) - Math.abs(a.z.e.y - H / 2))[0];
        if (Math.abs(widest.z.e.y - H / 2) > 130) pick = widest;
      } else if (Math.random() < 0.35) {
        pick = scored[Math.floor(Math.random() * Math.min(3, scored.length))];
      }
      const t = pick.z.e;
      const dx = t.x + dir * 36 - s.ball.x, dy = t.y - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      const pw = clamp(dl * 2.3, 360, 620);
      s.ball.vx = (dx / dl) * pw; s.ball.vy = (dy / dl) * pw;
      s.ball.owner = -1; s.passTarget = pick.z.i; s.shotTeam = -1;
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
          const tx = e.team === 0 ? e.hx : W - e.hx;
          const dx = tx - e.x, dy = e.hy - e.y;
          const dd = Math.hypot(dx, dy);
          if (dd > 3) { e.x += (dx / dd) * Math.min(150 * h, dd); e.y += (dy / dd) * Math.min(150 * h, dd); }
        });
        b.x = W / 2; b.y = H / 2; b.vx = 0; b.vy = 0;
        if (s.pauseK <= 0) assignKickoff();
        return;
      }

      const str = pr.getStrengths();
      const mentality = pr.mentality;
      if (b.owner >= 0) {
        const t = s.ents[b.owner].team;
        if (t === 0) s.stats.possH += h; else s.stats.possA += h;
        s.momentum += ((t === 0 ? 0.55 : -0.55) - s.momentum) * h * 0.9;
      } else s.momentum *= 1 - h * 0.4;
      s.momentum = clamp(s.momentum, -1, 1);

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

      const ownerTeam = b.owner >= 0 ? s.ents[b.owner].team : -1;
      s.ents.forEach((e, i) => {
        if (e.sent) { e.x = -60; e.y = -60; return; }
        e.cd = Math.max(0, e.cd - h);
        const spd = 0.82 + (e.p.stats?.ritmo ?? e.p.med) / 230;
        const dir = e.team === 0 ? 1 : -1;
        let tx: number, ty: number, sp: number;
        if (e.role === "ARQ") {
          const gx = e.team === 0 ? 44 : W - 44;
          tx = gx; ty = clamp(b.y, H / 2 - 85, H / 2 + 85);
          sp = 150 * (s.shotTeam >= 0 && s.shotTeam !== e.team ? 2 : 1);
          if (b.owner < 0 && dist(e, b) < 27 && Math.abs(b.x - gx) < 115) takeBall(i);
        } else if (pressers.has(i) && ownerTeam !== e.team) {
          tx = b.x; ty = b.y;
          sp = 112 * spd * (e.team === us ? 1 + pr.pressing * 0.1 : 1.05);
        } else if (b.owner === i) {
          tx = e.team === 0 ? W - 24 : 24;
          ty = H / 2 + Math.sin(now / 500 + i * 1.7) * 46;
          let nearest: Ent | null = null, nd = 1e9;
          for (const o of s.ents) if (o.team !== e.team && !o.sent && o.role !== "ARQ") { const d = dist(o, e); if (d < nd) { nd = d; nearest = o; } }
          if (nearest && nd < 60) ty = e.y + (e.y < nearest.y ? -100 : 100);
          ty = clamp(ty, 30, H - 30);
          sp = 118 * spd * (e.team === us && mentality === 2 ? 1.08 : 1);
        } else if (ownerTeam === e.team) {
          const lead = e.role === "DEL" ? 110 : e.role === "MED" ? 40 : -90;
          tx = e.hx + (b.x - W / 2) * (e.role === "DEL" ? 0.55 : e.role === "MED" ? 0.4 : 0.28) + dir * lead * 0.4;
          tx = e.team === 0 ? tx : W - (e.hx + (W / 2 - b.x) * (e.role === "DEL" ? 0.55 : e.role === "MED" ? 0.4 : 0.28) + (-dir) * lead * 0.4);
          const wide = Math.abs(e.hy - H / 2) > 120 ? (e.hy < H / 2 ? -46 : 46) : 0;
          ty = e.hy + (b.y - H / 2) * 0.3 + wide;
          tx = clamp(tx, 24, W - 24); ty = clamp(ty, 26, H - 26);
          sp = (e.role === "DEL" ? 108 : 96) * spd;
        } else if (ownerTeam >= 0) {
          const back = e.role === "DEF" ? 0.75 : e.role === "MED" ? 0.5 : 0.2;
          tx = e.team === 0 ? clamp(b.x - 140 * back - 40, 60, W - 60) : clamp(b.x + 140 * back + 40, 60, W - 60);
          ty = clamp(e.hy + (b.y - H / 2) * 0.34, 26, H - 26);
          sp = 96 * spd;
        } else { tx = e.team === 0 ? e.hx : W - e.hx; ty = e.hy; sp = 90 * spd; }
        const dx = tx - e.x, dy = ty - e.y;
        const dd = Math.hypot(dx, dy);
        if (dd > 2) { const m = Math.min(sp * h, dd); e.x += (dx / dd) * m; e.y += (dy / dd) * m; }
      });

      if (b.owner >= 0) {
        const o = s.ents[b.owner];
        if (!o.sent) {
          b.x = o.x + (o.team === 0 ? 13 : -13); b.y = o.y + 5; b.vx = 0; b.vy = 0;
          s.decT -= h;
          if (s.decT <= 0) {
            s.decT = 0.16 + Math.random() * 0.16;
            const gx = o.team === 0 ? W - 24 : 24;
            const dGoal = Math.hypot(gx - o.x, H / 2 - o.y);
            const atk = o.team === 0 ? str.h.atk : str.a.atk;
            let nearestD = 1e9;
            for (const z of s.ents) if (z.team !== o.team && !z.sent && z.role !== "ARQ") nearestD = Math.min(nearestD, dist(z, o));
            const shootRange = 250 + (o.team === us ? (mentality === 2 ? 45 : mentality === 0 ? -55 : 0) : 0);
            let shootP = o.role === "ARQ" ? 0 : dGoal < shootRange ? clamp(0.3 + 0.62 * (1 - dGoal / (shootRange + 25)) + (atk - 72) / 130, 0.1, 0.85) : 0;
            if (o.team === us && o.role !== "ARQ") shootP *= mentality === 2 ? 1.25 : mentality === 0 ? 0.75 : 1;
            const passP = o.role === "ARQ" ? 1 : clamp(0.16 + (nearestD < 46 ? 0.34 : 0) + (o.role === "MED" ? 0.1 : 0) - (dGoal < 240 ? 0.08 : 0), 0.05, 0.85);
            const r = Math.random();
            if (r < shootP) doShot(b.owner);
            else if (r < shootP + passP) doPass(b.owner);
          }
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
              if (roll < pWin) { takeBall(zi); sfx.kick(); }
              else if (roll < pWin + 0.18) {
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

      if (b.owner < 0) {
        b.x += b.vx * h; b.y += b.vy * h;
        const fr = s.shotTeam >= 0 ? Math.pow(0.8, h * 60 / 16) : Math.pow(0.55, h * 60 / 16);
        b.vx *= fr; b.vy *= fr;
        if (b.y < 24) { b.y = 24; b.vy = Math.abs(b.vy) * 0.6; }
        if (b.y > H - 24) { b.y = H - 24; b.vy = -Math.abs(b.vy) * 0.6; }

        if (s.passTarget >= 0) {
          const t = s.ents[s.passTarget];
          if (t && !t.sent && dist(t, b) < 24) {
            takeBall(s.passTarget);
            if (t.team === 0) s.stats.passesH++; else s.stats.passesA++;
          } else {
            const fromTeam = s.ents[s.passTarget]?.team ?? 0;
            for (let i = 0; i < s.ents.length; i++) {
              const z = s.ents[i];
              if (z.team === fromTeam || z.sent || z.role === "ARQ") continue;
              if (dist(z, b) < 15 && Math.random() < 0.12 + ((z.p.stats?.defensa ?? z.p.med) / 900)) { takeBall(i); break; }
            }
          }
          if (s.passTarget >= 0 && (b.x < 18 || b.x > W - 18)) resetToGK(b.x < 18 ? 0 : 1);
          if (s.passTarget >= 0 && Math.hypot(b.vx, b.vy) < 60) s.passTarget = -1;
        }

        if (s.shotTeam >= 0) {
          const team = s.shotTeam as 0 | 1;
          const gkTeam = (1 - team) as 0 | 1;
          const gk = s.ents.find((e) => e.team === gkTeam && e.role === "ARQ" && !e.sent);
          const planeX = team === 0 ? W - 62 : 62;
          if (!s.shotTested) {
            for (const z of s.ents) {
              if (z.team === team || z.sent || z.role === "ARQ") continue;
              if ((team === 0 ? z.x > planeX - 30 : z.x < planeX + 30) && Math.abs(z.y - b.y) < 13 && Math.random() < 0.35) {
                b.vx = (team === 0 ? -1 : 1) * (140 + Math.random() * 120);
                b.vy = (Math.random() - 0.5) * 300;
                s.shotTeam = -1;
                const clubId = z.team === 0 ? pr.home.id : pr.away.id;
                s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡${lastName(z.p.name)} la sacó con el cuerpo! Bloqueo salvador.` });
                burst(b.x, b.y, 12, ["#ffc233", "#f2ffe9"]);
                s.shake = Math.max(s.shake, 4); sfx.kick(); force((t) => t + 1);
                break;
              }
            }
          }
          if (s.shotTeam >= 0 && !s.shotTested && ((team === 0 && b.x > planeX) || (team === 1 && b.x < planeX))) {
            s.shotTested = true;
            const reach = clamp(19 + (gk ? gk.p.med - 70 : 0) * 0.42 - Math.max(0, 220 - s.shotD) * 0.06, 10, 28);
            if (gk && Math.abs(b.y - gk.y) < reach) {
              b.vx = (team === 0 ? -1 : 1) * (180 + Math.random() * 170);
              b.vy = (Math.random() - 0.5) * 360;
              s.shotTeam = -1; sfx.kick();
              const clubId = gkTeam === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `¡ATAJADÓN de ${lastName(gk.p.name)}! La sacó del ángulo.` });
              burst(b.x, b.y, 14, ["#ffc233", "#f2ffe9"]);
              s.shake = Math.max(s.shake, 4); force((t) => t + 1);
            }
          }
          if (s.shotTeam >= 0 && ((team === 0 && b.x >= W - 20) || (team === 1 && b.x <= 20))) {
            if (Math.abs(b.y - H / 2) < MOUTH - 2) {
              goalScored(team, s.shotShooter);
            } else if (Math.abs(Math.abs(b.y - H / 2) - MOUTH) < 8 && Math.random() < 0.5) {
              const clubId = team === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: "¡EN EL PALO! Todo el estadio con las manos en la cabeza." });
              b.vx = (team === 0 ? -1 : 1) * 220; b.vy = (Math.random() - 0.5) * 260;
              s.shotTeam = -1; sfx.kick(); s.shake = Math.max(s.shake, 6); force((t) => t + 1);
            } else {
              const shooter = s.ents[s.shotShooter];
              const clubId = team === 0 ? pr.home.id : pr.away.id;
              s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "chance", text: `${lastName(shooter?.p.name ?? "El 9")} la mandó a la tribuna.` });
              force((t) => t + 1);
              resetToGK(gkTeam);
            }
          }
        }

        if (b.owner < 0 && s.shotTeam < 0 && s.passTarget < 0) {
          let best = -1, bd = 1e9;
          for (let i = 0; i < s.ents.length; i++) {
            const e = s.ents[i]; if (e.sent) continue;
            const d = dist(e, b); if (d < bd) { bd = d; best = i; }
          }
          const slow = Math.hypot(b.vx, b.vy) < 70;
          if (best >= 0 && s.ents[best].cd <= 0 && ((bd < 14) || (slow && bd < 30))) {
            takeBall(best); s.ents[best].cd = 0.25;
            if (s.ents[best].team === 0) s.stats.passesH++; else s.stats.passesA++;
          }
          if (b.x < 14 || b.x > W - 14) resetToGK(b.x < 14 ? 0 : 1);
        }

        s.looseT = b.owner >= 0 ? 0 : s.looseT + h;
        const inCorner = (b.x < 80 || b.x > W - 80) && (b.y < 90 || b.y > H - 90);
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
          if (best >= 0 && bd < 380) { s.passTarget = -1; s.shotTeam = -1; b.x = s.ents[best].x; b.y = s.ents[best].y; takeBall(best); }
          s.looseT = 0;
        }
      }
    };

    const draw = () => {
      const s = st.current; const pr = propsRef.current;
      const shakeX = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      const shakeY = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      ctx.save(); ctx.translate(shakeX, shakeY);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? "#0f8a44" : "#0d7c3d";
        ctx.fillRect((W / 12) * i, 0, W / 12 + 1, H);
      }
      ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      ctx.strokeRect(18, 18, W - 36, H - 36);
      ctx.beginPath(); ctx.moveTo(W / 2, 18); ctx.lineTo(W / 2, H - 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 62, 0, Math.PI * 2); ctx.stroke();
      ctx.fillStyle = "rgba(242,255,233,0.85)";
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 4, 0, Math.PI * 2); ctx.fill();
      for (const side of [0, 1]) {
        const x = side === 0 ? 18 : W - 18;
        const dir = side === 0 ? 1 : -1;
        ctx.strokeRect(Math.min(x, x + dir * 110), H / 2 - 110, 110, 220);
        ctx.strokeRect(Math.min(x, x + dir * 46), H / 2 - 52, 46, 104);
        ctx.fillStyle = "rgba(242,255,233,0.14)";
        ctx.fillRect(side === 0 ? 8 : W - 14, H / 2 - MOUTH, 6, MOUTH * 2);
        ctx.strokeStyle = "rgba(255,194,51,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(side === 0 ? 18 : W - 18, H / 2 - MOUTH);
        ctx.lineTo(side === 0 ? 18 : W - 18, H / 2 + MOUTH);
        ctx.stroke();
        ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      }
      const ownerEnt = s.ball.owner >= 0 ? s.ents[s.ball.owner] : null;
      for (const e of s.ents) {
        if (e.sent) continue;
        const isGk = e.role === "ARQ";
        const c1 = isGk ? "#ffc233" : e.team === 0 ? pr.home.c1 : pr.away.c1;
        const c2 = e.team === 0 ? pr.home.c2 : pr.away.c2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 9, 9, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(3,13,7,0.35)"; ctx.fill();
        if (ownerEnt === e) { ctx.beginPath(); ctx.arc(e.x, e.y, 14.5, 0, Math.PI * 2); ctx.strokeStyle = "#b8ff2e"; ctx.lineWidth = 2.5; ctx.stroke(); }
        ctx.beginPath(); ctx.arc(e.x, e.y, isGk ? 10 : 8.5, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(3,13,7,0.8)"; ctx.stroke();
        if (!isGk) { ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill(); }
        ctx.font = "800 9px Barlow, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = lum(c1) > 0.55 ? "#06170a" : "#f2ffe9";
        ctx.fillText(String(e.num), e.x, e.y + 0.5);
      }
      if (ownerEnt && !ownerEnt.sent) {
        const label = `${lastName(ownerEnt.p.name)} · ${ownerEnt.num}`;
        ctx.font = "700 12px Barlow, sans-serif";
        const tw = ctx.measureText(label).width;
        const lx = clamp(ownerEnt.x - tw / 2 - 7, 6, W - tw - 20);
        const ly = ownerEnt.y - 34;
        ctx.fillStyle = "rgba(3,13,7,0.82)"; ctx.fillRect(lx, ly, tw + 14, 19);
        ctx.fillStyle = "#b8ff2e"; ctx.textAlign = "left";
        ctx.fillText(label, lx + 7, ly + 10);
      }
      ctx.beginPath(); ctx.ellipse(s.ball.x, s.ball.y + 8, 6, 3, 0, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(3,13,7,0.4)"; ctx.fill();
      ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f2ffe9"; ctx.fill();
      ctx.strokeStyle = "#06170a"; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.beginPath(); ctx.arc(s.ball.x, s.ball.y, 2.4, 0, Math.PI * 2);
      ctx.fillStyle = "#06170a"; ctx.fill();
      for (const pt of s.particles) {
        ctx.globalAlpha = 1 - pt.life / pt.max;
        ctx.fillStyle = pt.color; ctx.fillRect(pt.x, pt.y, pt.size, pt.size * 0.6);
      }
      ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.72);
      vg.addColorStop(0, "rgba(3,13,7,0)"); vg.addColorStop(1, "rgba(3,13,7,0.5)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    };

    let raf = 0, lastT = performance.now(), finishTimer = 0, finished = false;
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
        if (s.shake > 0) s.shake = Math.max(0, s.shake - dtReal * 26);
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
  const lastEvents = s.events.slice(0, 6);
  const userXiNow = props.getUserXi();
  const stt = s.stats;
  const possTot = stt.possH + stt.possA || 1;
  const possH = Math.round((stt.possH / possTot) * 100);

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-center gap-0 mb-3 select-none flex-wrap">
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
            <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block border border-lima/25" style={{ background: "#0d7c3d" }} />
            {s.banner && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="font-display text-6xl md:text-8xl tracking-widest text-chalk animate-popin" style={{ textShadow: "0 0 30px rgba(184,255,46,0.9), 0 6px 0 rgba(3,13,7,0.8)" }}>
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
            {[["Posesión", `${possH}%`, `${100 - possH}%`], ["Tiros", stt.shotsH, stt.shotsA], ["Al arco", stt.onH, stt.onA], ["Pases", stt.passesH, stt.passesA], ["Faltas", stt.foulsH, stt.foulsA]].map(([label, hv, av]) => (
              <div key={label as string} className="panel-soft px-2 py-1.5">
                <div className="text-[10px] uppercase tracking-widest text-chalk/50">{label}</div>
                <div className="font-display text-xl"><span className="text-lima">{hv as string}</span><span className="text-chalk/40 text-sm"> / {av as string}</span></div>
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
                  <span className="font-display text-base leading-none mt-0.5 shrink-0 w-7" style={{ color: e.kind === "goal" ? "#b8ff2e" : e.kind === "card" ? "#ff4257" : e.kind === "chance" ? "#41d6ff" : "rgba(242,255,233,0.5)" }}>{e.min}'</span>
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
