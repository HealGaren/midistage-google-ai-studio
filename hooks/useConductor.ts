import { useEffect, useMemo, useRef, useState } from 'react';
import { Song, ChartSettings } from '../types';
import { ChartEvent } from '../utils/chart';
import { ConductorCore, ConductorSnapshot, ConductorMode, EventStatus, HitFx, AudioClock } from './conductorCore';

export type { ConductorSnapshot, ConductorMode, EventStatus, HitFx };

// ─────────────────────────────────────────────────────────────────────────────
// 지휘자(Conductor) React 어댑터. 규칙은 전부 conductorCore.ts(순수 클래스, 테스트됨)에 있고
// 여기서는 ① 곡/이벤트/설정을 코어에 동기화하고 ② 40ms 틱과 10Hz 스냅샷을 돌리고
// ③ <audio> 엘리먼트를 AudioClock 으로 감싼다.
//
// 반환하는 conductor 는 코어 인스턴스 그 자체(identity 고정) → 트리거 핸들러/리스너가 흔들리지 않는다.
// ─────────────────────────────────────────────────────────────────────────────

export interface Conductor {
  getDisplayPos: (now?: number) => number;
  getRawPos: (now?: number) => number;
  isHolding: () => boolean;
  isRunning: () => boolean;
  getBpm: () => number;
  getMode: () => ConductorMode;
  getCombo: () => number;
  statusOf: (eventId: string) => EventStatus;
  fx: { current: HitFx[] };
  /** 매핑 키를 눌렀다. 엔진을 트리거하기 **전에** 부른다 */
  onPress: (mappingId: string) => ChartEvent | null;
  seekBeat: (beat: number, opts?: { keepRunning?: boolean }) => void;
  seekSection: (index: number) => void;
  syncBar: () => void; syncBeat: () => void;
  nextNote: () => void; prevNote: () => void;
  nextBar: () => void; prevBar: () => void;
  nextSection: () => void; prevSection: () => void;
  toggleRun: () => void; setRunning: (on: boolean) => void; restart: () => void;
  setMode: (mode: ConductorMode) => void;
  attachAudio: (el: HTMLAudioElement | null) => void;
  setAutoStart: (on: boolean) => void;
  nextPending: () => { beat: number; mappingIds: string[] } | null;
  debug: () => Record<string, unknown>;
}

interface Args {
  song: Song;
  events: ChartEvent[];
  settings: ChartSettings;
  setSequenceStep: (seqId: string, idx: number) => void;
}

function audioClock(el: HTMLAudioElement): AudioClock {
  return {
    currentTimeMs: () => el.currentTime * 1000,
    paused: () => el.paused,
    play: () => { el.play().catch(() => {}); },
    pause: () => el.pause(),
    seekMs: ms => { el.currentTime = ms / 1000; },
  };
}

export function useConductor({ song, events, settings, setSequenceStep }: Args): { conductor: Conductor; snapshot: ConductorSnapshot } {
  const stepRef = useRef(setSequenceStep);
  stepRef.current = setSequenceStep;
  const coreRef = useRef<ConductorCore | null>(null);
  if (!coreRef.current) coreRef.current = new ConductorCore(song, events, settings, { setSequenceStep: (id, i) => stepRef.current(id, i) });
  const core = coreRef.current;

  // 동기화 (렌더 중 바로 반영 — 이펙트를 기다리면 같은 렌더의 입력이 옛 설정을 본다)
  core.setSettings(settings);
  useEffect(() => { core.setSong(song); }, [core, song]);
  useEffect(() => { core.setEvents(events); }, [core, events]);

  // 틱 + 스냅샷
  const [snapshot, setSnapshot] = useState<ConductorSnapshot>(() => core.snapshot());
  useEffect(() => {
    const tick = setInterval(() => core.tick(), 40);
    const snap = setInterval(() => {
      const s = core.snapshot();
      setSnapshot(prev => (
        prev.bar === s.bar && Math.abs(prev.beatInBar - s.beatInBar) < 0.05 && prev.running === s.running && prev.holding === s.holding &&
        prev.mode === s.mode && Math.abs(prev.bpm - s.bpm) < 0.05 && prev.hits === s.hits && prev.misses === s.misses &&
        prev.sectionIndex === s.sectionIndex && prev.nextEventBeat === s.nextEventBeat && prev.lastOffsetMs === s.lastOffsetMs &&
        prev.nextMappingIds.length === s.nextMappingIds.length && prev.nextMappingIds.every((m, i) => m === s.nextMappingIds[i])
      ) ? prev : s);
    }, 100);
    return () => { clearInterval(tick); clearInterval(snap); };
  }, [core]);

  const conductor = useMemo<Conductor>(() => ({
    getDisplayPos: now => core.getDisplayPos(now),
    getRawPos: now => core.getRawPos(now),
    isHolding: () => core.isHolding(),
    isRunning: () => core.isRunning(),
    getBpm: () => core.getBpm(),
    getMode: () => core.getMode(),
    getCombo: () => core.getCombo(),
    statusOf: id => core.statusOf(id),
    fx: core.fx,
    onPress: id => core.onPress(id),
    seekBeat: (b, o) => core.seekBeat(b, o),
    seekSection: i => core.seekSection(i),
    syncBar: () => core.syncBar(), syncBeat: () => core.syncBeat(),
    nextNote: () => core.nextNote(), prevNote: () => core.prevNote(),
    nextBar: () => core.nextBar(), prevBar: () => core.prevBar(),
    nextSection: () => core.nextSection(), prevSection: () => core.prevSection(),
    toggleRun: () => core.toggleRun(), setRunning: on => core.setRunning(on), restart: () => core.restart(),
    setMode: m => core.setMode(m),
    attachAudio: el => core.attachAudio(el ? audioClock(el) : null),
    setAutoStart: on => core.setAutoStart(on),
    nextPending: () => core.nextPending(),
    debug: () => core.debug(),
  }), [core]);

  return { conductor, snapshot };
}
