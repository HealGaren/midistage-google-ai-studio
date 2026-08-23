import { useCallback, useEffect, useMemo, useRef, useState, MutableRefObject } from 'react';
import { Song, ChartSettings } from '../types';
import { ChartEvent, beatMs as beatMsOf, sectionSpans, totalBeats } from '../utils/chart';

// ─────────────────────────────────────────────────────────────────────────────
// 지휘자(Conductor): Game 모드의 "지금 곡의 어디쯤인가"를 실시간 연주에 맞춰 유지한다.
//
// 리듬게임과 다른 점 — 템포가 고정이 아니고 연주자가 기준이다.
//
//  • 위치(pos)는 두 개가 있다.
//      raw     : 마지막 기준점(anchor)에서 추정 템포로 흘러간 위치. 매칭에 쓴다.
//      display : 화면에 보여주는 위치. holdForNotes 면 "다음에 눌러야 할 노트 + 여유"에서
//                멈춰 기다린다(노트가 판정선에 걸쳐 대기). 연주자가 쉬면 화면도 쉰다.
//    매칭에 raw 를 쓰는 이유: 한 손(레인)을 건너뛰고 다른 손을 계속 치는 상황에서
//    display 기준으로 매칭하면 영영 멈춰 버린다. raw 는 실제 흐른 시간이라 "지금 친
//    이 키는 차트의 저 노트다"를 자연스럽게 찾아낸다.
//
//  • 노트를 누르면(hit) anchor 를 그 노트의 beat 로 **바로** 옮긴다(늦게/일찍 누른 만큼
//    남은 노트 전체가 밀리거나 당겨진다). 템포는 바로 바꾸지 않고 최근 히트들의 회귀로
//    추정해 천천히 섞는다(탭 템포가 평균을 내듯). tempoFollow 로 강도 조절.
//
//  • 놓침(missed)은 "추월" 로만 생긴다: 더 뒤의 노트를 누르면 그 앞의 대기 노트는 놓친 것.
//    같은 박의 다른 레인(양손 동시)은 한쪽만 눌러도 잠깐(CHORD_GRACE_MS) 기다렸다 놓침
//    처리해 화면이 박마다 덜컥거리지 않게 한다.
//
//  • 음원(audio) 모드에서는 <audio> 가 시계다. 여기서는 판정만 한다(진짜 리듬게임).
//
//  • 시퀀스 레인의 히트/탐색 때 엔진 스텝 인덱스를 차트가 가리키는 값으로 맞춘다.
//    노트를 놓치거나 섹션을 건너뛰어도 다음 탭에서 "맞는 음" 이 나오게 하는 장치.
// ─────────────────────────────────────────────────────────────────────────────

export type ConductorMode = 'live' | 'audio';
export type EventStatus = 'pending' | 'hit' | 'missed' | 'skipped';

export interface HitFx {
  time: number;          // performance.now()
  mappingId: string;
  beat: number;
  kind: 'hit' | 'miss';
  offsetMs: number;      // +늦음 / -빠름 (히트 시점 - 예측 시점)
}

export interface ConductorSnapshot {
  pos: number;
  bpm: number;
  running: boolean;
  holding: boolean;
  mode: ConductorMode;
  bar: number;           // 0-based
  beatInBar: number;     // 0-based, 소수
  sectionIndex: number;
  hits: number;
  misses: number;
  nextEventBeat: number | null;
  lastOffsetMs: number | null;
}

