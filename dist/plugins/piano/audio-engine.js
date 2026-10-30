/** Sampled piano. All voices use the AudioContext clock, including scheduled notes. */
export class PianoAudio {
  constructor({assetBaseUrl=new URL('../../assets/audio/',import.meta.url)}={}) { this.assetBaseUrl=assetBaseUrl; this.context = null; this.buffers = new Map(); this.voices = new Set(); this.volume = .65; this.ready = null; this.sampleFailures = 0; }
  prime() {
    // Decode without opening an audible context, so the first key can use a sample.
    const Offline = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    if (!this.ready && Offline) this.ready = this.loadSamples(new Offline(1, 1, 44100));
  }
  async unlock() {
    if (!this.context) {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) throw new Error('This browser does not support Web Audio. Try a current Safari, Chrome, or Firefox.');
      this.context = new Audio({ latencyHint: 'interactive' });
      this.master = this.context.createGain(); this.master.gain.value = this.volume * .7;
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -13; this.compressor.ratio.value = 6;
      this.master.connect(this.compressor); this.compressor.connect(this.context.destination);
      this.ready ||= this.loadSamples(this.context);
    }
    await this.context.resume();
  }
  get now() { return this.context?.currentTime || 0; }
  async loadSamples(decoder = this.context) {
    const names = ['C', 'Ds', 'Fs', 'A'];
    await Promise.all(Array.from({ length: 5 }, (_, i) => i + 2).flatMap(octave => names.map(async (name, j) => {
      try {
        const r = await fetch(new URL(`${name}${octave}.mp3`,this.assetBaseUrl));
        if (!r.ok) throw new Error('Sample unavailable');
        const buffer = await decoder.decodeAudioData(await r.arrayBuffer());
        this.buffers.set((octave + 1) * 12 + j * 3, buffer);
      } catch { this.sampleFailures++; }
    })));
  }
  setVolume(value) { this.volume = value; if (this.master) this.master.gain.setTargetAtTime(value * .7, this.now, .02); }
  note(midi, { when = this.now, duration = null, velocity = .75, offset = 0, group = 'manual' } = {}) {
    if (!this.context) return null;
    const ctx = this.context, gain = ctx.createGain();
    let source;
    if (this.buffers.size) {
      const nearest = [...this.buffers.keys()].reduce((a, b) => Math.abs(b - midi) < Math.abs(a - midi) ? b : a);
      source = ctx.createBufferSource(); source.buffer = this.buffers.get(nearest);
      source.playbackRate.value = 2 ** ((midi - nearest) / 12);
      offset = Math.min(offset * source.playbackRate.value, source.buffer.duration - .02);
    } else {
      source = ctx.createOscillator(); source.type = 'triangle';
      source.frequency.value = 440 * 2 ** ((midi - 69) / 12); offset = 0;
    }
    when = Math.max(this.now, when);
    gain.gain.setValueAtTime(0, when);
    gain.gain.linearRampToValueAtTime(Math.max(.015, velocity * .4), when + .006);
    gain.gain.exponentialRampToValueAtTime(Math.max(.005, velocity * .13), when + .7);
    source.connect(gain); gain.connect(this.master);
    const voice = { source, gain, group, stopped: false, start: when };
    voice.release = (release = .16, at = this.now) => {
      if (voice.stopped) return;
      voice.stopped = true;
      at = Math.max(this.now, at);
      if (at < when) { try { source.stop(at); } catch {} return; }
      gain.gain.cancelAndHoldAtTime(at);
      gain.gain.setTargetAtTime(.0001, at, Math.max(.006, release / 4));
      try { source.stop(at + release + .02); } catch {}
    };
    source.onended = () => { this.voices.delete(voice); gain.disconnect(); source.disconnect(); };
    this.voices.add(voice);
    source.start(when, offset);
    if (duration !== null) voice.release(.18, when + Math.max(.025, duration));
    return voice;
  }
  stopSong() {
    for (const v of this.voices) if (v.group === 'song') {
      // Scheduled releases also need cancellation when playback is interrupted.
      v.gain.gain.cancelScheduledValues(this.now);
      v.gain.gain.setTargetAtTime(.0001, this.now, .008);
      try { v.source.stop(this.now + .035); } catch {}
      v.stopped = true;
    }
  }
  stopAll() { for (const v of this.voices) { try { v.source.stop(); } catch {} } }
}
