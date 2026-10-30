/** Look-ahead scheduling for audio; UI reads exactly the same musical position. */
export class PianoTransport extends EventTarget {
  constructor(audio) {
    super(); this.audio = audio; this.notes = []; this.duration = 0;
    this.position = 0; this.playing = false; this.speed = 1; this.anchor = 0;
    this.next = 0; this.timer = null; this.lastScheduled = -1;
  }
  load(notes) {
    this.pause(); this.notes = notes; this.duration = Math.max(...notes.map(n => n.time + n.duration), 0);
    this.position = 0; this.next = 0; this.emit();
  }
  get time() { return this.playing ? Math.min(this.duration, this.position + Math.max(0, this.audio.now - this.anchor) * this.speed) : this.position; }
  start() {
    if (!this.notes.length || this.playing) return;
    if (this.position >= this.duration - .01) this.position = 0;
    this.anchor = this.audio.now + .025; this.playing = true;
    this.next = this.notes.findIndex(n => n.time >= this.position);
    if (this.next < 0) this.next = this.notes.length;
    for (const n of this.notes) if (n.time < this.position && n.time + n.duration > this.position) {
      this.audio.note(n.midi, { when: this.anchor, duration: (n.time + n.duration - this.position) / this.speed, offset: (this.position - n.time) / this.speed, velocity: n.velocity, group: 'song' });
    }
    this.schedule(); this.timer = setInterval(() => this.schedule(), 20); this.emit();
  }
  schedule() {
    if (!this.playing) return;
    const until = this.time + .09 * this.speed;
    while (this.next < this.notes.length && this.notes[this.next].time <= until) {
      const n = this.notes[this.next++];
      const when = this.anchor + (n.time - this.position) / this.speed;
      this.audio.note(n.midi, { when, duration: n.duration / this.speed, velocity: n.velocity, group: 'song' });
    }
    if (this.time >= this.duration) { this.pause(); this.position = this.duration; this.emit(); }
  }
  pause() {
    this.position = Math.max(0, this.time); this.playing = false;
    clearInterval(this.timer); this.timer = null; this.audio.stopSong(); this.emit();
  }
  seek(time) { const resume = this.playing; this.pause(); this.position = Math.max(0, Math.min(this.duration, time)); if (resume) this.start(); else this.emit(); }
  setSpeed(speed) { const resume = this.playing; this.pause(); this.speed = speed; if (resume) this.start(); else this.emit(); }
  emit() { this.dispatchEvent(new Event('change')); }
}
