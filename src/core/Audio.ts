/**
 * All sound is synthesized with Web Audio — no files to download, so the initial payload stays tiny.
 * Starts on the first user gesture (browsers block autoplay) and resumes after iOS interruptions.
 * Swap in recorded music/SFX later behind the same methods.
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private musicBus!: GainNode;
  private sfxBus!: GainNode;
  private duckGain!: GainNode;
  private noise!: AudioBuffer;
  private creak: { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode } | null = null;
  private hum: { a: OscillatorNode; b: OscillatorNode; gain: GainNode } | null = null;
  private musicTimer = 0;
  private musicStep = 0;
  private musicVol = 0.7;
  private sfxVol = 0.8;
  private muted = false;
  private adMuted = false;

  constructor() {
    const unlock = () => this.unlock();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    // iOS suspends the context on calls / app switches; resume on the next touch.
    window.addEventListener('touchend', unlock);
    document.addEventListener('visibilitychange', () => {
      if (!this.ctx) return;
      if (document.hidden) this.ctx.suspend();
      else if (!this.adMuted) this.ctx.resume();
    });
  }

  private unlock() {
    if (this.ctx) {
      if (this.ctx.state !== 'running' && !document.hidden && !this.adMuted) this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.connect(ctx.destination);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.musicBus = ctx.createGain();
    this.musicBus.connect(this.duckGain);
    this.sfxBus = ctx.createGain();
    this.sfxBus.connect(this.master);
    this.applyVolumes();

    const len = ctx.sampleRate * 2;
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

    this.startLoops();
    this.startMusic();
  }

  private applyVolumes() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted || this.adMuted ? 0 : 1, t, 0.05);
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.5, t, 0.1);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
  }

  setVolumes(music: number, sfx: number) {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.applyVolumes();
  }

  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolumes();
  }

  /** Portals require silence while an ad plays. */
  setAdMuted(m: boolean) {
    this.adMuted = m;
    this.applyVolumes();
  }

  /** Music drops 50% during the reveal so the chime carries. */
  duck(on: boolean) {
    if (!this.ctx) return;
    this.duckGain.gain.setTargetAtTime(on ? 0.5 : 1, this.ctx.currentTime, 0.15);
  }

  // --- continuous layers ------------------------------------------------------------------------

  private startLoops() {
    const ctx = this.ctx!;
    // Wooden creak: looping noise through a resonant band-pass; level and pitch follow rotation speed.
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 9;
    filter.frequency.value = 300;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.sfxBus);
    src.start();
    this.creak = { src, filter, gain };

    // Match hum: two soft sines a fifth apart, rising in pitch and level with the meter.
    const a = ctx.createOscillator();
    const b = ctx.createOscillator();
    a.type = b.type = 'sine';
    a.frequency.value = 110;
    b.frequency.value = 165;
    const hg = ctx.createGain();
    hg.gain.value = 0;
    a.connect(hg);
    b.connect(hg);
    hg.connect(this.sfxBus);
    a.start();
    b.start();
    this.hum = { a, b, gain: hg };
  }

  /** Rotation speed in degrees/second (0 when still). */
  setRotateSpeed(degPerSec: number) {
    if (!this.ctx || !this.creak) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, degPerSec / 400);
    this.creak.gain.gain.setTargetAtTime(k * 0.22, t, 0.05);
    this.creak.filter.frequency.setTargetAtTime(220 + k * 520, t, 0.05);
  }

  /** Meter 0..1; the hum only rises above 85%. */
  setMatch(meter: number) {
    if (!this.ctx || !this.hum) return;
    const t = this.ctx.currentTime;
    const k = Math.max(0, (meter - 0.85) / 0.15);
    this.hum.gain.gain.setTargetAtTime(k * 0.09, t, 0.1);
    this.hum.a.frequency.setTargetAtTime(110 + k * 30, t, 0.1);
    this.hum.b.frequency.setTargetAtTime(165 + k * 45, t, 0.1);
  }

  // --- one-shots --------------------------------------------------------------------------------

  private tone(freq: number, start: number, dur: number, vol: number, type: OscillatorType = 'sine', bus = this.sfxBus) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.setValueAtTime(0, start);
    g.gain.linearRampToValueAtTime(vol, start + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
    o.connect(g).connect(bus);
    o.start(start);
    o.stop(start + dur + 0.05);
  }

  /** Snap: a bright bell chord + an airy whoosh. */
  chime() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.tone(f, t + i * 0.035, 1.6, 0.11);
      this.tone(f * 2.76, t + i * 0.035, 0.5, 0.025);
    });
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(4000, t + 0.45);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.18, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t);
    src.stop(t + 0.6);
  }

  /** One star landing; index raises the pitch. */
  star(index: number) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = [880, 1108.7, 1318.5][index] ?? 880;
    this.tone(f, t, 0.35, 0.12, 'triangle');
    this.tone(f * 1.5, t + 0.02, 0.2, 0.04);
  }

  /** Paper-ish tick for UI buttons. */
  click() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'highpass';
    f.frequency.value = 2500;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.06);
    src.connect(f).connect(g).connect(this.sfxBus);
    src.start(t, Math.random());
    src.stop(t + 0.08);
  }

  /** Hint used: a soft rising two-note. */
  hint() {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.tone(587.33, t, 0.3, 0.08, 'triangle');
    this.tone(880, t + 0.1, 0.4, 0.08, 'triangle');
  }

  // --- music ------------------------------------------------------------------------------------

  /** Calm generative loop: four warm pad chords with sparse plucks, ~9 s per chord. */
  private startMusic() {
    const chords = [
      [220, 261.63, 329.63, 392],
      [174.61, 220, 261.63, 329.63],
      [130.81, 196, 246.94, 329.63],
      [196, 246.94, 293.66, 329.63],
    ];
    const chordLen = 9;
    const playChord = () => {
      // Don't stack chords while the context is suspended (tab hidden, ad playing).
      if (!this.ctx || this.ctx.state !== 'running') return;
      const t = this.ctx.currentTime + 0.05;
      const chord = chords[this.musicStep % chords.length];
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 900;
      lp.connect(this.musicBus);
      for (const f of chord) {
        for (const detune of [-6, 6]) {
          const o = this.ctx.createOscillator();
          const g = this.ctx.createGain();
          o.type = 'sawtooth';
          o.frequency.value = f / 2;
          o.detune.value = detune;
          g.gain.setValueAtTime(0, t);
          g.gain.linearRampToValueAtTime(0.025, t + 2.5);
          g.gain.setValueAtTime(0.025, t + chordLen - 2);
          g.gain.linearRampToValueAtTime(0, t + chordLen + 1.5);
          o.connect(g).connect(lp);
          o.start(t);
          o.stop(t + chordLen + 1.6);
        }
      }
      // A few plucks from the chord, at gentle random offsets.
      for (let i = 0; i < 4; i++) {
        const f = chord[Math.floor(Math.random() * chord.length)] * 2;
        this.tone(f, t + 1 + i * 2 + Math.random() * 0.6, 1.4, 0.035, 'triangle', this.musicBus);
      }
      this.musicStep++;
    };
    playChord();
    this.musicTimer = window.setInterval(playChord, chordLen * 1000);
  }

  dispose() {
    clearInterval(this.musicTimer);
    this.ctx?.close();
  }
}
