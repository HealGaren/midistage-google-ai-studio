import { Song, ChartSettings } from '../types';
import { ChartEvent, beatMs as beatMsOf, sectionSpans, sectionAtBeat, totalBeats, SectionSpan } from '../utils/chart';

// ─────────────────────────────────────────────────────────────────────────────
// 지휘자 코어 — React 와 DOM 에 의존하지 않는 순수 상태 기계.
// useConductor 는 이 클래스를 감싸 React 생명주기(곡/이벤트/설정 동기화, 10Hz 스냅샷, 틱)와
// <audio> 엘리먼트를 이어 주기만 한다. 시계·매칭·놓침 규칙은 전부 여기 있어 테스트로 고정한다.
//
// 규칙 요약 (자세한 설명은 useConductor.ts 머리말):
//  • raw     : anchor 에서 추정 템포로 흘러간 위치
//  • display : holdForNotes 면 "다음 노트 + lateWindow" 에서 멈춤
//  • match   : raw 를 쓰되 멈춘 지점 + 한 마디를 넘지 못함
//  • hit     : anchor 를 그 노트로 스냅, 템포는 회귀로 서서히. 같은 박 두 번째 손은 스냅 안 함
//  • miss    : 추월로만. 같은 박 다른 레인은 CHORD_GRACE_MS 유예
//  • audio   : 외부 시계(음원)가 위치를 주고 여기서는 판정만
// ─────────────────────────────────────────────────────────────────────────────

export type ConductorMode = 'live' | 'audio';
export type EventStatus = 'pending' | 'hit' | 'missed' | 'skipped';

export interface HitFx { time: number; mappingId: string; beat: number; kind: 'hit' | 'miss'; offsetMs: number; }

export interface ConductorSnapshot {
  pos: number; bpm: number; running: boolean; holding: boolean; mode: ConductorMode;
  bar: number; beatInBar: number; sectionIndex: number; hits: number; misses: number;
  nextEventBeat: number | null; nextMappingIds: string[]; lastOffsetMs: number | null;
}

/** 음원 모드의 외부 시계. 브라우저에선 <audio>, 테스트에선 가짜 */
export interface AudioClock {
  currentTimeMs: () => number;
  paused: () => boolean;
  play: () => void;
  pause: () => void;
  seekMs: (ms: number) => void;
}

export const CHORD_TOL_BEATS = 0.26;   // 같은 "박"으로 볼 거리
export const CHORD_GRACE_MS = 350;     // 같은 박의 다른 레인을 기다려 주는 시간
const TEMPO_SAMPLES = 8;
const TEMPO_SPAN_MIN_BEATS = 1.5;
const FOLLOW: Record<ChartSettings['tempoFollow'], number> = { off: 0, gentle: 0.35, tight: 0.8 };

export class ConductorCore {
  private now: () => number;
  private setSequenceStep: (seqId: string, idx: number) => void;

  private song!: Song;
  private events: ChartEvent[] = [];
  private settings!: ChartSettings;
  private spans: SectionSpan[] = [];
  private songEnd = 0;
  private beatUnit = 4;
  private bpb = 4;

  private anchorBeat = 0;
  private anchorTime = 0;
  private bpm = 120;
  private running = false;
  private holding = false;
  private mode: ConductorMode = 'live';
  private audio: AudioClock | null = null;
  private autoStart = false;
  private status = new Map<string, EventStatus>();
  private ptr = 0;
  private lastHit: { beat: number; time: number } | null = null;
  private tempoSamples: { beat: number; time: number }[] = [];
  private counts = { hits: 0, misses: 0, combo: 0, bestCombo: 0 };
  private lastOffset: number | null = null;

  /** 렌더러가 그리는 최근 효과. 렌더러가 오래된 것을 잘라낸다 */
  readonly fx: { current: HitFx[] } = { current: [] };

  constructor(song: Song, events: ChartEvent[], settings: ChartSettings, opts: { now?: () => number; setSequenceStep?: (seqId: string, idx: number) => void } = {}) {
    this.now = opts.now || (() => performance.now());
    this.setSequenceStep = opts.setSequenceStep || (() => {});
    this.settings = settings;
    this.anchorTime = this.now();
    this.setSong(song);
    this.setEvents(events);
  }

