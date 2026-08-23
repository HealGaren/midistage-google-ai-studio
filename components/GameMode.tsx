import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Song, ChartSettings, InputMapping } from '../types';
import { Conductor, ConductorSnapshot } from '../hooks/useConductor';
import { TakeRecorder } from '../hooks/useTakeRecorder';
import { ChartEvent, chartLaneMappings, sectionSpans, sectionColor, totalBars, emptyChart } from '../utils/chart';
import { audioUrl } from '../utils/projectStorage';
import { computeLayout, drawHighway } from './game/highwayRenderer';

// ─────────────────────────────────────────────────────────────────────────────
// Game 탭. 캔버스 하이웨이 + 송폼 스트립 + 가사 + 조작 버튼.
// 시계(지휘자)는 App 이 들고 있어 탭을 옮겨도 위치가 유지된다. 여기서는 그리고 조작만.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  song: Song;
  conductor: Conductor;
  snapshot: ConductorSnapshot;
  settings: ChartSettings;
  events: ChartEvent[];
  pressedKeys: Set<string>;
  pressedMidiNotes: Set<string>;
  ccStates: Record<string, number>;
  onUpdateSong: (song: Song) => void;
  recorder: TakeRecorder;
  onReplayTake: (takeId: string) => void;
  activeMappings: InputMapping[];
}

