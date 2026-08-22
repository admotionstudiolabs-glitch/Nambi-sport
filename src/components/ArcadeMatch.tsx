import { useEffect, useRef, useState } from "react";
import { Pause, Play, SkipForward, Zap } from "lucide-react";
import type { Club, MatchEvent, MatchResult, PlayerP, Role } from "../game/core";
import { roleOf } from "../game/core";
import { sfx } from "../game/audio";

const W = 1000, H = 560, MOUTH = 44;

interface Props {
  user: PlayerP; home: Club; away: Club;
  userXi: PlayerP[]; rivalXi: PlayerP[];
  role: Role;
  onFinish: (res: MatchResult) => void;
}

interface Ent { x: number; y: number; team: 0 | 1; isGk: boolean; p: PlayerP; isUser: boolean; kickCd: number; holdT: number; num: number }
interface Particle { x: number; y: number; vx: number; vy: number; life: number; max: number; color: string; size: number }

interface AState {
  ents: Ent[];
  ball: { x: number; y: number; vx: number; vy: number; owner: number; lastTouch: number };
  scoreH: number; scoreA: number; min: number; acc: number; stamina: number;
  userGoals: number; userAssists: number; tackles: number; turnovers: number; passes: number;
  events: MatchEvent[]; scorers: { pid: number; name: string; club: number; min: number }[];
  particles: Particle[]; shake: number; banner: { text: string; t: number } | null;
  freeze: number; pauseK: number; askCd: number; clearCd: number; graceT: number; looseT: number;
  posH: number; posA: number; shotsH: number; shotsA: number;
  started: boolean; paused: boolean; done: boolean; finishT: number; speed: number; errCount: number;
}

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const lastName = (n: string) => n.split(" ").slice(-1)[0];
const lum = (hex: string) => {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
};