  // ── 동기화 ──
  setSettings(s: ChartSettings) { this.settings = s; }

  /** 곡이 바뀌면 완전히 리셋 */
  setSong(song: Song) {
    const changed = !this.song || this.song.id !== song.id;
    this.song = song;
    this.beatUnit = song.beatUnit || 4;
    this.bpb = song.beatsPerBar || 4;
    this.spans = sectionSpans(song);
    this.songEnd = totalBeats(song);
    if (changed) this.reset();
    else if (this.mode === 'live') { /* bpm 은 연주 중 추정값을 유지 */ }
  }

  private reset() {
    this.anchorBeat = 0; this.anchorTime = this.now(); this.bpm = this.song.bpm;
    this.running = false; this.holding = false;
    this.status = new Map(this.events.map(e => [e.id, 'pending']));
    this.ptr = 0; this.lastHit = null; this.tempoSamples = []; this.fx.current = [];
    this.counts = { hits: 0, misses: 0, combo: 0, bestCombo: 0 }; this.lastOffset = null;
  }

  /**
   * 이벤트 목록 교체(차트 편집). 이미 있던 이벤트는 상태를 유지한다(기다리던 노트는 계속 기다림).
   * 새로 생긴 이벤트만 화면 위치보다 과거면 skipped.
   */
  setEvents(events: ChartEvent[]) {
    const prev = this.status;
    const next = new Map<string, EventStatus>();
    const pos = this.getDisplayPos();
    events.forEach(e => {
      const old = prev.get(e.id);
      next.set(e.id, old || (e.beat < pos - 0.01 ? 'skipped' : 'pending'));
    });
    this.status = next; this.events = events; this.ptr = 0; this.advancePtr();
  }

  attachAudio(a: AudioClock | null) { this.audio = a; }
  setAutoStart(on: boolean) { this.autoStart = on; }

  // ── 시계 ──
  private beatMs() {
    if (this.mode === 'audio') return beatMsOf(this.song.chart?.audio?.bpm || this.song.bpm, this.beatUnit);
    return beatMsOf(this.bpm, this.beatUnit);
  }

  private advancePtr() {
    while (this.ptr < this.events.length && this.status.get(this.events[this.ptr].id) !== 'pending') this.ptr++;
  }

  getRawPos(now = this.now()): number {
    if (this.mode === 'audio') {
      if (!this.audio) return this.anchorBeat;
      const offset = this.song.chart?.audio?.offsetMs || 0;
      return (this.audio.currentTimeMs() - offset) / this.beatMs();
    }
    if (!this.running) return this.anchorBeat;
    return this.anchorBeat + (now - this.anchorTime) / this.beatMs();
  }

  /** hold 기준이 되는 "다음 노트". 같은 박 유예 중인 노트는 건너뛴다 */
  private holdTargetBeat(now: number): number | null {
    const lh = this.lastHit;
    for (let i = this.ptr; i < this.events.length; i++) {
      const e = this.events[i];
      if (this.status.get(e.id) !== 'pending') continue;
      if (lh && e.beat <= lh.beat + CHORD_TOL_BEATS && now - lh.time < CHORD_GRACE_MS) continue;
      return e.beat;
    }
    return null;
  }

  getDisplayPos(now = this.now()): number {
    const raw = this.getRawPos(now);
    if (this.mode === 'audio' || !this.running || !this.settings.holdForNotes) { this.holding = false; return raw; }
    const target = this.holdTargetBeat(now);
    if (target === null) { this.holding = false; return raw; }
    const holdAt = target + this.settings.lateWindowBeats;
    if (raw >= holdAt) { this.holding = true; return holdAt; }
    this.holding = false;
    return raw;
  }

  private getMatchPos(now: number): number {
    const raw = this.getRawPos(now);
    if (this.mode === 'audio' || !this.running || !this.settings.holdForNotes) return raw;
    const target = this.holdTargetBeat(now);
    if (target === null) return raw;
    return Math.min(raw, target + this.settings.lateWindowBeats + this.bpb);
  }

  private reanchor(beat: number, now: number) { this.anchorBeat = beat; this.anchorTime = now; }

