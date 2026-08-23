import { useEffect, useRef, useState } from 'react';
import { midiService } from '../webMidiService';

// MIDI 클럭은 4분음표당 24틱이다.
const TICKS_PER_QUARTER = 24;
// 평균에 쓰는 틱 간격 개수. 48이면 2박 분량이라 흔들림이 충분히 잦아든다.
const WINDOW = 48;
// 화면 갱신 주기. 틱마다 그리면 초당 수십 번 리렌더가 되므로 묶어서 올린다.
const UI_INTERVAL_MS = 250;
// 이 시간 동안 틱이 없으면 DAW 가 멈춘 것으로 본다.
const STALE_MS = 1500;

/**
 * DAW(Studio One)가 보내는 MIDI 클럭에서 현재 템포를 읽는다.
 *
 * Studio One 은 외부 장치 설정의 "MIDI 클럭 보내기"가 켜져 있으면 트랜스포트가
 * 멈춰 있어도 클럭을 계속 흘려보낸다. 그래서 탭 템포로 바꾼 값이 바로 반영된다.
 *
 * 표시 전용이다. 곡의 bpm 은 건드리지 않는다 — APEX 카운트인처럼 샘플과 맞물려
 * 고정돼 있어야 하는 값이 있기 때문이다.
 *
 * 주의: 앱의 출력 포트와 같은 포트를 골라도 된다(클럭 이벤트만 듣고 노트/CC 는
 * 무시하므로 피드백이 생기지 않는다).
 */
export interface DawClockState {
  /** 클럭에서 읽은 BPM. 클럭이 없으면 null */
  bpm: number | null;
  /** 박이 바뀔 때마다 1씩 증가. 화면 LED 를 DAW 박에 물리는 데 쓴다 */
  beat: number;
}

/**
 * @param clockInputId  클럭을 받을 입력 장치
 * @param ticksPerBeat  한 박에 해당하는 틱 수. 4분음표 박이면 24, 8분음표 박(6/8 등)이면 12.
 */
export function useDawClock(clockInputId: string | undefined, ticksPerBeat: number = TICKS_PER_QUARTER): DawClockState {
  const [bpm, setBpm] = useState<number | null>(null);
  const [beat, setBeat] = useState(0);
  const tickTimesRef = useRef<number[]>([]);
  const lastTickRef = useRef<number>(0);
  const tickCountRef = useRef<number>(0);

  useEffect(() => {
    setBpm(null);
    tickTimesRef.current = [];
    lastTickRef.current = 0;
    tickCountRef.current = 0;
    if (!clockInputId) return;

    const input = midiService.getInputById(clockInputId);
    if (!input) return;

    const onClock = () => {
      const now = performance.now();
      lastTickRef.current = now;
      const times = tickTimesRef.current;
      times.push(now);
      if (times.length > WINDOW + 1) times.shift();

      // 박자 단위만큼 틱이 쌓이면 한 박. 여기서 올려 주면 화면이 DAW 박에 위상까지 맞는다.
      tickCountRef.current += 1;
      if (tickCountRef.current >= ticksPerBeat) {
        tickCountRef.current = 0;
        setBeat(b => b + 1);
      }
    };

    // START/CONTINUE 가 오면 박 카운트를 처음부터 다시 센다
    const onStart = () => { tickCountRef.current = 0; setBeat(b => b + 1); };

    input.addListener('clock', onClock);
    input.addListener('start', onStart);
    input.addListener('continue', onStart);

    const timer = setInterval(() => {
      const times = tickTimesRef.current;
      // 한동안 틱이 없으면 끊긴 것으로 본다
      if (lastTickRef.current === 0 || performance.now() - lastTickRef.current > STALE_MS) {
        tickTimesRef.current = [];
        setBpm(prev => (prev === null ? prev : null));
        return;
      }
      if (times.length < 8) return;
      const span = times[times.length - 1] - times[0];
      const intervals = times.length - 1;
      if (span <= 0) return;
      const msPerTick = span / intervals;
      // BPM 은 관례대로 4분음표 기준으로 낸다 (박 단위와 무관하게)
      const next = Math.round((60000 / (msPerTick * TICKS_PER_QUARTER)) * 10) / 10;
      setBpm(prev => (prev === next ? prev : next));
    }, UI_INTERVAL_MS);

    return () => {
      input.removeListener('clock', onClock);
      input.removeListener('start', onStart);
      input.removeListener('continue', onStart);
      clearInterval(timer);
    };
  }, [clockInputId, ticksPerBeat]);

  return { bpm, beat };
}
