/* sonido procedural con WebAudio */
class Sfx {
  private ctx: AudioContext | null = null;
  private noiseBuf: AudioBuffer | null = null;
  private crowdSrc: AudioBufferSourceNode | null = null;
  private crowdGain: GainNode | null = null;
  muted = false;

  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
        const len = this.ctx.sampleRate * 2;
        this.noiseBuf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
        this.startCrowd();
      } catch { /* sin audio */ }
    }
    if (this.ctx && this.ctx.state === "suspended") this.ctx.resume();
  }

  private startCrowd() {
    if (!this.ctx || !this.noiseBuf || this.crowdSrc) return;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf; src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = "lowpass"; filter.frequency.value = 420;
    const gain = this.ctx.createGain();
    gain.gain.value = this.muted ? 0 : 0.028;
    src.connect(filter).connect(gain).connect(this.ctx.destination);
    src.start();
    this.crowdSrc = src; this.crowdGain = gain;
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    if (this.crowdGain) this.crowdGain.gain.value = this.muted ? 0 : 0.028;
    return this.muted;
  }

  private blip(freq: number, dur: number, type: OscillatorType, vol: number, slide = 0) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }

  private noise(dur: number, vol: number, freq = 800) {
    if (!this.ctx || !this.noiseBuf || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = "bandpass"; f.frequency.value = freq;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start(t); src.stop(t + dur + 0.02);
  }

  click() { this.blip(660, 0.07, "square", 0.05); }
  tab() { this.blip(440, 0.08, "square", 0.05, 160); }
  kick() { this.noise(0.12, 0.16, 500); this.blip(110, 0.1, "sine", 0.14, -50); }
  whistle(long = false) {
    this.blip(2100, long ? 0.7 : 0.28, "sine", 0.07, 120);
    if (!long) this.blip(2100, 0.16, "sine", 0.05, 120);
  }
  card() { this.blip(520, 0.1, "square", 0.06); this.blip(390, 0.14, "square", 0.06); }
  goal() {
    this.blip(392, 0.16, "sawtooth", 0.08);
    setTimeout(() => this.blip(494, 0.16, "sawtooth", 0.08), 130);
    setTimeout(() => this.blip(587, 0.34, "sawtooth", 0.09), 260);
    this.noise(1.1, 0.1, 900);
    if (this.crowdGain && this.ctx) {
      const t = this.ctx.currentTime;
      this.crowdGain.gain.cancelScheduledValues(t);
      this.crowdGain.gain.setValueAtTime(0.12, t);
      this.crowdGain.gain.exponentialRampToValueAtTime(this.muted ? 0 : 0.028, t + 2.4);
    }
  }
  coins() { this.blip(1180, 0.09, "square", 0.05); setTimeout(() => this.blip(1560, 0.12, "square", 0.05), 80); }
  trophy() {
    [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.3, "triangle", 0.09), i * 150));
    this.noise(1.4, 0.09, 1100);
  }
}

export const sfx = new Sfx();