  private markMissed(e: ChartEvent, now: number) {
    this.status.set(e.id, 'missed');
    this.counts.misses++; this.counts.combo = 0;
    this.fx.current.push({ time: now, mappingId: e.mappingId, beat: e.beat, kind: 'miss', offsetMs: 0 });
  }

  private markHit(e: ChartEvent, offsetMs: number, now: number) {
    this.status.set(e.id, 'hit');
    this.counts.hits++; this.counts.combo++; this.counts.bestCombo = Math.max(this.counts.bestCombo, this.counts.combo);
    this.lastOffset = offsetMs;
    this.fx.current.push({ time: now, mappingId: e.mappingId, beat: e.beat, kind: 'hit', offsetMs });
    if (this.settings.driveSequenceSteps && e.sequenceId && e.stepIndex !== undefined) this.setSequenceStep(e.sequenceId, e.stepIndex);
  }

  private missBefore(beat: number, now: number) {
    for (let i = this.ptr; i < this.events.length; i++) {
      if (this.events[i].beat >= beat - 1e-6) break;
      if (this.status.get(this.events[i].id) === 'pending') this.markMissed(this.events[i], now);
    }
    this.advancePtr();
  }

  private syncEngineSteps() {
    if (!this.settings.driveSequenceSteps) return;
    const done = new Set<string>();
    for (let i = this.ptr; i < this.events.length; i++) {
      const e = this.events[i];
      if (!e.sequenceId || e.stepIndex === undefined || done.has(e.sequenceId)) continue;
      if (this.status.get(e.id) !== 'pending') continue;
      this.setSequenceStep(e.sequenceId, e.stepIndex);
      done.add(e.sequenceId);
    }
  }

  private pushTempoSample(beat: number, now: number) {
    const s = this.tempoSamples;
    const prev = s[s.length - 1];
    if (prev && beat > prev.beat && now - prev.time < 0.25 * this.beatMs()) return; // 플램
    s.push({ beat, time: now });
    if (s.length > TEMPO_SAMPLES) s.shift();
  }