export default function ArcadeMatch(props: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const keys = useRef<Record<string, boolean>>({});
  const pulse = useRef({ shoot: false, pass: false, ask: false, clear: false });
  const pausedRef = useRef(false);
  const speedRef = useRef(1);
  const finishRef = useRef(false);
  const propsRef = useRef(props);
  propsRef.current = props;

  const st = useRef<AState>({
    ents: [], ball: { x: W / 2, y: H / 2, vx: 0, vy: 0, owner: -1, lastTouch: -1 },
    scoreH: 0, scoreA: 0, min: 0, acc: 0, stamina: 100,
    userGoals: 0, userAssists: 0, tackles: 0, turnovers: 0, passes: 0,
    events: [{ min: 0, text: "¡Arranca el partido! La 10 es tuya.", kind: "info", club: -1 }],
    scorers: [], particles: [], shake: 0, banner: { text: "¡COMIENZA!", t: 1.4 },
    freeze: 0, pauseK: 0.4, askCd: 0, clearCd: 0, graceT: 0, looseT: 0,
    posH: 0, posA: 0, shotsH: 0, shotsA: 0,
    started: true, paused: false, done: false, finishT: 0, speed: 1, errCount: 0,
  });

  const [ui, setUi] = useState({ min: 0, scoreH: 0, scoreA: 0, stamina: 100, paused: false, speed: 1 });
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ([" ", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) e.preventDefault();
      keys.current[e.key.toLowerCase()] = true;
      if (e.key === " ") pulse.current.shoot = true;
      if (e.key.toLowerCase() === "e") pulse.current.pass = true;
      if (e.key.toLowerCase() === "q") pulse.current.ask = true;
      if (e.key.toLowerCase() === "f") pulse.current.clear = true;
      if (e.key === "Escape" || e.key.toLowerCase() === "p") { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); }
      if (e.key === "1") speedRef.current = 1;
      if (e.key === "2") speedRef.current = 2;
    };
    const up = (e: KeyboardEvent) => { keys.current[e.key.toLowerCase()] = false; };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); };
  }, []);

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d"); if (!ctx) return;
    const pr0 = propsRef.current;
    const s0 = st.current;
    const rm = roleOf(pr0.role);

    const build = () => {
      const ents: Ent[] = [];
      let n = 0;
      const mk = (p: PlayerP, team: 0 | 1, x: number, y: number, isGk: boolean, isUser: boolean) => {
        n++;
        ents.push({ x, y, team, isGk, p, isUser, kickCd: 0, holdT: 0, num: n });
      };
      const hGk = pr0.userXi.find((p) => p.pos === "ARQ") ?? pr0.userXi[0];
      mk(hGk, 0, 52, H / 2, true, false);
      const mates = pr0.userXi.filter((p) => p.id !== pr0.user.id && p.id !== hGk.id).sort((a, b) => b.med - a.med).slice(0, 9);
      const anchors = [[210, 130], [210, 290], [210, 450], [400, 200], [400, 380], [590, 110], [590, 260], [590, 410], [430, 290], [640, 290]];
      mates.forEach((p, i) => mk(p, 0, anchors[i % anchors.length][0], anchors[i % anchors.length][1], false, false));
      const uy = Math.round(H * rm.side);
      const uIdx = ents.length;
      mk(pr0.user, 0, Math.min(720, rm.depth + 140), uy, false, true);
      const aGk = pr0.rivalXi.find((p) => p.pos === "ARQ") ?? pr0.rivalXi[0];
      mk(aGk, 1, W - 52, H / 2, true, false);
      const foes = pr0.rivalXi.filter((p) => p.id !== aGk.id).sort((a, b) => b.med - a.med).slice(0, 10);
      const fAnchors = [[W - 210, 130], [W - 210, 290], [W - 210, 450], [W - 400, 200], [W - 400, 380], [W - 560, 130], [W - 560, 290], [W - 560, 450], [W - 400, 290], [W - 300, 290]];
      foes.forEach((p, i) => mk(p, 1, fAnchors[i % fAnchors.length][0], fAnchors[i % fAnchors.length][1], false, false));
      return { ents, uIdx };
    };
    const built = build();
    s0.ents = built.ents;
    const meIdx = built.uIdx;
    s0.ball.owner = meIdx;
    s0.graceT = 0.5;
    sfx.whistle();

    const burst = (x: number, y: number, n: number, colors: string[]) => {
      const s = st.current;
      for (let i = 0; i < n; i++) {
        s.particles.push({ x, y, vx: (Math.random() - 0.5) * 420, vy: -Math.random() * 380 - 50, life: 0, max: 1 + Math.random(), color: colors[i % colors.length], size: 3 + Math.random() * 5 });
      }
    };

    const goalFor = (team: 0 | 1, scorerIdx: number) => {
      const s = st.current; const pr = propsRef.current;
      if (team === 0) s.scoreH++; else s.scoreA++;
      const sp = s.ents[scorerIdx]?.p;
      const clubId = team === 0 ? pr.home.id : pr.away.id;
      if (sp) {
        s.scorers.push({ pid: sp.id, name: sp.name, club: clubId, min: Math.floor(s.min) });
        if (sp.isUser) s.userGoals++;
        else if (team === 0 && s.ball.lastTouch >= 0 && s.ents[s.ball.lastTouch]?.isUser) s.userAssists++;
      }
      s.events.unshift({ min: Math.floor(s.min), club: clubId, kind: "goal", text: sp?.isUser ? `¡GOOOL TUYO, ${lastName(sp.name).toUpperCase()}! Lo grita todo el estadio.` : `¡Gol de ${lastName(sp?.name ?? "el rival")}!` });
      burst(team === 0 ? W - 24 : 24, H / 2, 70, ["#ffc233", "#b8ff2e", "#f2ffe9"]);
      s.shake = 12; s.banner = { text: sp?.isUser ? "¡GOOOL TUYO!" : "¡GOOOL!", t: 1.4 };
      sfx.goal();
      s.pauseK = 1.2;
      s.ball.x = W / 2; s.ball.y = H / 2; s.ball.vx = 0; s.ball.vy = 0; s.ball.owner = team === 0 ? meIdx : -1;
      s.graceT = 0.5;
    };

    const shoot = (idx: number, power: number, acc2: number) => {
      const s = st.current; const e = s.ents[idx];
      const gx = e.team === 0 ? W - 14 : 14;
      const spread = clamp(140 - acc2 * 0.9, 16, 105);
      const ty = H / 2 + (Math.random() * 2 - 1) * spread;
      const dx = gx - s.ball.x, dy = ty - s.ball.y;
      const dl = Math.hypot(dx, dy) || 1;
      s.ball.vx = (dx / dl) * power; s.ball.vy = (dy / dl) * power;
      s.ball.owner = -1; s.ball.lastTouch = idx;
      if (e.team === 0) s.shotsH++; else s.shotsA++;
      e.kickCd = 0.4; sfx.kick();
    };

    const step = (dt: number) => {
      const s = st.current; const pr = propsRef.current;
      if (s.done) return;
      s.acc += dt * 1.6;
      while (s.acc >= 1) {
        s.acc -= 1; s.min++;
        if (s.min >= 90 && !s.done) { s.done = true; s.banner = { text: "FINAL", t: 2 }; sfx.whistle(true); }
      }
      if (s.done) return;

      if (s.pauseK > 0) {
        s.pauseK -= dt;
        s.ball.x = W / 2; s.ball.y = H / 2;
        return;
      }

      const b = s.ball;
      const me = s.ents[meIdx];
      s.graceT -= dt; s.askCd -= dt; s.clearCd -= dt;
      me.kickCd -= dt;

      /* --- control del usuario --- */
      let mx = 0, my = 0;
      const k = keys.current;
      if (k["w"] || k["arrowup"]) my -= 1;
      if (k["s"] || k["arrowdown"]) my += 1;
      if (k["a"] || k["arrowleft"]) mx -= 1;
      if (k["d"] || k["arrowright"]) mx += 1;
      const sprint = (k["shift"] && s.stamina > 2) && (mx || my);
      if (sprint) s.stamina = Math.max(0, s.stamina - 26 * dt);
      else s.stamina = Math.min(100, s.stamina + 12 * dt);
      if (mx || my) {
        const l = Math.hypot(mx, my);
        const spd = (me.p.stats?.ritmo ?? 70) * 2.5 * (sprint ? 1.45 : 1);
        me.x = clamp(me.x + (mx / l) * spd * dt, 24, W - 24);
        me.y = clamp(me.y + (my / l) * spd * dt, 24, H - 24);
      }

      const isOwner = b.owner === meIdx;

      /* --- acciones --- */
      if (pulse.current.shoot) {
        pulse.current.shoot = false;
        if (isOwner && me.kickCd <= 0) {
          const r9 = pr.role === "P9" ? 560 : 620;
          if (me.x > r9) shoot(meIdx, 640 + (me.p.stats?.tiro ?? 68) * 3, me.p.stats?.tiro ?? 68);
          else {
            // pase al compañero más adelantado
            const mates = s.ents.map((o, oi) => ({ o, oi })).filter(({ o }) => o.team === 0 && !o.isGk && o !== me);
            mates.sort((a, z) => z.o.x - a.o.x);
            const t = mates[0]?.o;
            if (t) {
              const dx = t.x - b.x, dy = t.y - b.y, dl = Math.hypot(dx, dy) || 1;
              b.vx = (dx / dl) * 520; b.vy = (dy / dl) * 520;
              b.owner = -1; b.lastTouch = meIdx; s.passes++;
              me.kickCd = 0.3; sfx.kick();
            }
          }
        }
      }
      if (pulse.current.pass) {
        pulse.current.pass = false;
        if (isOwner && me.kickCd <= 0) {
          const mates = s.ents.map((o, oi) => ({ o, oi })).filter(({ o }) => o.team === 0 && !o.isGk && o !== me && dist(o, me) < 320);
          mates.sort((a, z) => dist(z.o, me) - dist(a.o, me));
          const free = [...mates].sort((a, z) => {
            const da = Math.min(...s.ents.filter((o) => o.team === 1 && !o.isGk).map((o) => dist(o, a.o)));
            const dz = Math.min(...s.ents.filter((o) => o.team === 1 && !o.isGk).map((o) => dist(o, z.o)));
            return dz - da;
          })[0] ?? mates[0];
          if (free) {
            const dx = free.o.x - b.x, dy = free.o.y - b.y, dl = Math.hypot(dx, dy) || 1;
            b.vx = (dx / dl) * 500; b.vy = (dy / dl) * 500;
            b.owner = -1; b.lastTouch = meIdx; s.passes++;
            me.kickCd = 0.3; sfx.kick();
          }
        }
      }
      if (pulse.current.ask) {
        pulse.current.ask = false;
        if (!isOwner && b.owner >= 0 && s.ents[b.owner]?.team === 0 && s.askCd <= 0) {
          s.askCd = 1.2;
          const dx = me.x - b.x, dy = me.y - b.y, dl = Math.hypot(dx, dy) || 1;
          b.vx = (dx / dl) * 540; b.vy = (dy / dl) * 540;
          b.owner = -1; s.passes++;
          s.events.unshift({ min: Math.floor(s.min), text: "Pediste la pelota y te la tiraron al pie.", kind: "info", club: propsRef.current.home.id });
          sfx.kick();
        }
      }
      if (pulse.current.clear) {
        pulse.current.clear = false;
        if (isOwner && me.kickCd <= 0 && s.clearCd <= 0) {
          s.clearCd = 1;
          b.vx = 700 + Math.random() * 80;
          b.vy = (Math.random() - 0.5) * 260;
          b.owner = -1; b.lastTouch = meIdx;
          me.kickCd = 0.4; sfx.kick();
          s.events.unshift({ min: Math.floor(s.min), text: "¡Despeje largo! La mandaste a campo rival.", kind: "info", club: pr.home.id });
        }
      }

      /* --- IA compañeros y rivales --- */
      s.ents.forEach((e, i) => {
        if (e.isUser) return;
        e.kickCd -= dt; e.holdT = b.owner === i ? e.holdT + dt : 0;
        const spdScale = 0.8 + (e.p.stats?.ritmo ?? e.p.med) / 240;
        let tx = e.x, ty = e.y, sp = 90 * spdScale;
        if (e.isGk) {
          const gx = e.team === 0 ? 46 : W - 46;
          tx = gx; ty = clamp(b.y, H / 2 - 84, H / 2 + 84);
          sp = 170;
          if (b.owner < 0 && dist(e, b) < 26 && Math.abs(b.x - gx) < 120) {
            b.owner = i; b.vx = 0; b.vy = 0; b.lastTouch = i; s.graceT = 0.4;
          }
        } else if (b.owner === i) {
          tx = e.team === 0 ? W - 30 : 30;
          ty = H / 2 + Math.sin(i * 2.1) * 60;
          sp = 100 * spdScale;
          if (e.holdT > 0.9 && e.kickCd <= 0 && Math.random() < 0.06) {
            const gx = e.team === 0 ? W - 24 : 24;
            const dGoal = Math.hypot(gx - e.x, H / 2 - e.y);
            if (dGoal < 230) shoot(i, 540 + (e.p.stats?.tiro ?? 70) * 2.5, e.p.stats?.tiro ?? 70);
            else {
              const mates = s.ents.map((o, oi) => ({ o, oi })).filter(({ o, oi }) => o.team === e.team && !o.isGk && oi !== i && (e.team === 0 ? o.x > e.x : o.x < e.x));
              mates.sort((a, z) => Math.abs(z.o.y - H / 2) - Math.abs(a.o.y - H / 2));
              const t = mates[0]?.o;
              if (t) {
                const dx = t.x - b.x, dy = t.y - b.y, dl = Math.hypot(dx, dy) || 1;
                b.vx = (dx / dl) * 480; b.vy = (dy / dl) * 480;
                b.owner = -1; b.lastTouch = i; e.kickCd = 0.35; sfx.kick();
              }
            }
          }
        } else if (b.owner >= 0 && s.ents[b.owner].team !== e.team && !s.ents[b.owner].isGk) {
          const owner = s.ents[b.owner];
          const nearest = s.ents.filter((o) => o.team === e.team && !o.isGk && !o.isUser).sort((a, z) => dist(a, owner) - dist(z, owner))[0];
          if (nearest === e || dist(e, owner) < 70) { tx = b.x; ty = b.y; sp = 106 * spdScale; }
          else { tx = e.x; ty = e.y; sp = 0; }
        } else if (b.owner < 0) {
          const closest = s.ents.filter((o) => o.team === e.team && !o.isGk).sort((a, z) => dist(a, b) - dist(z, b))[0];
          if (closest === e) { tx = b.x; ty = b.y; sp = 112 * spdScale; }
        } else if (b.owner >= 0 && s.ents[b.owner].team === e.team) {
          tx = e.x + (e.team === 0 ? 40 : -40);
          ty = clamp(e.y + (H / 2 - e.y) * 0.1 + Math.sin(i) * 40, 30, H - 30);
          sp = 80 * spdScale;
        }
        if (sp > 0) {
          const dx = tx - e.x, dy = ty - e.y, dd = Math.hypot(dx, dy);
          if (dd > 2) { e.x += (dx / dd) * Math.min(sp * dt, dd); e.y += (dy / dd) * Math.min(sp * dt, dd); }
        }
        e.x = clamp(e.x, 20, W - 20); e.y = clamp(e.y, 22, H - 22);
      });

      /* --- pelota --- */
      if (b.owner >= 0) {
        const o = s.ents[b.owner];
        if (o.team === 0) s.posH += dt; else s.posA += dt;
        b.x = o.x + (o.team === 0 ? 12 : -12); b.y = o.y + 4; b.vx = 0; b.vy = 0;
        // quite del rival más cercano
        if (s.graceT <= 0 && !o.isUser) {
          for (const z of s.ents) {
            if (z.team === o.team || z.isGk || z.kickCd > 0) continue;
            if (dist(z, o) < 17) {
              z.kickCd = 1;
              const pWin = 0.3 + ((z.p.stats?.defensa ?? z.p.med) - (o.p.stats?.regate ?? o.p.med)) / 100;
              if (Math.random() < clamp(pWin, 0.1, 0.55)) {
                b.owner = s.ents.indexOf(z); b.lastTouch = s.ents.indexOf(z);
                if (z.isUser) { s.tackles++; s.events.unshift({ min: Math.floor(s.min), text: `¡Recuperaste la pelota, ${lastName(z.p.name)}!`, kind: "chance", club: pr.home.id }); }
                else s.turnovers++;
                sfx.kick();
              }
              break;
            }
          }
        } else if (s.graceT <= 0 && o.isUser) {
          for (const z of s.ents) {
            if (z.team === 0 || z.isGk || z.kickCd > 0) continue;
            if (dist(z, o) < 16) {
              z.kickCd = 1.1;
              const reg = o.p.stats?.regate ?? 70, fis = o.p.stats?.fisico ?? 64;
              const pLose = clamp(0.3 + ((z.p.stats?.defensa ?? z.p.med) - reg) / 110 - (fis - 70) / 260, 0.08, 0.5);
              if (Math.random() < pLose) {
                b.owner = s.ents.indexOf(z); b.lastTouch = s.ents.indexOf(z);
                s.turnovers++;
                s.events.unshift({ min: Math.floor(s.min), text: `Te la robó ${lastName(z.p.name)}.`, kind: "chance", club: pr.away.id });
                sfx.kick();
              } else { z.x += (z.x < o.x ? -14 : 14); }
              break;
            }
          }
        }
      } else {
        b.x += b.vx * dt; b.y += b.vy * dt;
        const fr = Math.pow(0.55, dt * 60 / 16);
        b.vx *= fr; b.vy *= fr;
        if (b.y < 22) { b.y = 22; b.vy = Math.abs(b.vy) * 0.6; }
        if (b.y > H - 22) { b.y = H - 22; b.vy = -Math.abs(b.vy) * 0.6; }
        // recoger
        let best = -1, bd = 1e9;
        for (let i = 0; i < s.ents.length; i++) {
          const e = s.ents[i];
          const d = dist(e, b);
          const r = e.isUser ? 22 : 15;
          if (d < bd && (d < r || (Math.hypot(b.vx, b.vy) < 80 && d < r + 14))) { bd = d; best = i; }
        }
        if (best >= 0 && bd < 40) {
          b.owner = best; b.lastTouch = best; b.vx = 0; b.vy = 0; s.graceT = 0.35;
          s.ents[best].kickCd = Math.max(s.ents[best].kickCd, 0.2);
        }
        // tiros: arqueros y gol
        for (const side of [0, 1] as const) {
          const planeX = side === 0 ? W - 60 : 60;
          if ((side === 0 && b.x > planeX && b.vx > 0) || (side === 1 && b.x < planeX && b.vx < 0)) {
            const gk = s.ents.find((e) => e.team === (1 - side) && e.isGk);
            if (gk && Math.abs(b.y - gk.y) < 30 + (gk.p.med - 70) * 0.5) {
              const shooter = s.ents[b.lastTouch];
              if (shooter?.isUser) s.events.unshift({ min: Math.floor(s.min), text: `¡Te la sacó ${lastName(gk.p.name)}! Voló el arquero.`, kind: "chance", club: pr.away.id });
              b.vx = (side === 0 ? -1 : 1) * (200 + Math.random() * 150);
              b.vy = (Math.random() - 0.5) * 300;
              sfx.kick();
              break;
            }
          }
          if ((side === 0 && b.x >= W - 18) || (side === 1 && b.x <= 18)) {
            if (Math.abs(b.y - H / 2) < MOUTH - 2) {
              goalFor(side, b.lastTouch >= 0 ? b.lastTouch : 0);
            } else {
              b.x = side === 0 ? W - 70 : 70; b.y = clamp(b.y, 60, H - 60);
              b.vx = (side === 0 ? -1 : 1) * 160; b.vy = 0;
              const gk = s.ents.find((e) => e.team === (1 - side) && e.isGk);
              if (gk) { b.owner = s.ents.indexOf(gk); b.lastTouch = s.ents.indexOf(gk); }
            }
            break;
          }
        }
        s.looseT = Math.hypot(b.vx, b.vy) < 40 ? s.looseT + dt : 0;
        if (s.looseT > 2.5) {
          let bb = -1, bbd = 1e9;
          for (let i = 0; i < s.ents.length; i++) {
            if (s.ents[i].isGk) continue;
            const d = dist(s.ents[i], b); if (d < bbd) { bbd = d; bb = i; }
          }
          if (bb >= 0 && bbd < 400) { b.owner = bb; b.lastTouch = bb; b.vx = 0; b.vy = 0; }
          s.looseT = 0;
        }
      }

      if (s.banner) { s.banner.t -= dt; if (s.banner.t <= 0) s.banner = null; }
      s.particles = s.particles.filter((pt) => {
        pt.life += dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt; pt.vy += 500 * dt;
        return pt.life < pt.max;
      });
      if (s.shake > 0) s.shake = Math.max(0, s.shake - dt * 26);
    };

    const draw = () => {
      const s = st.current; const pr = propsRef.current;
      const shX = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      const shY = s.shake ? (Math.random() - 0.5) * s.shake : 0;
      ctx.save(); ctx.translate(shX, shY);
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? "#0f8a44" : "#0d7c3d";
        ctx.fillRect((W / 12) * i, 0, W / 12 + 1, H);
      }
      ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      ctx.strokeRect(18, 18, W - 36, H - 36);
      ctx.beginPath(); ctx.moveTo(W / 2, 18); ctx.lineTo(W / 2, H - 18); ctx.stroke();
      ctx.beginPath(); ctx.arc(W / 2, H / 2, 64, 0, Math.PI * 2); ctx.stroke();
      for (const side of [0, 1]) {
        const x = side === 0 ? 18 : W - 18;
        const dir = side === 0 ? 1 : -1;
        ctx.strokeRect(Math.min(x, x + dir * 110), H / 2 - 110, 110, 220);
        ctx.fillStyle = "rgba(242,255,233,0.14)";
        ctx.fillRect(side === 0 ? 8 : W - 14, H / 2 - MOUTH, 6, MOUTH * 2);
        ctx.strokeStyle = "rgba(255,194,51,0.9)"; ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(side === 0 ? 18 : W - 18, H / 2 - MOUTH);
        ctx.lineTo(side === 0 ? 18 : W - 18, H / 2 + MOUTH);
        ctx.stroke();
        ctx.strokeStyle = "rgba(242,255,233,0.85)"; ctx.lineWidth = 2.5;
      }
      const b = s.ball;
      for (const e of s.ents) {
        const c1 = e.isGk ? "#ffc233" : e.team === 0 ? pr.home.c1 : pr.away.c1;
        const c2 = e.team === 0 ? pr.home.c2 : pr.away.c2;
        ctx.beginPath(); ctx.ellipse(e.x, e.y + 9, 9, 4, 0, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(3,13,7,0.35)"; ctx.fill();
        if (e.isUser) {
          ctx.beginPath(); ctx.arc(e.x, e.y, 15.5, 0, Math.PI * 2);
          ctx.strokeStyle = "#b8ff2e"; ctx.lineWidth = 3; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(e.x, e.y, e.isGk ? 10 : 8.5, 0, Math.PI * 2);
        ctx.fillStyle = c1; ctx.fill();
        ctx.lineWidth = 2; ctx.strokeStyle = "rgba(3,13,7,0.8)"; ctx.stroke();
        if (!e.isGk) { ctx.beginPath(); ctx.arc(e.x, e.y, 4, 0, Math.PI * 2); ctx.fillStyle = c2; ctx.fill(); }
        ctx.font = "800 9px Barlow, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.fillStyle = lum(c1) > 0.55 ? "#06170a" : "#f2ffe9";
        ctx.fillText(String(e.num), e.x, e.y + 0.5);
        if (e.isUser) {
          const label = `TÚ · ${lastName(e.p.name)}`;
          ctx.font = "800 12px Barlow, sans-serif";
          const tw = ctx.measureText(label).width;
          const lx = clamp(e.x - tw / 2 - 7, 6, W - tw - 20);
          ctx.fillStyle = "rgba(3,13,7,0.85)"; ctx.fillRect(lx, e.y - 36, tw + 14, 19);
          ctx.fillStyle = "#b8ff2e"; ctx.textAlign = "left";
          ctx.fillText(label, lx + 7, e.y - 26);
        }
      }
      ctx.beginPath(); ctx.arc(b.x, b.y, 6.5, 0, Math.PI * 2);
      ctx.fillStyle = "#f2ffe9"; ctx.fill();
      ctx.strokeStyle = "#06170a"; ctx.lineWidth = 1.5; ctx.stroke();
      for (const pt of s.particles) {
        ctx.globalAlpha = 1 - pt.life / pt.max;
        ctx.fillStyle = pt.color; ctx.fillRect(pt.x, pt.y, pt.size, pt.size * 0.6);
      }
      ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.75);
      vg.addColorStop(0, "rgba(3,13,7,0)"); vg.addColorStop(1, "rgba(3,13,7,0.5)");
      ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
      ctx.restore();
    };

    const doFinish = () => {
      const s = st.current; const pr = propsRef.current;
      if (finishRef.current) return;
      finishRef.current = true;
      const avg = pr.user.ratings.length ? pr.user.ratings.reduce((a, b) => a + b, 0) / pr.user.ratings.length : 6.5;
      const rating = Math.round(clamp(5 + s.userGoals * 1.7 + s.userAssists * 0.7 + s.tackles * 0.25 - s.turnovers * 0.35 + (avg - 6.5) * 0.3, 3, 10) * 10) / 10;
      const tot = s.posH + s.posA || 1;
      pr.onFinish({
        gh: s.scoreH, ga: s.scoreA, events: s.events, scorers: s.scorers, cards: Math.floor(Math.random() * 4),
        userGoals: s.userGoals, userAssists: s.userAssists, rating, tackles: s.tackles,
        stats: {
          possH: Math.round((s.posH / tot) * 100), possA: Math.round((s.posA / tot) * 100),
          shotsH: s.shotsH, shotsA: s.shotsA, onH: Math.max(s.userGoals, Math.floor(s.shotsH / 2)), onA: Math.max(s.scoreA, Math.floor(s.shotsA / 2)),
          passesH: s.passes, passesA: Math.max(4, s.shotsA * 2), foulsH: s.turnovers, foulsA: s.tackles,
        },
      });
    };

    let raf = 0, lastT = performance.now(), realT = 0;
    const frame = (now: number) => {
      raf = requestAnimationFrame(frame);
      let dt = (now - lastT) / 1000;
      lastT = now;
      if (!isFinite(dt) || dt < 0) dt = 0.016;
      dt = Math.min(0.05, dt);
      realT += dt;
      const s = st.current;
      if (!pausedRef.current) {
        try {
          for (let i = 0; i < speedRef.current; i++) step(dt);
          s.errCount = 0;
        } catch (err) {
          s.errCount++;
          console.error("arcade:", err);
          if (s.errCount > 30) { s.done = true; }
        }
        if ((s.done && (s.finishT += dt) > 1.4) || realT > 7 * 60) doFinish();
      }
      draw();
      setUi((u) =>
        u.min !== Math.floor(s.min) || u.scoreH !== s.scoreH || u.scoreA !== s.scoreA || Math.round(u.stamina) !== Math.round(s.stamina) || u.speed !== speedRef.current
          ? { min: Math.floor(s.min), scoreH: s.scoreH, scoreA: s.scoreA, stamina: s.stamina, paused: pausedRef.current, speed: speedRef.current }
          : u
      );
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const s = st.current;
  const press = (k: "shoot" | "pass" | "ask" | "clear") => { pulse.current[k] = true; sfx.click(); };
  const togglePause = () => { pausedRef.current = !pausedRef.current; setPaused(pausedRef.current); sfx.click(); };

  return (
    <div className="w-full">
      <div className="flex items-stretch justify-center gap-0 mb-3 select-none flex-wrap">
        <div className="scoreled px-5 py-1.5 text-2xl flex items-center" style={{ borderRight: "none" }}>
          <span className="mr-2 inline-block w-3 h-3" style={{ background: props.home.c1 === "#f2f2f2" || props.home.c1 === "#f4f4f4" ? "#fff" : props.home.c1 }} />{props.home.short}
        </div>
        <div className="scoreled px-6 py-1.5 text-4xl">{ui.scoreH}&nbsp;-&nbsp;{ui.scoreA}</div>
        <div className="scoreled px-5 py-1.5 text-2xl flex items-center" style={{ borderLeft: "none" }}>
          {props.away.short}<span className="ml-2 inline-block w-3 h-3" style={{ background: props.away.c1 === "#f2f2f2" || props.away.c1 === "#f4f4f4" ? "#fff" : props.away.c1 }} />
        </div>
        <div className="scoreled px-4 py-1.5 text-2xl flex items-center text-cielo" style={{ borderLeft: "none" }}>{ui.min}'</div>
      </div>

      <div className="flex flex-col lg:flex-row gap-4">
        <div className="flex-1">
          <div className={`relative ${s.shake > 0.5 ? "animate-shake" : ""}`}>
            <canvas ref={canvasRef} width={W} height={H} className="w-full h-auto block border border-lima/25" style={{ background: "#0d7c3d" }} />
            {s.banner && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="font-display text-5xl md:text-7xl tracking-widest text-chalk animate-popin" style={{ textShadow: "0 0 30px rgba(184,255,46,0.9), 0 6px 0 rgba(3,13,7,0.8)" }}>{s.banner.text}</div>
              </div>
            )}
            {paused && (
              <div className="absolute inset-0 bg-night-950/80 flex flex-col items-center justify-center gap-3 z-10">
                <div className="font-display text-5xl text-gold tracking-widest">PAUSA</div>
                <div className="text-chalk/70 text-sm">ESC o P para seguir</div>
                <button className="btn btn-lima px-8 py-2 text-xl" onClick={togglePause}><span>SEGUIR</span></button>
              </div>
            )}
          </div>

          <div className="mt-2 flex items-center gap-3">
            <span className="font-display tracking-widest text-xs text-chalk/60">AGUANTE</span>
            <div className="flex-1 h-3" style={{ background: "rgba(3,13,7,0.8)", border: "1px solid rgba(242,255,233,0.15)" }}>
              <div className="h-full transition-all duration-200" style={{ width: `${ui.stamina}%`, background: ui.stamina > 35 ? "linear-gradient(90deg,#0f8a44,#b8ff2e)" : "linear-gradient(90deg,#ff4257,#ffc233)" }} />
            </div>
          </div>

          <div className="mt-2 grid grid-cols-2 md:grid-cols-4 gap-2">
            <button className="btn btn-lima py-2" onClick={() => press("shoot")}><Zap size={15} /><span>REMATE (ESP)</span></button>
            <button className="btn btn-ghost py-2" onClick={() => press("pass")}><span>PASE (E)</span></button>
            <button className="btn btn-ghost py-2" onClick={() => press("ask")}><span>PEDIRLA (Q)</span></button>
            <button className="btn btn-ghost py-2" onClick={() => press("clear")}><span>SACAR (F)</span></button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <button className="btn btn-ghost px-4 py-1.5" onClick={togglePause}>{paused ? <Play size={16} /> : <Pause size={16} />}</button>
            {[1, 2].map((v) => (
              <button key={v} className={`btn px-4 py-1.5 ${ui.speed === v ? "btn-lima" : "btn-ghost"}`} onClick={() => { speedRef.current = v; sfx.tab(); }}><span>x{v}</span></button>
            ))}
            <button className="btn btn-gold px-4 py-1.5" onClick={() => { speedRef.current = 8; sfx.tab(); }}><SkipForward size={16} /><span>SIMULAR</span></button>
            <span className="text-xs text-chalk/50">WASD moverte · SHIFT sprint · siempre jugás con tu pibe</span>
          </div>
        </div>

        <div className="w-full lg:w-72">
          <div className="panel-soft p-3 min-h-[220px]">
            <div className="font-display text-lg text-gold tracking-wider mb-2">MINUTO A MINUTO</div>
            <div className="space-y-1.5">
              {s.events.slice(0, 7).map((e, i) => (
                <div key={`${e.min}-${i}`} className={`text-[13px] leading-snug flex gap-2 ${i === 0 ? "animate-risein" : ""}`}>
                  <span className="font-display text-base leading-none mt-0.5 shrink-0 w-7" style={{ color: e.kind === "goal" ? "#b8ff2e" : e.kind === "card" ? "#ff4257" : e.kind === "chance" ? "#41d6ff" : "rgba(242,255,233,0.5)" }}>{e.min}'</span>
                  <span className={e.kind === "goal" ? "text-chalk font-bold" : "text-chalk/75"}>{e.text}</span>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-chalk/10 grid grid-cols-3 gap-2 text-center">
              <div><div className="font-display text-2xl text-lima">{s.userGoals}</div><div className="text-[10px] uppercase tracking-widest text-chalk/50">Tus goles</div></div>
              <div><div className="font-display text-2xl text-cielo">{s.userAssists}</div><div className="text-[10px] uppercase tracking-widest text-chalk/50">Asistencias</div></div>
              <div><div className="font-display text-2xl text-gold">{s.tackles}</div><div className="text-[10px] uppercase tracking-widest text-chalk/50">Recuperos</div></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
