// 외부 오디오 파일 없이 WebAudio로 직접 소리를 만든다.
// (GitHub Pages에 정적 파일만 올리기 위해 에셋 의존성을 없앴다)

class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.noiseBuffer = null;
  }

  // 브라우저 정책상 사용자 입력이 있어야 오디오를 켤 수 있다.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.9;
    this.master.connect(this.ctx.destination);

    const len = this.ctx.sampleRate * 1.2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffer = buf;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.9;
  }

  get t() { return this.ctx ? this.ctx.currentTime : 0; }

  _noise(dur, gain, filterType, freq, q = 1) {
    if (!this.ctx || this.muted) return null;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = filterType;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    src.connect(filter); filter.connect(g); g.connect(this.master);
    src.start(); src.stop(this.t + dur);
    return g;
  }

  _tone(freq, dur, gain, type = 'sine', toFreq = null) {
    if (!this.ctx || this.muted) return null;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, this.t);
    if (toFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(20, toFreq), this.t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, this.t);
    g.gain.exponentialRampToValueAtTime(0.0001, this.t + dur);
    osc.connect(g); g.connect(this.master);
    osc.start(); osc.stop(this.t + dur);
    return g;
  }

  // 공룡 발소리. intensity 0(멀다) ~ 1(매우 가깝다)
  footstep(intensity) {
    const v = 0.10 + intensity * 0.55;
    this._tone(58 + intensity * 22, 0.26, v, 'sine', 26);
    this._noise(0.16, v * 0.45, 'lowpass', 220 + intensity * 260);
  }

  gunshot() {
    this._noise(0.16, 0.55, 'highpass', 900);
    this._noise(0.28, 0.40, 'lowpass', 420);
    this._tone(160, 0.12, 0.30, 'square', 40);
  }

  reloadClick() { this._noise(0.05, 0.14, 'highpass', 2600); }

  hit() {
    this._tone(220, 0.5, 0.34, 'sawtooth', 60);
    this._noise(0.4, 0.28, 'lowpass', 700);
  }

  miss() { this._noise(0.22, 0.20, 'highpass', 1600); }

  turn() { this._noise(0.26, 0.26, 'bandpass', 700, 0.7); }

  clear() {
    [392, 523, 659, 784].forEach((f, i) => {
      setTimeout(() => this._tone(f, 0.5, 0.22, 'triangle'), i * 130);
    });
  }

  jumpscare() {
    this._noise(0.9, 0.85, 'lowpass', 1800);
    this._tone(90, 0.9, 0.55, 'sawtooth', 700);
    this._tone(1400, 0.6, 0.28, 'square', 180);
  }
}

export const Sfx = new AudioEngine();
