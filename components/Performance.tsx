
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Song, ActiveNoteState, InputMapping, SequenceMode, CCMapping } from '../types';
import { LaunchkeyView } from './LaunchkeyView';
import { activeMappingsFor } from '../utils/chart';

interface PerformanceProps {
  song: Song;
  activeNotes: ActiveNoteState[];
  stepPositions: Record<string, number>;
  onTrigger: (mappingId: string, type: 'preset' | 'sequence' | 'switch_scene' | 'toggle_preset', targetId: string, isRelease: boolean, triggerValue: string | number) => void;
  getTogglePresetState?: (presetId: string) => boolean;
  selectedInputId: string;
  onUpdateSong: (song: Song) => void;
  ccStates: Record<string, number>; // key: "channel-cc", value: 0-127
  globalCCMappings?: CCMapping[];
  // App 의 useLiveTriggers 가 들고 있는 눌림 상태 (하이라이트 표시용)
  pressedKeys: Set<string>;
  pressedMidiNotes: Set<string>;
  // DAW 의 MIDI 클럭에서 읽은 실제 템포. 클럭이 없으면 null
  dawBpm?: number | null;
  // DAW 클럭의 박 카운터 (24틱마다 증가). LED 를 DAW 박에 위상까지 맞추는 데 쓴다
  dawBeat?: number;
  // Game 차트가 진행 중일 때 "다음에 누를" 매핑들 — 기기 그림에서 깜빡인다
  expectedMappingIds?: Set<string>;
}

/**
 * 한 마디의 박 수만큼 불을 두고, 현재 박에만 불이 들어오게 한다.
 *
 * 강세는 크기와 색으로 구분한다.
 *  - 1박(강) : 가장 크고 밝게
 *  - 6박처럼 3의 배수인 겹박자는 중간(4박째)을 중강으로 — 6/8 의 강·약·약 / 중강·약·약
 *
 * MIDI 클럭에는 마디 정보가 없어서 1박이 실제 다운비트라는 보장이 없다.
 * 그래서 누르면 그 순간을 1박으로 맞출 수 있게 했다.
 */
const accentOf = (index: number, beats: number): 'strong' | 'medium' | 'weak' => {
  if (index === 0) return 'strong';
  // 6, 9, 12박 같은 겹박자는 3박마다 중강
  if (beats % 3 === 0 && beats > 3 && index % 3 === 0) return 'medium';
  return 'weak';
};

const BeatLeds: React.FC<{
  label: string;
  beats: number;
  pulse: number;          // 박이 바뀔 때마다 증가하는 카운터
  active: boolean;        // 신호가 살아 있는지 (죽으면 전부 소등)
  tone: 'daw' | 'song';
  hint: string;
  onResetDownbeat: () => void;
}> = ({ label, beats, pulse, active, tone, hint, onResetDownbeat }) => {
  const current = ((pulse % beats) + beats) % beats;
  const palette = tone === 'daw'
    ? { strong: 'bg-emerald-200', medium: 'bg-emerald-400', weak: 'bg-emerald-500', glow: '52,211,153' }
    : { strong: 'bg-sky-200', medium: 'bg-sky-400', weak: 'bg-sky-500', glow: '56,189,248' };

  return (
    <button
      onClick={onResetDownbeat}
      title={hint + ' · 눌러서 1박 위치를 맞출 수 있다'}
      className="flex items-center gap-2.5 px-3 py-1.5 rounded-full border border-slate-800 bg-slate-900/60 hover:border-slate-700 transition-colors"
    >
      <span className="text-[9px] font-black uppercase tracking-[0.18em] text-slate-600 w-8 text-left">{label}</span>
      <span className="flex items-end gap-1.5">
        {Array.from({ length: beats }, (_, i) => {
          const accent = accentOf(i, beats);
          const size = accent === 'strong' ? 'w-4 h-4' : accent === 'medium' ? 'w-3 h-3' : 'w-2 h-2';
          const lit = active && i === current;
          return (
            <span
              key={i === current ? `${i}-${pulse}` : i}
              className={`${size} rounded-full ${lit ? palette[accent] : 'bg-slate-700/60'}`}
              style={lit ? {
                animation: 'beatFlash 100ms steps(1,end) forwards',
                boxShadow: `0 0 14px 3px rgba(${palette.glow},0.95)`
              } : undefined}
            />
          );
        })}
      </span>
      {/*
        확 깜빡이도록 페이드를 쓰지 않는다. steps(1,end) 로 켬/끔 두 상태만 두고
        점등 시간을 100ms 로 짧게 잡아 대비를 키웠다.
      */}
      <style>{`
        @keyframes beatFlash {
          from { opacity: 1;    transform: scale(1.5); }
          to   { opacity: 0.12; transform: scale(1); }
        }
      `}</style>
    </button>
  );
};

