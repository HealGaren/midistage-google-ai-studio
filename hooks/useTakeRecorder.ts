import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Song, ChartTake, ChartTakeEvent } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { emptyChart } from '../utils/chart';

// ─────────────────────────────────────────────────────────────────────────────
// 연주 녹화/재생. "무엇을 언제 눌렀나"(매핑 id + 상대 ms)만 기록한다 — MIDI 가 아니라
// 앱의 트리거 파이프라인 입력이라, 재생하면 엔진과 지휘자가 그때와 똑같이 반응한다.
// 테이크는 곡의 chart.takes 에 저장돼 프로젝트와 함께 남는다(편집/삭제는 ChartEditor).
// ─────────────────────────────────────────────────────────────────────────────

export interface TakeRecorder {
  isRecording: boolean;
  isReplaying: boolean;
  replayingTakeId: string | null;
  takes: ChartTake[];
  startRecording: (startBeat: number) => void;
  stopRecording: () => ChartTake | null;
  /** 트리거가 일어날 때마다 App 이 부른다(녹화 중이 아니면 무시). identity 고정 */
  capture: (ev: Omit<ChartTakeEvent, 't'>) => void;
  replay: (takeId: string, fire: (ev: ChartTakeEvent) => void, onStart?: (startBeat: number) => void) => void;
  stopReplay: () => void;
}

export function useTakeRecorder(song: Song, onUpdateSong: (s: Song) => void): TakeRecorder {
  const songRef = useRef(song);
  songRef.current = song;
  const onUpdateSongRef = useRef(onUpdateSong);
  onUpdateSongRef.current = onUpdateSong;

  const [isRecording, setRecording] = useState(false);
  const [replayingTakeId, setReplayingTakeId] = useState<string | null>(null);
  const recStart = useRef(0);
  const recStartBeat = useRef(0);
  const recEvents = useRef<ChartTakeEvent[]>([]);
  const timers = useRef<number[]>([]);
  // 재생 중 눌렀지만 아직 떼지 않은 것들 — 재생을 중간에 끊어도 노트가 남지 않게 떼 준다
  const replayHeld = useRef<Map<string, ChartTakeEvent>>(new Map());
  const replayFire = useRef<((ev: ChartTakeEvent) => void) | null>(null);

  const startRecording = useCallback((startBeat: number) => {
    recStart.current = performance.now();
    // 시계가 이미 흐르고 있어 0.0003 같은 값이 들어온다. 그대로 두면 재생 시 seek 가
    // "그 앞의 노트"(= 첫 박 노트)를 지나간 것으로 처리하므로 1/4박 격자에 붙인다.
    recStartBeat.current = Math.round(startBeat * 4) / 4;
    recEvents.current = [];
    setRecording(true);
  }, []);

  const capture = useCallback((ev: Omit<ChartTakeEvent, 't'>) => {
    if (!recStart.current) return;
    recEvents.current.push({ ...ev, t: Math.round(performance.now() - recStart.current) });
  }, []);

  const stopRecording = useCallback((): ChartTake | null => {
    if (!recStart.current) return null;
    recStart.current = 0;
    setRecording(false);
    const events = recEvents.current;
    recEvents.current = [];
    if (events.length === 0) return null;
    const s = songRef.current;
    const chart = s.chart || emptyChart();
    const take: ChartTake = {
      id: uuidv4(),
      name: `Take ${(chart.takes?.length || 0) + 1}`,
      createdAt: Date.now(),
      startBeat: recStartBeat.current,
      events,
    };
    onUpdateSongRef.current({ ...s, chart: { ...chart, takes: [...(chart.takes || []), take] } });
    return take;
  }, []);

  const stopReplay = useCallback(() => {
    timers.current.forEach(t => clearTimeout(t));
    timers.current = [];
    // 아직 안 뗀 키를 떼 준다
    const fire = replayFire.current;
    if (fire) replayHeld.current.forEach(ev => fire({ ...ev, release: true }));
    replayHeld.current.clear();
    replayFire.current = null;
    setReplayingTakeId(null);
  }, []);

  const replay = useCallback((takeId: string, fire: (ev: ChartTakeEvent) => void, onStart?: (startBeat: number) => void) => {
    stopReplay();
    const take = songRef.current.chart?.takes?.find(t => t.id === takeId);
    if (!take) return;
    setReplayingTakeId(takeId);
    replayFire.current = fire;
    onStart?.(take.startBeat);
    const last = take.events[take.events.length - 1]?.t || 0;
    take.events.forEach(ev => {
      timers.current.push(window.setTimeout(() => {
        const key = `${ev.mappingId}:${ev.value}`;
        if (ev.release) replayHeld.current.delete(key); else replayHeld.current.set(key, ev);
        fire(ev);
      }, ev.t));
    });
    timers.current.push(window.setTimeout(() => { replayHeld.current.clear(); replayFire.current = null; setReplayingTakeId(null); }, last + 200));
  }, [stopReplay]);

  // 곡이 바뀌면 진행 중인 녹화/재생은 버린다 (언마운트 때도 타이머 정리)
  useEffect(() => () => { timers.current.forEach(t => clearTimeout(t)); }, []);
  useEffect(() => {
    recStart.current = 0; recEvents.current = []; setRecording(false);
    stopReplay();
  }, [song.id, stopReplay]);

  const takes = song.chart?.takes;
  return useMemo(() => ({
    isRecording,
    isReplaying: replayingTakeId !== null,
    replayingTakeId,
    takes: takes || [],
    startRecording, stopRecording, capture, replay, stopReplay,
  }), [isRecording, replayingTakeId, takes, startRecording, stopRecording, capture, replay, stopReplay]);
}
