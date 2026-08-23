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

/** 코어 그 자체 + <audio> 엘리먼트 연결 헬퍼. 새 코어 메서드는 자동으로 노출된다 */
export type Conductor = ConductorCore & { attachAudioElement: (el: HTMLAudioElement | null) => void };

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

  // 동기화는 렌더 중 바로 (이펙트를 기다리면 커밋~플러시 사이에 틱/입력이 옛 곡을 본다).
  // 셋 다 identity 가 같으면 no-op 이라 렌더마다 불러도 싸다. 순서: 곡 → 이벤트 (곡 교체 시 reset 뒤 전부 pending)
  core.setSettings(settings);
  core.setSong(song);
  core.setEvents(events);

  // 틱 + 스냅샷
  const [snapshot, setSnapshot] = useState<ConductorSnapshot>(() => core.snapshot());
  useEffect(() => {
    const tick = setInterval(() => core.tick(), 40);
    const snap = setInterval(() => {
      const s = core.snapshot();
      setSnapshot(prev => (
        prev.bar === s.bar && Math.abs(prev.beatInBar - s.beatInBar) < 0.05 && prev.running === s.running && prev.holding === s.holding &&
        prev.mode === s.mode && Math.abs(prev.bpm - s.bpm) < 0.05 && prev.hits === s.hits && prev.misses === s.misses &&
        prev.sectionIndex === s.sectionIndex && prev.nextEventBeat === s.nextEventBeat && prev.judged === s.judged &&
        prev.nextMappingIds.length === s.nextMappingIds.length && prev.nextMappingIds.every((m, i) => m === s.nextMappingIds[i])
      ) ? prev : s);
    }, 100);
    return () => { clearInterval(tick); clearInterval(snap); };
  }, [core]);

  const conductor = useMemo<Conductor>(() => Object.assign(core, {
    attachAudioElement: (el: HTMLAudioElement | null) => core.attachAudio(el ? audioClock(el) : null),
  }), [core]);

  return { conductor, snapshot };
}
