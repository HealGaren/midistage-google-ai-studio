
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Song, ActiveNoteState, InputMapping, SequenceMode } from '../types';
import { midiService } from '../webMidiService';

interface PerformanceProps {
  song: Song;
  activeNotes: ActiveNoteState[];
  stepPositions: Record<string, number>;
  onTrigger: (mappingId: string, type: 'preset' | 'sequence' | 'switch_scene', targetId: string, isRelease: boolean, triggerValue: string | number) => void;
  selectedInputId: string;
  onUpdateSong: (song: Song) => void;
  ccStates: Record<string, number>; // key: "channel-cc", value: 0-127
}

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

const Performance: React.FC<PerformanceProps> = ({ song, activeNotes, stepPositions, onTrigger, selectedInputId, onUpdateSong, ccStates }) => {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  // Store as "channel-pitch" string to include channel info
  const [pressedMidiNotes, setPressedMidiNotes] = useState<Set<string>>(new Set());

  const activeScene = useMemo(() => 
    song.scenes.find(s => s.id === song.activeSceneId), 
    [song.scenes, song.activeSceneId]
  );

  const activeMappings = useMemo(() => {
    return song.mappings.filter(m => 
      m.isEnabled && 
      (m.scope === 'global' || (activeScene && activeScene.mappingIds.includes(m.id)))
    );
  }, [song.mappings, activeScene]);

  const globalMappings = useMemo(() => activeMappings.filter(m => m.scope === 'global'), [activeMappings]);
  const sceneMappings = useMemo(() => activeMappings.filter(m => m.scope === 'scene'), [activeMappings]);

  const findMappings = useCallback((type: 'keyboard' | 'midi', value: string | number, channel?: number) => {
    return activeMappings.filter(m => {
      if (type === 'keyboard') {
        const triggerStr = String(m.keyboardValue).toLowerCase();
        const inputStr = String(value).toLowerCase();
        const allowedValues = triggerStr.split(',').map(v => v.trim());
        return allowedValues.includes(inputStr);
      } else {
        if (channel !== undefined) {
          const channelMatch = m.midiChannel === 0 || m.midiChannel === channel;
          if (!channelMatch) return false;
        }

        if (m.isMidiRange) {
          const numValue = Number(value);
          return numValue >= m.midiRangeStart && numValue <= m.midiRangeEnd;
        } else {
          const triggerStr = String(m.midiValue).toLowerCase();
          const inputStr = String(value).toLowerCase();
          const allowedValues = triggerStr.split(',').map(v => v.trim());
          return allowedValues.includes(inputStr);
        }
      }
    });
  }, [activeMappings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const mappings = findMappings('keyboard', e.key);
      if (mappings.length > 0) {
        setPressedKeys(prev => new Set(prev).add(e.key.toLowerCase()));
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false, e.key));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const mappings = findMappings('keyboard', e.key);
      if (mappings.length > 0) {
        setPressedKeys(prev => { 
          const next = new Set(prev); 
          next.delete(e.key.toLowerCase()); 
          return next; 
        });
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true, e.key));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [findMappings, onTrigger]);

  useEffect(() => {
    const input = midiService.getInputById(selectedInputId);
    if (!input) return;
    
    const onNoteOn = (e: any) => {
      const pitch = e.note.number;
      const channel = e.message.channel;
      const noteKey = `${channel}-${pitch}`;
      console.log(`[MIDI IN] NoteOn CH:${channel} Note:${pitch}`);
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length > 0) {
        console.log(`[MIDI MATCH] Found ${mappings.length} mapping(s):`, mappings.map(m => `${m.keyboardValue}(CH:${m.midiChannel})`));
        setPressedMidiNotes(prev => new Set(prev).add(noteKey));
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false, pitch));
      }
    };
    
    const onNoteOff = (e: any) => {
      const pitch = e.note.number;
      const channel = e.message.channel;
      const noteKey = `${channel}-${pitch}`;
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length > 0) {
        setPressedMidiNotes(prev => {
          const next = new Set(prev);
          next.delete(noteKey);
          return next;
        });
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true, pitch));
      }
    };
    
    input.addListener('noteon', onNoteOn);
    input.addListener('noteoff', onNoteOff);
    return () => { input.removeListener('noteon', onNoteOn); input.removeListener('noteoff', onNoteOff); };
  }, [selectedInputId, findMappings, onTrigger]);

  const getActionName = (type: 'preset' | 'sequence' | 'switch_scene', id: string) => {
    if (type === 'preset') return song.presets.find(p => p.id === id)?.name || 'Unknown Preset';
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
            <div className="mt-3 flex gap-2">
              <span className="px-4 py-1.5 bg-indigo-500/10 rounded-full text-[10px] font-black text-indigo-400 border border-indigo-500/20 uppercase tracking-[0.2em]">
                Tempo: {song.bpm} BPM
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-3">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.3em]">Active Scene</span>
            <div className="flex bg-slate-900 p-2 rounded-2xl border border-slate-800 shadow-2xl">
               {song.scenes.map(scene => (
                 <button 
                  key={scene.id} 
                  onClick={() => onUpdateSong({ ...song, activeSceneId: scene.id })}
                  className={`px-8 py-2.5 rounded-xl text-[11px] font-black uppercase transition-all ${song.activeSceneId === scene.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:text-slate-400'}`}
                 >
                   {scene.name}
                 </button>
               ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className="lg:col-span-8 space-y-12">
          
          {/* Global Triggers Section */}
          <section className="space-y-6">
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
          <section className="space-y-6">
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
              <span className="text-[9px] text-slate-600">CH 1</span>
            </div>
            
            {/* Modulation Bar (CC 1) */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[9px] font-bold text-slate-400">Modulation</span>
                <span className="text-[10px] font-mono text-slate-500">{ccStates['1-1'] ?? 0}</span>
              </div>
              <div className="h-3 bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full"
                  style={{ width: `${((ccStates['1-1'] ?? 0) / 127) * 100}%` }}
                />
              </div>
            </div>
            
            {/* 8 Knobs (CC 21-28) */}
            <div className="grid grid-cols-4 gap-3">
              {[21, 22, 23, 24, 25, 26, 27, 28].map((cc, idx) => {
                const value = ccStates[`1-${cc}`] ?? 0;
                const percent = (value / 127) * 100;
                const rotation = -135 + (percent / 100) * 270; // -135 to 135 degrees
                return (
                  <div key={cc} className="flex flex-col items-center gap-1">
                    <div className="relative w-12 h-12">
                      {/* Knob background */}
                      <svg className="w-full h-full" viewBox="0 0 48 48">
                        <circle cx="24" cy="24" r="20" fill="none" stroke="#334155" strokeWidth="4" strokeLinecap="round"
                          strokeDasharray="110 47" transform="rotate(135 24 24)" />
                        <circle cx="24" cy="24" r="20" fill="none" stroke="url(#knobGradient)" strokeWidth="4" strokeLinecap="round"
                          strokeDasharray={`${percent * 1.1} 157`} transform="rotate(135 24 24)" />
                        <defs>
                          <linearGradient id="knobGradient" x1="0%" y1="0%" x2="100%" y2="0%">
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
                          <div className="w-0.5 h-2 bg-cyan-400 rounded-full -translate-y-1" />
                        </div>
                      </div>
                    </div>
                    <span className="text-[8px] font-bold text-slate-500">K{idx + 1}</span>
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

export default Performance;