const Btn: React.FC<{ onClick: () => void; title?: string; active?: boolean; danger?: boolean; children: React.ReactNode; className?: string }> = ({ onClick, title, active, danger, children, className = '' }) => (
  <button onClick={onClick} title={title}
    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 border ${
      danger ? 'bg-rose-600 border-rose-700 text-white hover:bg-rose-500'
      : active ? 'bg-indigo-600 border-indigo-500 text-white shadow-lg'
      : 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700 hover:text-white'} ${className}`}>
    {children}
  </button>
);

const GameMode: React.FC<Props> = ({ song, conductor, snapshot: snap, settings, events, pressedKeys, pressedMidiNotes, onUpdateSong, recorder, onReplayTake, activeMappings }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [size, setSize] = useState({ w: 800, h: 500 });
  const [showSettings, setShowSettings] = useState(false);
  const [audioTime, setAudioTime] = useState(0);
  const [audioDur, setAudioDur] = useState(0);
  // 렌더 루프가 매 프레임 읽는 값들은 ref 로 — 키를 누를 때마다 루프를 재시작하지 않게
  const liveRef = useRef({ pressedKeys, pressedMidiNotes, events });
  liveRef.current = { pressedKeys, pressedMidiNotes, events };
  const bpb = song.beatsPerBar || 4;
  const spans = useMemo(() => sectionSpans(song), [song]);
  const bars = totalBars(song);
  const hasChart = !!song.chart && events.length > 0;

  // 레인: 차트가 쓰는 매핑. 차트가 없으면 현재 씬의 매핑 전부(눌림 모니터로라도 쓰이게)
  const laneMappings = useMemo(() => hasChart ? chartLaneMappings(song, events) : activeMappings, [hasChart, song, events, activeMappings]);

  // ── 크기 추적 ──
  useEffect(() => {
    const el = wrapRef.current; if (!el) return;
    const ro = new ResizeObserver(entries => {
      const r = entries[0].contentRect;
      setSize({ w: Math.max(320, Math.floor(r.width)), h: Math.max(240, Math.floor(r.height)) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const layout = useMemo(() => computeLayout(song, laneMappings, size.w, size.h, settings), [song, laneMappings, size, settings]);

  // ── 오디오 연결 ──
  useEffect(() => {
    conductor.attachAudio(audioRef.current);
    return () => conductor.attachAudio(null);
  }, [conductor]);

  // 개발 중 콘솔에서 시계 상태를 들여다보기 위한 핸들 (프로덕션 빌드에는 없음)
  useEffect(() => { if (import.meta.env.DEV) (window as any).__conductor = conductor; }, [conductor]);
  const audioFile = song.chart?.audio?.fileName;
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  const audioSrc = localAudioUrl || (audioFile ? audioUrl(audioFile) : undefined);

  // ── 렌더 루프 ──
  const visPos = useRef(0);
  const lastFrame = useRef(performance.now());
  useEffect(() => {
    const canvas = canvasRef.current; if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = size.w * dpr; canvas.height = size.h * dpr;
    canvas.style.width = `${size.w}px`; canvas.style.height = `${size.h}px`;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    let raf = 0;
    const frame = () => {
      const now = performance.now();
      const dt = Math.min(100, now - lastFrame.current);
      lastFrame.current = now;
      const target = conductor.getDisplayPos(now);
      // 위치 보간: 작은 덜컥거림은 부드럽게, 큰 점프(탐색/스냅)는 즉시
      const diff = target - visPos.current;
      if (Math.abs(diff) > 0.75) visPos.current = target;
      else visPos.current += diff * Math.min(1, dt / 55);
      // 오래된 이펙트 정리
      if (conductor.fx.current.length > 40) conductor.fx.current.splice(0, conductor.fx.current.length - 40);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const live = liveRef.current;
      let nextBeat: number | null = null;
      for (const e of live.events) { if (conductor.statusOf(e.id) === 'pending') { nextBeat = e.beat; break; } }
      drawHighway({
        ctx, W: size.w, H: size.h, song, settings, events: live.events, spans,
        pos: visPos.current, now, holding: conductor.isHolding(), running: conductor.isRunning(),
        statusOf: conductor.statusOf, fx: conductor.fx.current, pressedKeys: live.pressedKeys, pressedMidiNotes: live.pressedMidiNotes,
        lanes: layout.lanes, geometry: layout.geometry, nextEventBeat: nextBeat,
      });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [conductor, size, song, settings, spans, layout]);

  // ── 가사 ──
  const lyrics = song.chart?.lyrics || [];
  const { current: curLyric, next: nextLyric } = useMemo(() => {
    let cur = -1;
    for (let i = 0; i < lyrics.length; i++) if (lyrics[i].beat <= snap.pos + 0.001) cur = i;
    return { current: cur >= 0 ? lyrics[cur] : null, next: lyrics[cur + 1] || null };
  }, [lyrics, snap.pos]);

  const updateSettings = (patch: Partial<ChartSettings>) => {
    const chart = song.chart || emptyChart();
    onUpdateSong({ ...song, chart: { ...chart, settings: { ...(chart.settings || {}), ...patch } } });
  };

  const setMode = useCallback((m: 'live' | 'audio') => conductor.setMode(m), [conductor]);

  const curSpan = spans[snap.sectionIndex];
  const barInSection = curSpan ? Math.floor((snap.pos - curSpan.startBeat) / bpb) + 1 : 0;
  const fmtTime = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

  return (
    <div className="h-full flex flex-col gap-3 -m-8 p-4">
      {/* ── 헤더: 상태 + 송폼 + 조작 ── */}
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-baseline gap-3 min-w-[260px]">
          <h2 className="text-2xl font-black text-white leading-none tracking-tight">{song.name}</h2>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest border ${snap.mode === 'audio' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'}`}>
            {snap.mode === 'audio' ? 'AUDIO' : 'LIVE'}
          </span>
          <span className={`px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest border ${snap.holding ? 'bg-amber-500/15 text-amber-300 border-amber-500/40' : snap.running ? 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30' : 'bg-slate-800 text-slate-500 border-slate-700'}`}>
            {snap.holding ? 'WAITING' : snap.running ? 'RUNNING' : 'STOPPED'}
          </span>
          {recorder.isRecording && <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest bg-rose-600 text-white animate-pulse">● REC</span>}
          {recorder.isReplaying && <span className="px-2 py-0.5 rounded-full text-[9px] font-black tracking-widest bg-sky-600 text-white">▶ REPLAY</span>}
        </div>

        <div className="flex items-center gap-5 text-[11px] font-black uppercase tracking-widest text-slate-400">
          <div><span className="text-slate-600">Bar </span><span className="text-white text-lg tabular-nums">{snap.bar + 1}</span><span className="text-slate-600"> / {bars || '—'}</span>
            <span className="text-slate-500 ml-1 tabular-nums">· {Math.floor(snap.beatInBar) + 1}</span></div>
          <div><span className="text-slate-600">Tempo </span><span className={`text-lg tabular-nums ${Math.abs(snap.bpm - song.bpm) > 0.5 ? 'text-amber-300' : 'text-white'}`}>{snap.bpm.toFixed(1)}</span>
            <span className="text-slate-600 text-[9px]"> / {song.bpm}</span></div>
          {curSpan && <div><span className="text-slate-600">Section </span><span className="text-white" style={{ color: sectionColor(curSpan.section, curSpan.index) }}>{curSpan.section.name}</span><span className="text-slate-500"> {barInSection}/{curSpan.section.bars}</span></div>}
          <div title="히트 / 놓침"><span className="text-emerald-400 tabular-nums">{snap.hits}</span><span className="text-slate-600"> / </span><span className="text-rose-400 tabular-nums">{snap.misses}</span></div>
        </div>

        <div className="flex items-center gap-1.5 ml-auto flex-wrap">
          <Btn onClick={() => setMode(snap.mode === 'live' ? 'audio' : 'live')} active={snap.mode === 'audio'} title="LIVE: 내 연주가 시계 / AUDIO: 원곡 음원이 시계(연습)">{snap.mode === 'live' ? '🎧 Audio' : '🎹 Live'}</Btn>
          <span className="w-px h-6 bg-slate-800 mx-1" />
          <Btn onClick={conductor.syncBar} title="탭 = 지금이 마디 첫 박 (Space)">⏱ Bar</Btn>
          <Btn onClick={conductor.syncBeat} title="탭 = 지금이 박 (Enter)">⏱ Beat</Btn>
          <span className="w-px h-6 bg-slate-800 mx-1" />
          <Btn onClick={conductor.prevSection} title="이전 섹션 (PageUp / 패드 46)">⏮</Btn>
          <Btn onClick={conductor.prevBar} title="이전 마디 (↓)">◀◀</Btn>
          <Btn onClick={conductor.prevNote} title="한 노트 뒤로 (←)">◀</Btn>
          <Btn onClick={conductor.nextNote} title="다음 노트 건너뜀 (→)">▶</Btn>
          <Btn onClick={conductor.nextBar} title="다음 마디 (↑)">▶▶</Btn>
          <Btn onClick={conductor.nextSection} title="다음 섹션 (PageDown / 패드 49)">⏭</Btn>
          <span className="w-px h-6 bg-slate-800 mx-1" />
          <Btn onClick={conductor.restart} title="처음으로 (Home)">⟲ Restart</Btn>
          <Btn onClick={conductor.toggleRun} active={snap.running} title="진행/정지 (Esc)">{snap.running ? '⏸ Stop' : '▶ Run'}</Btn>
          <span className="w-px h-6 bg-slate-800 mx-1" />
          {recorder.isRecording
            ? <Btn onClick={() => recorder.stopRecording()} danger title="녹화 종료">■ Stop Rec</Btn>
            : <Btn onClick={() => recorder.startRecording(conductor.getDisplayPos())} title="지금 위치부터 연주 입력을 녹화">● Rec</Btn>}
          {recorder.isReplaying && <Btn onClick={recorder.stopReplay} danger>■ Stop Replay</Btn>}
          <Btn onClick={() => setShowSettings(s => !s)} active={showSettings} title="표시 설정">⚙</Btn>
        </div>
      </div>

      {/* ── 송폼 스트립 ── */}
      <div className="relative h-9 rounded-xl overflow-hidden border border-slate-800 bg-slate-900 flex select-none">
        {spans.length === 0 && <div className="flex-1 flex items-center justify-center text-[10px] font-black uppercase tracking-widest text-slate-600">Editor → Chart 에서 송폼/패턴을 만들면 여기 표시됩니다</div>}
        {spans.map(s => {
          const c = sectionColor(s.section, s.index);
          const active = s.index === snap.sectionIndex;
          return (
            <button key={s.section.id} onClick={() => conductor.seekSection(s.index)} title={`${s.section.name} · ${s.section.bars} bars (bar ${s.startBar + 1})`}
              style={{ flex: s.section.bars, background: active ? `${c}55` : `${c}22`, borderRight: '1px solid #0f172a' }}
              className="relative h-full px-2 text-left overflow-hidden hover:brightness-125 transition-all">
              <span className="text-[10px] font-black uppercase tracking-wider truncate block" style={{ color: c }}>{s.section.name}</span>
              <span className="text-[8px] font-bold text-slate-400 block -mt-0.5">{s.section.bars}</span>
            </button>
          );
        })}
        {bars > 0 && (
          <div className="absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_8px_white] pointer-events-none transition-[left] duration-100" style={{ left: `${Math.min(100, Math.max(0, (snap.pos / (bars * bpb)) * 100))}%` }} />
        )}
      </div>

      {/* ── 설정 패널 ── */}
      {showSettings && (
        <div className="flex flex-wrap items-center gap-4 px-4 py-3 rounded-2xl bg-slate-900/80 border border-slate-800 text-[10px] font-bold text-slate-300">
          <label className="flex items-center gap-2">Layout
            <select value={settings.layout} onChange={e => updateSettings({ layout: e.target.value as any })} className="bg-slate-800 rounded-lg px-2 py-1 outline-none">
              <option value="device">Launchkey 건반/패드</option><option value="lanes">매핑별 레인</option>
            </select></label>
          <label className="flex items-center gap-2">Lookahead
            <input type="number" min={1} max={8} value={settings.lookaheadBars} onChange={e => updateSettings({ lookaheadBars: Math.max(1, parseInt(e.target.value) || 2) })} className="w-12 bg-slate-800 rounded-lg px-2 py-1 outline-none text-center" /> bars</label>
          <label className="flex items-center gap-2">Tempo follow
            <select value={settings.tempoFollow} onChange={e => updateSettings({ tempoFollow: e.target.value as any })} className="bg-slate-800 rounded-lg px-2 py-1 outline-none">
              <option value="off">off (곡 BPM 고정)</option><option value="gentle">gentle</option><option value="tight">tight</option>
            </select></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.holdForNotes} onChange={e => updateSettings({ holdForNotes: e.target.checked })} /> 노트에서 기다림</label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={settings.showInnerNotes} onChange={e => updateSettings({ showInnerNotes: e.target.checked })} /> 자동 연주 음 표시</label>
          <label className="flex items-center gap-2" title="켜면 노트를 놓치거나 점프한 뒤에도 다음 탭에서 차트가 가리키는 스텝(음)이 난다"><input type="checkbox" checked={settings.driveSequenceSteps} onChange={e => updateSettings({ driveSequenceSteps: e.target.checked })} /> 차트가 시퀀스 스텝 맞춤</label>
          <label className="flex items-center gap-2">Early window
            <input type="number" step={0.25} min={0.25} max={4} value={settings.earlyWindowBeats} onChange={e => updateSettings({ earlyWindowBeats: Math.max(0.25, parseFloat(e.target.value) || 1) })} className="w-14 bg-slate-800 rounded-lg px-2 py-1 outline-none text-center" /> beats</label>
          <label className="flex items-center gap-2">Late window
            <input type="number" step={0.25} min={0} max={2} value={settings.lateWindowBeats} onChange={e => updateSettings({ lateWindowBeats: Math.max(0, parseFloat(e.target.value) || 0.5) })} className="w-14 bg-slate-800 rounded-lg px-2 py-1 outline-none text-center" /> beats</label>
        </div>
      )}

      {/* ── 가사 + 오디오 ── */}
      <div className="flex items-center gap-4 min-h-[44px]">
        <div className="flex-1 flex items-baseline gap-4 px-4 py-2 rounded-2xl bg-slate-900/60 border border-slate-800 overflow-hidden">
          {lyrics.length === 0 ? (
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-700">No lyrics</span>
          ) : (
            <>
              <span className="text-lg font-black text-yellow-200 truncate">{curLyric?.text || '…'}</span>
              <span className="text-xs font-bold text-slate-500 truncate">{nextLyric?.text || ''}</span>
            </>
          )}
        </div>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-2xl border ${snap.mode === 'audio' ? 'bg-emerald-500/5 border-emerald-500/30' : 'bg-slate-900/60 border-slate-800'}`}>
          <audio ref={audioRef} src={audioSrc} preload="auto"
            onTimeUpdate={e => setAudioTime(e.currentTarget.currentTime)}
            onLoadedMetadata={e => setAudioDur(e.currentTarget.duration)}
            onSeeked={e => { if (conductor.getMode() === 'audio') { const off = song.chart?.audio?.offsetMs || 0; const bm = (60000 / (song.chart?.audio?.bpm || song.bpm)) * (4 / (song.beatUnit || 4)); conductor.seekBeat((e.currentTarget.currentTime * 1000 - off) / bm); } }} />
          {audioSrc ? (
            <>
              <Btn onClick={() => { const a = audioRef.current; if (!a) return; if (conductor.getMode() !== 'audio') setMode('audio'); a.paused ? a.play() : a.pause(); }} active={!audioRef.current?.paused}>
                {audioRef.current?.paused === false ? '⏸' : '▶'} {audioFile ? audioFile.replace(/\.[^.]+$/, '').slice(0, 18) : 'local file'}
              </Btn>
              <input type="range" min={0} max={audioDur || 0} step={0.1} value={audioTime} onChange={e => { const a = audioRef.current; if (a) a.currentTime = parseFloat(e.target.value); }} className="w-32 accent-emerald-400" />
              <span className="text-[10px] font-mono text-slate-400 tabular-nums">{fmtTime(audioTime)} / {fmtTime(audioDur)}</span>
            </>
          ) : (
            <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 cursor-pointer hover:text-slate-300" title="이 세션에서만 쓸 음원(저장 안 됨). 저장하려면 Editor → Chart 에서 올리세요">
              + 음원 열기 <input type="file" accept="audio/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) setLocalAudioUrl(URL.createObjectURL(f)); }} />
            </label>
          )}
        </div>
        {recorder.takes.length > 0 && (
          <div className="flex items-center gap-1.5">
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-600">Takes</span>
            {recorder.takes.slice(-4).map(t => (
              <button key={t.id} onClick={() => recorder.replayingTakeId === t.id ? recorder.stopReplay() : onReplayTake(t.id)}
                className={`px-2 py-1 rounded-lg text-[9px] font-black border ${recorder.replayingTakeId === t.id ? 'bg-sky-600 border-sky-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-300 hover:text-white'}`}
                title={`${t.events.length} events · bar ${Math.floor(t.startBeat / bpb) + 1}부터`}>
                {recorder.replayingTakeId === t.id ? '■' : '▶'} {t.name}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── 하이웨이 ── */}
      <div ref={wrapRef} className="flex-1 min-h-0 rounded-3xl overflow-hidden border border-slate-800 relative bg-[#060a14]">
        <canvas ref={canvasRef} className="block" />
        {!hasChart && (
          <div className="absolute inset-x-0 top-6 flex justify-center pointer-events-none">
            <div className="px-5 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-center">
              <p className="text-xs font-black text-white">이 곡에는 아직 차트가 없습니다</p>
              <p className="text-[10px] text-slate-400 mt-1">Editor → <b>Chart</b> 탭에서 송폼(섹션)과 패턴을 만들거나, ● Rec 으로 연주를 녹화한 뒤 패턴으로 변환하세요.<br />지금은 눌린 키만 아래 건반에 표시됩니다.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default GameMode;