export interface Conductor {
  /** 화면용 위치(hold 적용). 캔버스가 매 프레임 호출 */
  getDisplayPos: (now?: number) => number;
  getRawPos: (now?: number) => number;
  isHolding: () => boolean;
  isRunning: () => boolean;
  getBpm: () => number;
  getMode: () => ConductorMode;
  statusOf: (eventId: string) => EventStatus;
  /** 최근 히트 효과(렌더러가 그린다). 오래된 것은 렌더러가 무시 */
  fx: MutableRefObject<HitFx[]>;
  /** 매핑 키를 눌렀다. 엔진을 트리거하기 **전에** 부른다. 매칭된 이벤트를 돌려준다 */
  onPress: (mappingId: string) => ChartEvent | null;
  seekBeat: (beat: number, opts?: { keepRunning?: boolean }) => void;
  seekSection: (index: number) => void;
  syncBar: () => void;
  syncBeat: () => void;
  nextNote: () => void;
  prevNote: () => void;
  nextBar: () => void;
  prevBar: () => void;
  nextSection: () => void;
  prevSection: () => void;
  toggleRun: () => void;
  setRunning: (on: boolean) => void;
  restart: () => void;
  setMode: (mode: ConductorMode) => void;
  attachAudio: (el: HTMLAudioElement | null) => void;
  /** 디버그용 내부 상태 덤프 */
  debug: () => Record<string, unknown>;
}

const CHORD_TOL_BEATS = 0.26;   // 같은 "박"으로 볼 거리
// 같은 박의 다른 레인을 기다려 주는 시간. 양손이 완전히 동시에 떨어지지 않고 한쪽이
// 2~300ms 늦게 오는 일이 흔해서 넉넉히 잡는다. (늦게 온 손을 "놓침"으로 처리해 버리면
// 차트가 엔진 스텝을 다음 노트로 밀어 엉뚱한 음이 난다.)
const CHORD_GRACE_MS = 350;
const TEMPO_SAMPLES = 8;
const TEMPO_SPAN_MIN_BEATS = 1.5;
const FOLLOW: Record<ChartSettings['tempoFollow'], number> = { off: 0, gentle: 0.35, tight: 0.8 };

interface Args {
  song: Song;
  events: ChartEvent[];
  settings: ChartSettings;
  setSequenceStep: (seqId: string, idx: number) => void;
}

/**
 * 반환값은 둘로 나뉜다:
 *  - conductor : 메서드 묶음. 곡이 바뀔 때만 identity 가 바뀐다 → 트리거 핸들러/리스너가 흔들리지 않는다.
 *  - snapshot  : 10Hz 로 갱신되는 표시용 상태(React 리렌더 유발). 헤더 숫자 등에만 쓴다.
 */