/** 곡 BPM 으로 자유 진동하는 박 카운터 */
const useFreeRunBeat = (bpm: number, beatUnit: number): number => {
  const [pulse, setPulse] = useState(0);
  useEffect(() => {
    // bpm 은 4분음표 기준이므로 8분음표 박이면 주기가 절반이다
    const ms = (60000 / (bpm || 120)) * (4 / (beatUnit || 4));
    const id = setInterval(() => setPulse(p => p + 1), ms);
    return () => clearInterval(id);
  }, [bpm, beatUnit]);
  return pulse;
};

const DurationBar: React.FC<{ duration: number }> = ({ duration }) => {
  return (
    <div className="absolute bottom-0 left-0 h-1 bg-emerald-500/20 w-full overflow-hidden rounded-b-lg">
      <div 
        className="h-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]"
        style={{ 
          animation: `growWidth ${duration}ms linear forwards` 
        }}
      />
      <style>{`
        @keyframes growWidth {
          from { width: 0%; }
          to { width: 100%; }
        }
      `}</style>
    </div>
  );
};

const Performance: React.FC<PerformanceProps> = ({ song, activeNotes, stepPositions, onTrigger, selectedInputId, onUpdateSong, ccStates, getTogglePresetState, globalCCMappings = [], pressedKeys, pressedMidiNotes, dawBpm, dawBeat, expectedMappingIds }) => {
  // 박자표. 없으면 4/4 로 본다.
  const beatsPerBar = song.beatsPerBar || 4;
  const beatUnit = song.beatUnit || 4;
  const songPulse = useFreeRunBeat(song.bpm, beatUnit);
  // 1박 위치를 손으로 맞추기 위한 오프셋
  const [songOffset, setSongOffset] = useState(0);
  const [dawOffset, setDawOffset] = useState(0);
  // 트리거 표시: 버튼 격자 vs Launchkey 기기 모양(어느 키/패드에 뭐가 걸려 있고 뭐가 눌렸는지)
  const [view, setView] = useState<'device' | 'grid'>(() => (localStorage.getItem('midistage.liveView') as 'device' | 'grid') || 'device');
  useEffect(() => { localStorage.setItem('midistage.liveView', view); }, [view]);

  // 키보드/MIDI 입력 처리는 App 레벨의 useLiveTriggers 로 옮겼다.
  // 어느 탭에 있든 연주가 끊기지 않게 하기 위해서다. 여기서는 표시만 한다.
  const activeScene = useMemo(() =>
    song.scenes.find(s => s.id === song.activeSceneId), 
    [song.scenes, song.activeSceneId]
  );

  const activeMappings = useMemo(() => activeMappingsFor(song), [song.mappings, activeScene]); // eslint-disable-line react-hooks/exhaustive-deps

  const globalMappings = useMemo(() => activeMappings.filter(m => m.scope === 'global'), [activeMappings]);
  const sceneMappings = useMemo(() => activeMappings.filter(m => m.scope === 'scene'), [activeMappings]);

  const getActionName = (type: 'preset' | 'sequence' | 'switch_scene' | 'toggle_preset', id: string) => {
    if (type === 'preset' || type === 'toggle_preset') return song.presets.find(p => p.id === id)?.name || 'Unknown Preset';
    if (type === 'sequence') return song.sequences.find(s => s.id === id)?.name || 'Unknown Sequence';
    return song.scenes.find(s => s.id === id)?.name || 'Unknown Scene';
  };

  const renderMappingButton = (map: InputMapping) => {
    const kAllowed = String(map.keyboardValue).toLowerCase().split(',').map(v => v.trim());
    const isKeyboardActive = kAllowed.some(k => pressedKeys.has(k));
    
    let isMidiActive = false;
    // Check if any pressed MIDI note matches this mapping (considering channel)
    const mappingChannel = map.midiChannel;
    if (map.isMidiRange) {
      isMidiActive = Array.from(pressedMidiNotes).some((noteKey: string) => {
        const [ch, pitch] = noteKey.split('-').map(Number);
        const channelMatch = mappingChannel === 0 || mappingChannel === ch;
        return channelMatch && pitch >= map.midiRangeStart && pitch <= map.midiRangeEnd;
      });
    } else {
      const mAllowed = String(map.midiValue).toLowerCase().split(',').map(v => v.trim());
      isMidiActive = Array.from(pressedMidiNotes).some((noteKey: string) => {
        const [ch, pitch] = noteKey.split('-').map(Number);
        const channelMatch = mappingChannel === 0 || mappingChannel === ch;
        return channelMatch && mAllowed.includes(String(pitch));
      });
    }

    const isActive = isKeyboardActive || isMidiActive;
    
    const triggerDisplay = [];
    if (map.keyboardValue) triggerDisplay.push(`⌨️ ${map.keyboardValue}`);
    if (map.isMidiRange) triggerDisplay.push(`🎹 ${map.midiRangeStart}..${map.midiRangeEnd}`);
    else if (map.midiValue) triggerDisplay.push(`🎹 ${map.midiValue}`);

    // 시퀀스 진행률 데이터
    let sequenceProgress = null;
    if (map.actionType === 'sequence') {
      const seq = song.sequences.find(s => s.id === map.actionTargetId);
      if (seq) {
        const currentPos = stepPositions[seq.id] ?? -1;
        const currentCount = currentPos + 1;
        
        let totalSteps = seq.items.length;
        // GROUP 모드일 경우: 하위 시퀀스가 있으면 그 스텝 수를 합산, 아니면 아이템 수 그대로 사용
        if (seq.mode === SequenceMode.GROUP) {
          const subSeqSteps = seq.items.reduce((acc, item) => {
            if (item.type === 'sequence') {
              const subSeq = song.sequences.find(s => s.id === item.targetId);
              return acc + (subSeq?.items.length || 0);
            }
            return acc;
          }, 0);
          // 하위 시퀀스가 있으면 그 합계 사용, 없으면 아이템 수 그대로
          if (subSeqSteps > 0) {
            totalSteps = subSeqSteps;
          }
        }

        sequenceProgress = {
          current: currentCount,
          total: totalSteps,
          percent: (Math.max(0, currentCount) / totalSteps) * 100
        };
      }
    }

    return (
      <button
        key={map.id}
        onMouseDown={() => onTrigger(map.id, map.actionType, map.actionTargetId, false, 'mouse')}
        onMouseUp={() => onTrigger(map.id, map.actionType, map.actionTargetId, true, 'mouse')}
        className={`h-36 p-4 rounded-2xl flex flex-col items-start justify-between transition-all border-b-4 transform active:translate-y-1 active:border-b-0 ${isActive ? 'bg-indigo-600 border-indigo-800 ring-2 ring-indigo-400 shadow-[0_10px_30px_rgba(99,102,241,0.4)]' : 'bg-slate-800 hover:bg-slate-700 border-slate-900 shadow-xl'}`}
      >
        <div className="flex items-center justify-between w-full">
          <div className="flex flex-col gap-1">
              <div className="flex flex-wrap gap-1">
                {triggerDisplay.map((td, i) => (
                  <span key={i} className="text-[8px] font-black opacity-40 uppercase px-1 bg-slate-950/30 rounded">
                    {td}
                  </span>
                ))}
              </div>
          </div>
          <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-white animate-pulse shadow-[0_0_8px_white]' : 'bg-slate-600'}`}></div>
        </div>
        
        <div className="text-left w-full mt-2 flex-1">
          <p className="text-[8px] font-black uppercase opacity-50 tracking-tighter">{map.actionType.replace('_', ' ')}</p>
          <p className="font-bold truncate text-sm leading-tight text-white mb-2">{getActionName(map.actionType, map.actionTargetId)}</p>
          
          {sequenceProgress && (
            <div className="mt-auto space-y-1">
              <div className="flex justify-between text-[7px] font-black uppercase tracking-widest text-indigo-300">
                <span>{sequenceProgress.current <= 0 ? 'READY' : `Step ${sequenceProgress.current}`} / {sequenceProgress.total}</span>
                <span>{Math.round(sequenceProgress.percent)}%</span>
              </div>
              <div className="h-1 bg-slate-950/40 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-400 transition-all duration-300 shadow-[0_0_8px_rgba(129,140,248,0.5)]" 
                  style={{ width: `${sequenceProgress.percent}%` }} 
                />
              </div>
            </div>
          )}
        </div>
      </button>
    );
  };

  return (
    <div className="h-full flex flex-col gap-10">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-4xl font-black text-white leading-none tracking-tight">{song.name}</h2>
            <div className="mt-3 flex items-center gap-2">
              <span className="px-4 py-1.5 bg-indigo-500/10 rounded-full text-[10px] font-black text-indigo-400 border border-indigo-500/20 uppercase tracking-[0.2em]">
                Tempo: {song.bpm} BPM
              </span>
              {/* DAW 의 MIDI 클럭에서 읽은 실제 템포. 탭 템포로 바꾸면 여기가 따라 움직인다. */}
              <span
                title={dawBpm != null
                  ? 'Studio One 의 MIDI 클럭에서 읽은 템포. 셋리스트 항목에 저장된 템포를 따라가며, 탭 템포로 바꾼 값은 반영되지 않는다(Studio One 동작).'
                  : 'DAW 클럭이 잡히지 않는다. Settings 의 DAW Clock Input 과 Studio One 의 "MIDI 클럭 보내기" 를 확인할 것'}
                className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.2em] border transition-colors ${
                  dawBpm != null
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-slate-800/60 text-slate-600 border-slate-700/60'
                }`}
              >
                {dawBpm != null ? `DAW Clock: ${dawBpm.toFixed(1)} BPM` : 'DAW Clock: —'}
              </span>
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <BeatLeds
                label="Song"
                beats={beatsPerBar}
                pulse={songPulse - songOffset}
                active
                tone="song"
                hint={`곡에 설정된 템포(${song.bpm} BPM · ${beatsPerBar}박)로 자유 진동`}
                onResetDownbeat={() => setSongOffset(songPulse)}
              />
              <BeatLeds
                label="DAW"
                beats={beatsPerBar}
                pulse={(dawBeat ?? 0) - dawOffset}
                active={dawBpm != null}
                tone="daw"
                hint={dawBpm != null ? 'Studio One MIDI 클럭에 위상까지 동기됨' : 'DAW 클럭 없음'}
                onResetDownbeat={() => setDawOffset(dawBeat ?? 0)}
              />
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <div className="flex items-center gap-6">
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">View</span>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
                  {(['device', 'grid'] as const).map(v => (
                    <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === v ? 'bg-slate-700 text-white' : 'text-slate-600 hover:text-slate-400'}`}>
                      {v === 'device' ? '🎹 Launchkey' : '▦ Grid'}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Active Scene</span>
                <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800 shadow-2xl">
                   {song.scenes.map(scene => (
                     <button
                      key={scene.id}
                      onClick={() => onUpdateSong({ ...song, activeSceneId: scene.id })}
                      className={`px-6 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${song.activeSceneId === scene.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:text-slate-400'}`}
                     >
                       {scene.name}
                     </button>
                   ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-12">

          {/* Launchkey 기기 뷰: 어느 키/패드에 뭐가 걸려 있고 지금 뭐가 눌렸는지 */}
          {view === 'device' && (
            <section className="space-y-4">
              <div className="flex items-center gap-4">
                <div className="h-px bg-slate-800 flex-1"></div>
                <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex-shrink-0">Launchkey Mini MK3 · {activeScene?.name}</h3>
                <div className="h-px bg-slate-800 flex-1"></div>
              </div>
              <LaunchkeyView
                song={song}
                pressedKeys={pressedKeys}
                pressedMidiNotes={pressedMidiNotes}
                ccStates={ccStates}
                expectedMappingIds={expectedMappingIds}
                onTrigger={(m, release) => onTrigger(m.id, m.actionType, m.actionTargetId, release, 'mouse')}
              />
            </section>
          )}

          {/* Global Triggers Section */}
          <section className={`space-y-6 ${view === 'device' ? 'hidden' : ''}`}>
            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-800 flex-1"></div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex-shrink-0">Global Triggers</h3>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {globalMappings.map(renderMappingButton)}
              {globalMappings.length === 0 && (
                <div className="col-span-full h-24 border-2 border-dashed border-slate-800/40 rounded-3xl flex items-center justify-center text-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">No global mappings defined</span>
                </div>
              )}
            </div>
          </section>

          {/* Scene Triggers Section */}
          <section className={`space-y-6 ${view === 'device' ? 'hidden' : ''}`}>
            <div className="flex items-center gap-4">
              <div className="h-px bg-slate-800 flex-1"></div>
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em] flex-shrink-0">Scene: {activeScene?.name}</h3>
              <div className="h-px bg-slate-800 flex-1"></div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-4">
              {sceneMappings.map(renderMappingButton)}
              {sceneMappings.length === 0 && (
                <div className="col-span-full h-24 border-2 border-dashed border-slate-800/40 rounded-3xl flex items-center justify-center text-slate-700">
                  <span className="text-[10px] font-black uppercase tracking-widest opacity-40">No mappings active for this scene</span>
                </div>
              )}
            </div>
          </section>

        </div>

        <div className="lg:col-span-4 space-y-6">
          {/* CC Controllers Section */}
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-3xl border border-slate-800 p-6 shadow-inner">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Controllers</h3>
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-amber-500" />
                  <span className="text-[8px] text-slate-600">Global</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-full bg-cyan-500" />
                  <span className="text-[8px] text-slate-600">Song</span>
                </div>
              </div>
            </div>
            
            {/* Modulation Bar (CC 1) */}
            {(() => {
              const isGlobalMapped = globalCCMappings.some(m => m.isEnabled && m.inputCC === 1);
              const isSongMapped = (song.ccMappings || []).some(m => m.isEnabled && m.inputCC === 1);
              const isMapped = isGlobalMapped || isSongMapped;
              return (
                <div className={`mb-6 ${!isMapped ? 'opacity-30' : ''}`}>
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-bold text-slate-400">Modulation</span>
                      {isGlobalMapped && <div className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Global" />}
                      {isSongMapped && <div className="w-1.5 h-1.5 rounded-full bg-cyan-500" title="Song" />}
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">{ccStates['1-1'] ?? 0}</span>
                  </div>
                  <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${isGlobalMapped ? 'bg-gradient-to-r from-amber-500 to-orange-500' : isSongMapped ? 'bg-gradient-to-r from-cyan-500 to-blue-500' : 'bg-slate-600'}`}
                      style={{ width: `${((ccStates['1-1'] ?? 0) / 127) * 100}%` }}
                    />
                  </div>
                </div>
              );
            })()}
            
            {/* 8 Knobs (CC 21-28) */}
            <div className="grid grid-cols-4 gap-3">
              {[21, 22, 23, 24, 25, 26, 27, 28].map((cc, idx) => {
                const value = ccStates[`1-${cc}`] ?? 0;
                const percent = (value / 127) * 100;
                const rotation = -135 + (percent / 100) * 270; // -135 to 135 degrees
                const isGlobalMapped = globalCCMappings.some(m => m.isEnabled && m.inputCC === cc);
                const isSongMapped = (song.ccMappings || []).some(m => m.isEnabled && m.inputCC === cc);
                const isMapped = isGlobalMapped || isSongMapped;
                const gradientId = isGlobalMapped ? 'knobGradientGlobal' : 'knobGradientSong';
                return (
                  <div key={cc} className={`flex flex-col items-center gap-1 ${!isMapped ? 'opacity-30' : ''}`}>
                    <div className="relative w-12 h-12">
                      {/* Knob background - arc from bottom-left to bottom-right (270 degrees, matching knob rotation) */}
                      <svg className="w-full h-full" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round"
                          strokeDasharray="94.2 31.4" transform="rotate(135 24 24)" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke={isMapped ? `url(#${gradientId})` : "#475569"} strokeWidth="4" strokeLinecap="round"
                          strokeDasharray={`${(percent / 100) * 94.2} 125.6`} transform="rotate(135 24 24)" />
                        <defs>
                          <linearGradient id="knobGradientGlobal" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#f59e0b" />
                            <stop offset="100%" stopColor="#f97316" />
                          </linearGradient>
                          <linearGradient id="knobGradientSong" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stopColor="#06b6d4" />
                            <stop offset="100%" stopColor="#8b5cf6" />
                          </linearGradient>
                        </defs>
                      </svg>
                      {/* Knob indicator */}
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div 
                          className="w-8 h-8 rounded-full bg-slate-700 border-2 border-slate-600 flex items-center justify-center shadow-lg"
                          style={{ transform: `rotate(${rotation}deg)` }}
                        >
                          <div className={`w-0.5 h-2 rounded-full -translate-y-1 ${isGlobalMapped ? 'bg-amber-400' : isSongMapped ? 'bg-cyan-400' : 'bg-slate-500'}`} />
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="text-[8px] font-bold text-slate-500">K{idx + 1}</span>
                      {isGlobalMapped && <div className="w-1 h-1 rounded-full bg-amber-500" />}
                      {isSongMapped && <div className="w-1 h-1 rounded-full bg-cyan-500" />}
                    </div>
                    <span className="text-[9px] font-mono text-slate-400">{value}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Live Monitor */}
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-[0.4em]">Live Monitor</h3>
            <div className="flex gap-1">
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></div>
               <div className="w-1.5 h-1.5 rounded-full bg-emerald-500/40"></div>
            </div>
          </div>
          <div className="bg-slate-900/60 backdrop-blur-sm rounded-[40px] border border-slate-800 p-8 min-h-[300px] shadow-inner">
            {activeNotes.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-700 mt-10">
                <svg className="w-12 h-12 mb-3 opacity-10" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                <p className="text-xs font-black uppercase tracking-[0.3em] opacity-30 italic">System Silent</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeNotes.map((an, idx) => (
                  <div key={`${an.pitch}-${an.channel}-${an.startTime}-${idx}`} className="relative flex items-center justify-between p-5 bg-slate-800/80 rounded-2xl border border-indigo-500/20 shadow-2xl overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
                    <div className="flex items-center gap-5 z-10">
                      <div className="w-12 h-12 rounded-xl bg-indigo-500/10 flex items-center justify-center text-indigo-400 font-black text-base border border-indigo-500/20 shadow-inner">
                        {an.pitch}
                      </div>
                      <div>
                        <p className="text-[9px] font-black text-indigo-300 uppercase tracking-widest opacity-60">Channel {an.channel}</p>
                        <p className="text-sm font-black text-white">{midiToNoteName(an.pitch)}</p>
                      </div>
                    </div>
                    <div className="flex gap-2 z-10">
                      <div className="w-1.5 h-8 bg-emerald-500 rounded-full animate-bounce shadow-[0_0_15px_rgba(16,185,129,0.7)]"></div>
                    </div>
                    {an.durationMs && <DurationBar duration={an.durationMs} />}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

const midiToNoteName = (midi: number) => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};

// 지휘자 스냅샷이 10Hz 로 App 을 리렌더하므로, 자기 props 가 안 바뀌면 건너뛴다
export default React.memo(Performance);