  private adaptTempo() {
    const follow = FOLLOW[this.settings.tempoFollow];
    if (!follow) return;
    const s = this.tempoSamples;
    if (s.length < 3) return;
    if (s[s.length - 1].beat - s[0].beat < TEMPO_SPAN_MIN_BEATS) return;
    const n = s.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of s) { sx += p.time; sy += p.beat; sxx += p.time * p.time; sxy += p.time * p.beat; }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return;
    const slope = (n * sxy - sx * sy) / denom; // beats per ms
    if (slope <= 0) return;
    const estBpm = 60000 * (4 / this.beatUnit) * slope;
    const clamped = Math.min(this.song.bpm * 2, Math.max(this.song.bpm * 0.5, estBpm));
    const now = this.now();
    const pos = this.getRawPos(now);
    this.bpm = this.bpm + (clamped - this.bpm) * follow;
    this.reanchor(pos, now);
  }

  // ── 입력 ──
  onPress(mappingId: string): ChartEvent | null {
    const now = this.now();
    const evs = this.events;
    if (evs.length === 0) return null;
    if (this.mode === 'live' && !this.running && !this.autoStart) return null;
    const st = this.settings;
    const raw = this.getMatchPos(now);

    let idx = -1;
    for (let i = this.ptr; i < evs.length; i++) {
      if (evs[i].mappingId === mappingId && this.status.get(evs[i].id) === 'pending') { idx = i; break; }
    }
    if (idx < 0) return null;
    const e = evs[idx];

    if (this.mode === 'audio') {
      if (e.beat > raw + st.earlyWindowBeats || e.beat < raw - st.lateWindowBeats) return null;
      this.markHit(e, (raw - e.beat) * this.beatMs(), now);
      this.advancePtr();
      return e;
    }

    if (e.beat > raw + st.earlyWindowBeats) return null;
    this.markHit(e, (raw - e.beat) * this.beatMs(), now);
    this.missBefore(e.beat - CHORD_TOL_BEATS, now);
    this.advancePtr();
    if (!this.running) this.running = true;
    const sameChord = !!this.lastHit && Math.abs(e.beat - this.lastHit.beat) < CHORD_TOL_BEATS && now - this.lastHit.time < CHORD_GRACE_MS * 2;
    if (!sameChord) {
      this.reanchor(e.beat, now);
      this.pushTempoSample(e.beat, now);
      this.adaptTempo();
      this.lastHit = { beat: e.beat, time: now };
    }
    return e;
  }

  /** 주기적으로 불러야 하는 정리: 같은 박 유예가 끝난 노트 놓침 처리, 음원 모드 자동 놓침, 곡 끝 정지 */
  tick(now = this.now()) {
    if (this.mode === 'audio') {
      if (!this.audio || this.audio.paused()) return;
      this.missBefore(this.getRawPos(now) - this.settings.lateWindowBeats, now);
      return;
    }
    if (this.running && this.songEnd > 0 && this.getDisplayPos(now) >= this.songEnd + this.bpb) this.running = false;
    const lh = this.lastHit;
    if (!lh || now - lh.time < CHORD_GRACE_MS) return;
    for (let i = this.ptr; i < this.events.length; i++) {
      const e = this.events[i];
      if (e.beat > lh.beat + CHORD_TOL_BEATS) break;
      if (this.status.get(e.id) === 'pending') this.markMissed(e, now);
    }
    this.advancePtr();
  }

  // ── 탐색 ──
  seekBeat(beat: number, opts: { keepRunning?: boolean } = {}) {
    const now = this.now();
    const target = Math.max(0, beat);
    this.events.forEach(e => this.status.set(e.id, e.beat < target - 0.02 ? 'skipped' : 'pending'));
    this.ptr = 0; this.advancePtr();
    this.lastHit = null; this.tempoSamples = [];
    this.reanchor(target, now);
    if (opts.keepRunning === false) this.running = false;
    if (this.mode === 'audio' && this.audio) {
      const offset = this.song.chart?.audio?.offsetMs || 0;
      const t = target * this.beatMs() + offset;
      if (Math.abs(this.audio.currentTimeMs() - t) > 30) this.audio.seekMs(Math.max(0, t));
    }
    this.syncEngineSteps();
  }

  seekSection(index: number) {
    const span = this.spans[Math.max(0, Math.min(this.spans.length - 1, index))];
    if (span) this.seekBeat(span.startBeat);
  }

  /** 탭 = "지금이 가장 가까운 unit 경계". 기다리는 중이면 기다리는 노트의 박 기준 */
  private snapTo(unit: number) {
    const now = this.now();
    const pos = this.getDisplayPos(now);
    const base = this.holding ? (this.holdTargetBeat(now) ?? pos) : pos;
    const target = Math.round(base / unit) * unit;
    this.missBefore(target - 1e-6, now);
    this.reanchor(target, now);
    if (!this.running) this.running = true;
    this.pushTempoSample(target, now);
    this.adaptTempo();
    this.syncEngineSteps();
  }
  syncBar() { this.snapTo(this.bpb); }
  syncBeat() { this.snapTo(1); }

  nextNote() {
    const now = this.now();
    const evs = this.events;
    this.advancePtr();
    if (this.ptr >= evs.length) return;
    const e = evs[this.ptr];
    for (let i = this.ptr; i < evs.length; i++) {
      if (evs[i].beat > e.beat + CHORD_TOL_BEATS) break;
      if (this.status.get(evs[i].id) === 'pending') this.status.set(evs[i].id, 'skipped');
    }
    this.advancePtr();
    const nextBeat = this.ptr < evs.length ? evs[this.ptr].beat : e.beat;
    this.lastHit = null;
    this.reanchor(Math.min(nextBeat, e.beat + 1), now);
    this.syncEngineSteps();
  }

  prevNote() {
    const now = this.now();
    const evs = this.events;
    let i = Math.min(this.ptr, evs.length) - 1;
    while (i >= 0 && this.status.get(evs[i].id) === 'pending') i--;
    if (i < 0) { this.seekBeat(0); return; }
    const beat = evs[i].beat;
    for (let j = i; j >= 0; j--) {
      if (evs[j].beat < beat - CHORD_TOL_BEATS) break;
      this.status.set(evs[j].id, 'pending');
    }
    this.ptr = 0; this.advancePtr();
    this.lastHit = null;
    this.reanchor(beat, now);
    this.syncEngineSteps();
  }

  nextBar() { this.seekBeat(Math.floor(this.getDisplayPos() / this.bpb + 1) * this.bpb); }
  prevBar() {
    const pos = this.getDisplayPos();
    const cur = Math.floor(pos / this.bpb) * this.bpb;
    this.seekBeat(pos - cur < 1 ? Math.max(0, cur - this.bpb) : cur);
  }
  private currentSectionIndex(pos: number) { return sectionAtBeat(this.spans, pos)?.index ?? 0; }
  nextSection() { this.seekSection(this.currentSectionIndex(this.getDisplayPos()) + 1); }
  prevSection() {
    const pos = this.getDisplayPos();
    const idx = this.currentSectionIndex(pos);
    const span = this.spans[idx];
    this.seekSection(span && pos - span.startBeat < this.bpb ? idx - 1 : idx);
  }

  // ── 진행 ──
  isRunning() { return this.mode === 'audio' ? !!this.audio && !this.audio.paused() : this.running; }
  isHolding() { return this.holding; }
  getMode() { return this.mode; }
  getBpm() { return this.mode === 'audio' ? (this.song.chart?.audio?.bpm || this.song.bpm) : this.bpm; }
  getCombo() { return this.counts.combo; }
  statusOf(id: string): EventStatus { return this.status.get(id) || 'pending'; }

  setRunning(on: boolean) {
    const now = this.now();
    if (this.mode === 'audio') { if (!this.audio) return; if (on) this.audio.play(); else this.audio.pause(); return; }
    if (on && !this.running) { this.anchorTime = now; this.running = true; }
    else if (!on && this.running) { this.anchorBeat = this.getDisplayPos(now); this.running = false; }
  }
  toggleRun() { this.setRunning(!this.isRunning()); }
  restart() { this.seekBeat(0); this.running = true; this.anchorTime = this.now(); }

  setMode(m: ConductorMode) {
    if (this.mode === m) return;
    const pos = this.getDisplayPos();
    this.mode = m; this.running = false; this.bpm = this.song.bpm;
    this.seekBeat(pos, { keepRunning: false });
  }

  /** 다음에 쳐야 할 노트(들): 첫 pending 과 같은 박 */
  nextPending(): { beat: number; mappingIds: string[] } | null {
    this.advancePtr();
    if (this.ptr >= this.events.length) return null;
    const beat = this.events[this.ptr].beat;
    const ids: string[] = [];
    for (let i = this.ptr; i < this.events.length && this.events[i].beat - beat < CHORD_TOL_BEATS; i++) {
      if (this.status.get(this.events[i].id) === 'pending') ids.push(this.events[i].mappingId);
    }
    return { beat, mappingIds: ids };
  }

  snapshot(now = this.now()): ConductorSnapshot {
    const pos = this.getDisplayPos(now);
    const next = this.nextPending();
    return {
      pos, bpm: this.getBpm(), running: this.isRunning(), holding: this.holding, mode: this.mode,
      bar: Math.floor(pos / this.bpb), beatInBar: pos - Math.floor(pos / this.bpb) * this.bpb,
      sectionIndex: this.currentSectionIndex(pos), hits: this.counts.hits, misses: this.counts.misses,
      nextEventBeat: next?.beat ?? null, nextMappingIds: next?.mappingIds ?? [], lastOffsetMs: this.lastOffset,
    };
  }

  debug(): Record<string, unknown> {
    const now = this.now();
    return {
      raw: this.getRawPos(now), match: this.getMatchPos(now), display: this.getDisplayPos(now), holding: this.holding, running: this.running,
      bpm: this.bpm, autoStart: this.autoStart, anchorBeat: this.anchorBeat, ptr: this.ptr, settings: this.settings, lastHit: this.lastHit,
      samples: this.tempoSamples, holdTarget: this.holdTargetBeat(now), counts: this.counts,
      window: this.events.slice(Math.max(0, this.ptr - 3), this.ptr + 4).map(e => `${e.beat}:${e.mappingId.slice(0, 4)}:${this.status.get(e.id)}`),
    };
  }
}