export function useConductor({ song, events, settings, setSequenceStep }: Args): { conductor: Conductor; snapshot: ConductorSnapshot } {
  const beatUnit = song.beatUnit || 4;
  const bpb = song.beatsPerBar || 4;
  const spans = useMemo(() => sectionSpans(song), [song]);
  const songEnd = useMemo(() => totalBeats(song), [song]);

  // ── 핫 상태는 전부 ref. 렌더 루프가 프레임마다 읽는다 ──
  const anchorBeat = useRef(0);
  const anchorTime = useRef(performance.now());
  const bpm = useRef(song.bpm);
  const running = useRef(false);
  const holding = useRef(false);
  const mode = useRef<ConductorMode>('live');
  const audioEl = useRef<HTMLAudioElement | null>(null);
  const status = useRef<Map<string, EventStatus>>(new Map());
  const ptr = useRef(0);                  // 첫 pending 이벤트 인덱스
  const lastHit = useRef<{ beat: number; time: number } | null>(null);
  const tempoSamples = useRef<{ beat: number; time: number }[]>([]);
  const fx = useRef<HitFx[]>([]);
  const counts = useRef({ hits: 0, misses: 0 });
  const lastOffset = useRef<number | null>(null);
  const eventsRef = useRef(events);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const beatMs = useCallback(() => {
    if (mode.current === 'audio') return beatMsOf(song.chart?.audio?.bpm || song.bpm, beatUnit);
    return beatMsOf(bpm.current, beatUnit);
  }, [song.bpm, song.chart?.audio?.bpm, beatUnit]);

  // ── 이벤트 목록이 바뀌면(차트 편집/곡 변경) 상태를 다시 맞춘다 ──
  useEffect(() => {
    const prev = status.current;
    const next = new Map<string, EventStatus>();
    events.forEach(e => next.set(e.id, prev.get(e.id) || 'pending'));
    status.current = next;
    eventsRef.current = events;
    ptr.current = 0;
    advancePtr();
    // 새로 생긴 이벤트 중 현재 위치보다 앞(과거)인 것은 건너뛴 것으로
    const pos = getRawPos();
    events.forEach(e => { if (next.get(e.id) === 'pending' && e.beat < pos - 0.01) next.set(e.id, 'skipped'); });
    advancePtr();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  // 곡이 바뀌면 완전히 리셋
  useEffect(() => {
    anchorBeat.current = 0;
    anchorTime.current = performance.now();
    bpm.current = song.bpm;
    running.current = false;
    holding.current = false;
    status.current = new Map(eventsRef.current.map(e => [e.id, 'pending']));
    ptr.current = 0;
    lastHit.current = null;
    tempoSamples.current = [];
    fx.current = [];
    counts.current = { hits: 0, misses: 0 };
    lastOffset.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [song.id]);

  useEffect(() => { if (mode.current === 'live') bpm.current = song.bpm; }, [song.bpm]);

  // ── 기본 연산 ──
  function advancePtr() {
    const evs = eventsRef.current;
    while (ptr.current < evs.length && status.current.get(evs[ptr.current].id) !== 'pending') ptr.current++;
  }

  function getRawPos(now = performance.now()): number {
    if (mode.current === 'audio') {
      const el = audioEl.current;
      if (!el) return anchorBeat.current;
      const offset = song.chart?.audio?.offsetMs || 0;
      return (el.currentTime * 1000 - offset) / beatMs();
    }
    if (!running.current) return anchorBeat.current;
    return anchorBeat.current + (now - anchorTime.current) / beatMs();
  }

  /** hold 기준이 되는 "다음 노트". 같은 박 유예(chord grace) 중인 노트는 건너뛴다 */
  function holdTargetBeat(now: number): number | null {
    const evs = eventsRef.current;
    const lh = lastHit.current;
    for (let i = ptr.current; i < evs.length; i++) {
      const e = evs[i];
      if (status.current.get(e.id) !== 'pending') continue;
      if (lh && e.beat <= lh.beat + CHORD_TOL_BEATS && now - lh.time < CHORD_GRACE_MS) continue;
      return e.beat;
    }
    return null;
  }

  function getDisplayPos(now = performance.now()): number {
    const raw = getRawPos(now);
    if (mode.current === 'audio' || !running.current || !settingsRef.current.holdForNotes) {
      holding.current = false;
      return raw;
    }
    const target = holdTargetBeat(now);
    if (target === null) { holding.current = false; return raw; }
    const holdAt = target + settingsRef.current.lateWindowBeats;
    if (raw >= holdAt) { holding.current = true; return holdAt; }
    holding.current = false;
    return raw;
  }

  /**
   * 입력 매칭에 쓰는 위치. 기다리는 동안에도 실제 시간은 흐르니 raw 를 쓰되, 멈춘 지점에서
   * 한 마디 이상은 앞서가지 못하게 막는다 — 오래 쉬다가 엉뚱한 키를 눌렀을 때 차트가
   * 몇 마디씩 튀는 것을 막으면서, 건너뛴 손의 다음 노트(다음 마디 정도)는 여전히 잡히게.
   */
  function getMatchPos(now = performance.now()): number {
    const raw = getRawPos(now);
    if (mode.current === 'audio' || !running.current || !settingsRef.current.holdForNotes) return raw;
    const target = holdTargetBeat(now);
    if (target === null) return raw;
    return Math.min(raw, target + settingsRef.current.lateWindowBeats + bpb);
  }

  function reanchor(beat: number, now = performance.now()) {
    anchorBeat.current = beat;
    anchorTime.current = now;
  }

  function markMissed(e: ChartEvent, now: number) {
    status.current.set(e.id, 'missed');
    counts.current.misses++;
    fx.current.push({ time: now, mappingId: e.mappingId, beat: e.beat, kind: 'miss', offsetMs: 0 });
  }

  /** beat 보다 앞에 있는 pending 을 전부 놓친 것으로 */
  function missBefore(beat: number, now: number) {
    const evs = eventsRef.current;
    for (let i = ptr.current; i < evs.length; i++) {
      if (evs[i].beat >= beat - 1e-6) break;
      if (status.current.get(evs[i].id) === 'pending') markMissed(evs[i], now);
    }
    advancePtr();
  }

  /** 탐색 후 각 시퀀스 레인의 다음 pending 노트로 엔진 스텝을 맞춘다 */
  function syncEngineSteps() {
    if (!settingsRef.current.driveSequenceSteps) return;
    const evs = eventsRef.current;
    const done = new Set<string>();
    for (let i = ptr.current; i < evs.length; i++) {
      const e = evs[i];
      if (!e.sequenceId || e.stepIndex === undefined) continue;
      if (done.has(e.sequenceId)) continue;
      if (status.current.get(e.id) !== 'pending') continue;
      setSequenceStep(e.sequenceId, e.stepIndex);
      done.add(e.sequenceId);
    }
  }

  function pushTempoSample(beat: number, now: number) {
    const s = tempoSamples.current;
    const prev = s[s.length - 1];
    // 플램/이중 트리거(두 키가 거의 동시에 같은 레인을 침)는 템포 근거로 쓰지 않는다
    if (prev && beat > prev.beat && now - prev.time < 0.25 * beatMs()) return;
    s.push({ beat, time: now });
    if (s.length > TEMPO_SAMPLES) s.shift();
  }

  /** 최근 히트들의 선형 회귀로 템포 추정 → 설정 강도만큼 섞는다 */
  function adaptTempo() {
    const follow = FOLLOW[settingsRef.current.tempoFollow];
    if (!follow) return;
    const s = tempoSamples.current;
    if (s.length < 3) return;
    const span = s[s.length - 1].beat - s[0].beat;
    if (span < TEMPO_SPAN_MIN_BEATS) return;
    const n = s.length;
    let sx = 0, sy = 0, sxx = 0, sxy = 0;
    for (const p of s) { sx += p.time; sy += p.beat; sxx += p.time * p.time; sxy += p.time * p.beat; }
    const denom = n * sxx - sx * sx;
    if (denom === 0) return;
    const slope = (n * sxy - sx * sy) / denom; // beats per ms
    if (slope <= 0) return;
    const estBeatMs = 1 / slope;
    // beatMs = 60000/bpm · 4/beatUnit  ⇒  bpm = 60000 · (4/beatUnit) / beatMs
    const estBpm = 60000 * (4 / beatUnit) / estBeatMs;
    // 엉뚱한 입력으로 튀지 않게 곡 BPM 의 절반~2배로 제한
    const clamped = Math.min(song.bpm * 2, Math.max(song.bpm * 0.5, estBpm));
    const now = performance.now();
    const pos = getRawPos(now);
    bpm.current = bpm.current + (clamped - bpm.current) * follow;
    reanchor(pos, now); // 템포가 바뀌어도 위치는 연속
  }

  // ── 입력 ──
  const onPress = useCallback((mappingId: string): ChartEvent | null => {
    const now = performance.now();
    const evs = eventsRef.current;
    if (evs.length === 0) return null;
    const st = settingsRef.current;
    const raw = getMatchPos(now);

    // 이 레인의 첫 pending
    let idx = -1;
    for (let i = ptr.current; i < evs.length; i++) {
      if (evs[i].mappingId !== mappingId) continue;
      if (status.current.get(evs[i].id) !== 'pending') continue;
      idx = i; break;
    }
    if (idx < 0) return null;
    const e = evs[idx];

    if (mode.current === 'audio') {
      if (e.beat > raw + st.earlyWindowBeats || e.beat < raw - st.lateWindowBeats) return null;
      status.current.set(e.id, 'hit');
      counts.current.hits++;
      const offsetMs = (raw - e.beat) * beatMs();
      lastOffset.current = offsetMs;
      fx.current.push({ time: now, mappingId, beat: e.beat, kind: 'hit', offsetMs });
      advancePtr();
      if (st.driveSequenceSteps && e.sequenceId && e.stepIndex !== undefined) setSequenceStep(e.sequenceId, e.stepIndex);
      return e;
    }

    // live: 너무 이른 노트는 무시(오타로 앞으로 튀지 않게)
    if (e.beat > raw + st.earlyWindowBeats) return null;

    const offsetMs = (raw - e.beat) * beatMs();
    lastOffset.current = offsetMs;
    status.current.set(e.id, 'hit');
    counts.current.hits++;
    fx.current.push({ time: now, mappingId, beat: e.beat, kind: 'hit', offsetMs });
    missBefore(e.beat - CHORD_TOL_BEATS, now);   // 추월한 것은 놓침. 같은 박은 유예
    advancePtr();
    if (!running.current) running.current = true; // 첫 노트를 치면 자동 시작
    // 같은 박(양손 동시 화음)의 두 번째 손은 시계를 다시 맞추지 않는다 — 첫 손이 기준.
    // 그러지 않으면 늦게 온 손 때문에 화면이 뒤로 찔끔 물러난다.
    const sameChord = !!lastHit.current && Math.abs(e.beat - lastHit.current.beat) < CHORD_TOL_BEATS && now - lastHit.current.time < CHORD_GRACE_MS * 2;
    if (!sameChord) {
      reanchor(e.beat, now);
      pushTempoSample(e.beat, now);
      adaptTempo();
      lastHit.current = { beat: e.beat, time: now };
    }
    if (st.driveSequenceSteps && e.sequenceId && e.stepIndex !== undefined) setSequenceStep(e.sequenceId, e.stepIndex);
    return e;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatMs, setSequenceStep]);

  // 같은 박 유예가 끝난 노트를 놓침 처리 + 음원 모드의 자동 놓침
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const evs = eventsRef.current;
      if (mode.current === 'audio') {
        if (!audioEl.current || audioEl.current.paused) return;
        const raw = getRawPos(now);
        missBefore(raw - settingsRef.current.lateWindowBeats, now);
        return;
      }
      const lh = lastHit.current;
      if (!lh || now - lh.time < CHORD_GRACE_MS) return;
      for (let i = ptr.current; i < evs.length; i++) {
        const e = evs[i];
        if (e.beat > lh.beat + CHORD_TOL_BEATS) break;
        if (status.current.get(e.id) === 'pending') markMissed(e, now);
      }
      advancePtr();
    }, 40);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── 탐색 ──
  const seekBeat = useCallback((beat: number, opts: { keepRunning?: boolean } = {}) => {
    const now = performance.now();
    const target = Math.max(0, beat);
    const evs = eventsRef.current;
    // 목표 지점 "바로 위"의 노트는 아직 칠 것으로 본다(부동소수/살짝 흐른 시계 때문에 놓치지 않게)
    evs.forEach(e => {
      status.current.set(e.id, e.beat < target - 0.02 ? 'skipped' : 'pending');
    });
    ptr.current = 0;
    advancePtr();
    lastHit.current = null;
    tempoSamples.current = [];
    reanchor(target, now);
    if (opts.keepRunning === false) running.current = false;
    if (mode.current === 'audio' && audioEl.current) {
      const offset = song.chart?.audio?.offsetMs || 0;
      const t = (target * beatMs() + offset) / 1000;
      if (Math.abs(audioEl.current.currentTime - t) > 0.03) audioEl.current.currentTime = Math.max(0, t);
    }
    syncEngineSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [beatMs, song.chart?.audio?.offsetMs]);

  const seekSection = useCallback((index: number) => {
    const span = spans[Math.max(0, Math.min(spans.length - 1, index))];
    if (span) seekBeat(span.startBeat);
  }, [spans, seekBeat]);

  const snapTo = useCallback((unit: number) => {
    // 탭 = "지금이 가장 가까운 unit 경계다". 마디/박 싱크 공용.
    // 화면에 보이는 위치 기준(기다리는 중이면 멈춘 자리). 위상만 맞추는 용도 — 마디 단위
    // 이동은 nudge 로.
    const now = performance.now();
    const pos = getDisplayPos(now);
    const target = Math.round(pos / unit) * unit;
    missBefore(target - 1e-6, now);
    reanchor(target, now);
    if (!running.current) running.current = true;
    pushTempoSample(target, now);
    adaptTempo();
    syncEngineSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const syncBar = useCallback(() => snapTo(bpb), [snapTo, bpb]);
  const syncBeat = useCallback(() => snapTo(1), [snapTo]);

  const nextNote = useCallback(() => {
    const now = performance.now();
    const evs = eventsRef.current;
    advancePtr();
    if (ptr.current >= evs.length) return;
    const e = evs[ptr.current];
    // 그 박의 노트들을 전부 건너뛴다(양손 동시면 둘 다)
    for (let i = ptr.current; i < evs.length; i++) {
      if (evs[i].beat > e.beat + CHORD_TOL_BEATS) break;
      if (status.current.get(evs[i].id) === 'pending') status.current.set(evs[i].id, 'skipped');
    }
    advancePtr();
    const nextBeat = ptr.current < evs.length ? evs[ptr.current].beat : e.beat;
    lastHit.current = null;
    reanchor(Math.min(nextBeat, e.beat + 1), now);
    syncEngineSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const prevNote = useCallback(() => {
    const now = performance.now();
    const evs = eventsRef.current;
    // ptr 앞쪽에서 마지막으로 처리된 노트를 찾아 그 박 전체를 다시 pending 으로
    let i = Math.min(ptr.current, evs.length) - 1;
    while (i >= 0 && status.current.get(evs[i].id) === 'pending') i--;
    if (i < 0) { seekBeat(0); return; }
    const beat = evs[i].beat;
    for (let j = i; j >= 0; j--) {
      if (evs[j].beat < beat - CHORD_TOL_BEATS) break;
      status.current.set(evs[j].id, 'pending');
    }
    ptr.current = 0;
    advancePtr();
    lastHit.current = null;
    reanchor(beat, now);
    syncEngineSteps();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekBeat]);

  // 마디/섹션 이동은 화면에 보이는 위치 기준(기다리는 중이면 멈춘 자리)
  const nextBar = useCallback(() => seekBeat(Math.floor(getDisplayPos() / bpb + 1) * bpb), [seekBeat, bpb]);
  const prevBar = useCallback(() => {
    const pos = getDisplayPos();
    const cur = Math.floor(pos / bpb) * bpb;
    // 마디 첫 박 근처면 이전 마디로, 아니면 이 마디 처음으로
    seekBeat(pos - cur < 1 ? Math.max(0, cur - bpb) : cur);
  }, [seekBeat, bpb]);

  const currentSectionIndex = useCallback((pos: number) => {
    let idx = 0;
    for (let i = 0; i < spans.length; i++) if (pos >= spans[i].startBeat) idx = i;
    return idx;
  }, [spans]);

  const nextSection = useCallback(() => seekSection(currentSectionIndex(getDisplayPos()) + 1), [seekSection, currentSectionIndex]);
  const prevSection = useCallback(() => {
    const pos = getDisplayPos();
    const idx = currentSectionIndex(pos);
    const span = spans[idx];
    seekSection(span && pos - span.startBeat < bpb ? idx - 1 : idx);
  }, [seekSection, currentSectionIndex, spans, bpb]);

  const setRunning = useCallback((on: boolean) => {
    const now = performance.now();
    if (mode.current === 'audio') {
      const el = audioEl.current;
      if (!el) return;
      if (on) el.play().catch(() => {}); else el.pause();
      return;
    }
    if (on && !running.current) { anchorTime.current = now; running.current = true; }
    else if (!on && running.current) { anchorBeat.current = getDisplayPos(now); running.current = false; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggleRun = useCallback(() => {
    const on = mode.current === 'audio' ? !!audioEl.current?.paused : !running.current;
    setRunning(on);
  }, [setRunning]);

  const restart = useCallback(() => { seekBeat(0); running.current = true; anchorTime.current = performance.now(); }, [seekBeat]);

  const setMode = useCallback((m: ConductorMode) => {
    if (mode.current === m) return;
    const pos = getDisplayPos();
    mode.current = m;
    running.current = false;
    bpm.current = song.bpm;
    seekBeat(pos, { keepRunning: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekBeat, song.bpm]);

  const attachAudio = useCallback((el: HTMLAudioElement | null) => { audioEl.current = el; }, []);

  const statusOf = useCallback((id: string): EventStatus => status.current.get(id) || 'pending', []);

  // ── React 용 스냅샷 (10Hz). 캔버스는 ref 를 직접 읽는다 ──
  const [snapshot, setSnapshot] = useState<ConductorSnapshot>(() => ({
    pos: 0, bpm: song.bpm, running: false, holding: false, mode: 'live', bar: 0, beatInBar: 0, sectionIndex: 0, hits: 0, misses: 0, nextEventBeat: null, lastOffsetMs: null,
  }));
  useEffect(() => {
    const id = setInterval(() => {
      const now = performance.now();
      const pos = getDisplayPos(now);
      const evs = eventsRef.current;
      const next = ptr.current < evs.length ? evs[ptr.current].beat : null;
      const isRunning = mode.current === 'audio' ? !!audioEl.current && !audioEl.current.paused : running.current;
      const snap: ConductorSnapshot = {
        pos,
        bpm: mode.current === 'audio' ? (song.chart?.audio?.bpm || song.bpm) : bpm.current,
        running: isRunning,
        holding: holding.current,
        mode: mode.current,
        bar: Math.floor(pos / bpb),
        beatInBar: pos - Math.floor(pos / bpb) * bpb,
        sectionIndex: currentSectionIndex(pos),
        hits: counts.current.hits,
        misses: counts.current.misses,
        nextEventBeat: next,
        lastOffsetMs: lastOffset.current,
      };
      setSnapshot(prev => (
        prev.bar === snap.bar && Math.abs(prev.beatInBar - snap.beatInBar) < 0.05 && prev.running === snap.running && prev.holding === snap.holding &&
        prev.mode === snap.mode && Math.abs(prev.bpm - snap.bpm) < 0.05 && prev.hits === snap.hits && prev.misses === snap.misses &&
        prev.sectionIndex === snap.sectionIndex && prev.nextEventBeat === snap.nextEventBeat && prev.lastOffsetMs === snap.lastOffsetMs
      ) ? prev : snap);
    }, 100);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bpb, currentSectionIndex, song.bpm, song.chart?.audio?.bpm]);

  // 곡 끝에 도달하면 멈춘다(라이브 모드). 루프는 섹션 점프로.
  useEffect(() => {
    if (mode.current !== 'live' || !running.current || songEnd <= 0) return;
    if (snapshot.pos >= songEnd + bpb) running.current = false;
  }, [snapshot.pos, songEnd, bpb]);

  const conductor = useMemo<Conductor>(() => ({
    getDisplayPos, getRawPos,
    isHolding: () => holding.current,
    isRunning: () => (mode.current === 'audio' ? !!audioEl.current && !audioEl.current.paused : running.current),
    getBpm: () => (mode.current === 'audio' ? (song.chart?.audio?.bpm || song.bpm) : bpm.current),
    getMode: () => mode.current,
    statusOf, fx, onPress, seekBeat, seekSection, syncBar, syncBeat, nextNote, prevNote, nextBar, prevBar, nextSection, prevSection,
    toggleRun, setRunning, restart, setMode, attachAudio,
    debug: () => {
      const now = performance.now();
      const evs = eventsRef.current;
      return {
        raw: getRawPos(now), display: getDisplayPos(now), holding: holding.current, running: running.current, bpm: bpm.current,
        anchorBeat: anchorBeat.current, ptr: ptr.current, settings: settingsRef.current, lastHit: lastHit.current,
        samples: tempoSamples.current, holdTarget: holdTargetBeat(now),
        window: evs.slice(Math.max(0, ptr.current - 3), ptr.current + 4).map(e => `${e.beat}:${e.mappingId.slice(0, 4)}:${status.current.get(e.id)}`),
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [onPress, seekBeat, seekSection, syncBar, syncBeat, nextNote, prevNote, nextBar, prevBar, nextSection, prevSection, toggleRun, setRunning, restart, setMode, attachAudio, statusOf, song.bpm, song.chart?.audio?.bpm]);

  return { conductor, snapshot };
}
