
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Song, ActiveNoteState, InputMapping } from '../types';
import { midiService } from '../webMidiService';

interface PerformanceProps {
  song: Song;
  activeNotes: ActiveNoteState[];
  onTrigger: (mappingId: string, type: 'preset' | 'sequence' | 'switch_scene', targetId: string, isRelease: boolean, triggerValue: string | number) => void;
  selectedInputId: string;
  onUpdateSong: (song: Song) => void;
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

const Performance: React.FC<PerformanceProps> = ({ song, activeNotes, onTrigger, selectedInputId, onUpdateSong }) => {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  const [pressedMidiPitches, setPressedMidiPitches] = useState<Set<number>>(new Set());

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

  const findMappings = useCallback((type: 'keyboard' | 'midi', value: string | number, channel?: number) => {
    return activeMappings.filter(m => {
      if (type === 'keyboard') {
        const triggerStr = String(m.keyboardValue).toLowerCase();
        const inputStr = String(value).toLowerCase();
        const allowedValues = triggerStr.split(',').map(v => v.trim());
        return allowedValues.includes(inputStr);
      } else {
        // MIDI Input Check
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
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length > 0) {
        setPressedMidiPitches(prev => new Set(prev).add(pitch));
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false, pitch));
      }
    };
    
    const onNoteOff = (e: any) => {
      const pitch = e.note.number;
      const channel = e.message.channel;
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length > 0) {
        setPressedMidiPitches(prev => {
          const next = new Set(prev);
          next.delete(pitch);
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

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex flex-col gap-4">
        <div className="flex items-end justify-between">
          <div>
            <h2 className="text-4xl font-black text-white leading-none">{song.name}</h2>
            <div className="mt-2 flex gap-2">
              <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-bold text-slate-400 border border-slate-700 uppercase tracking-widest">
                Tempo: {song.bpm} BPM
              </span>
            </div>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Active Scene</span>
            <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-800">
               {song.scenes.map(scene => (
                 <button 
                  key={scene.id} 
                  onClick={() => onUpdateSong({ ...song, activeSceneId: scene.id })}
                  className={`px-6 py-2 rounded-xl text-xs font-black uppercase transition-all ${song.activeSceneId === scene.id ? 'bg-indigo-600 text-white shadow-xl' : 'text-slate-600 hover:text-slate-400'}`}
                 >
                   {scene.name}
                 </button>
               ))}
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Performance Console</h3>
            <span className="text-[10px] text-slate-600 font-black">Active Mappings: {activeMappings.length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {activeMappings.map(map => {
              // Check if currently triggered by keyboard
              const kAllowed = String(map.keyboardValue).toLowerCase().split(',').map(v => v.trim());
              const isKeyboardActive = kAllowed.some(k => pressedKeys.has(k));
              
              // Check if currently triggered by MIDI
              let isMidiActive = false;
              if (map.isMidiRange) {
                isMidiActive = Array.from(pressedMidiPitches).some(p => p >= map.midiRangeStart && p <= map.midiRangeEnd);
              } else {
                const mAllowed = String(map.midiValue).toLowerCase().split(',').map(v => v.trim());
                isMidiActive = mAllowed.some(p => pressedMidiPitches.has(Number(p)));
              }

              const isActive = isKeyboardActive || isMidiActive;
              
              const triggerDisplay = [];
              if (map.keyboardValue) triggerDisplay.push(`⌨️ ${map.keyboardValue}`);
              if (map.isMidiRange) triggerDisplay.push(`🎹 ${map.midiRangeStart}..${map.midiRangeEnd}`);
              else if (map.midiValue) triggerDisplay.push(`🎹 ${map.midiValue}`);

              return (
                <button
                  key={map.id}
                  onMouseDown={() => onTrigger(map.id, map.actionType, map.actionTargetId, false, 'mouse')}
                  onMouseUp={() => onTrigger(map.id, map.actionType, map.actionTargetId, true, 'mouse')}
                  className={`h-32 p-4 rounded-2xl flex flex-col items-start justify-between transition-all border-b-4 transform active:translate-y-1 active:border-b-0 ${isActive ? 'bg-indigo-600 border-indigo-800 ring-2 ring-indigo-400' : 'bg-slate-800 hover:bg-slate-700 border-slate-900'}`}
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
                        {map.scope === 'global' && <span className="text-[7px] text-indigo-400 font-black uppercase">GLOBAL</span>}
                    </div>
                    <div className={`w-2.5 h-2.5 rounded-full ${isActive ? 'bg-white animate-pulse shadow-[0_0_8px_white]' : 'bg-slate-600'}`}></div>
                  </div>
                  <div className="text-left w-full mt-2">
                    <p className="text-[8px] font-black uppercase opacity-50 tracking-tighter">{map.actionType.replace('_', ' ')}</p>
                    <p className="font-bold truncate text-sm leading-tight text-white">{getActionName(map.actionType, map.actionTargetId)}</p>
                  </div>
                </button>
              );
            })}
            {activeMappings.length === 0 && (
              <div className="col-span-full h-24 border-2 border-dashed border-slate-800 rounded-2xl flex items-center justify-center text-slate-600">
                <span className="text-xs font-black uppercase tracking-widest opacity-50">No mappings active for this scene</span>
              </div>
            )}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Midi Monitor</h3>
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 min-h-[400px]">
            {activeNotes.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-600"><p className="text-sm font-medium uppercase tracking-widest opacity-40">Silent</p></div> : (
              <div className="space-y-2">
                {activeNotes.map((an, idx) => (
                  <div key={`${an.pitch}-${an.channel}-${an.startTime}-${idx}`} className="relative flex items-center justify-between p-4 bg-slate-800 rounded-xl border border-slate-700 shadow-xl overflow-hidden animate-in fade-in zoom-in-95">
                    <div className="flex items-center gap-4 z-10">
                      <div className="w-10 h-10 rounded-lg bg-indigo-500/20 flex items-center justify-center text-indigo-400 font-black text-sm border border-indigo-500/20 shadow-inner">
                        {an.pitch}
                      </div>
                      <div>
                        <p className="text-[10px] font-black text-white uppercase tracking-tighter">Channel {an.channel}</p>
                        <p className="text-xs font-bold text-slate-400">{midiToNoteName(an.pitch)}</p>
                      </div>
                    </div>
                    <div className="flex gap-1.5 z-10">
                      <div className="w-1.5 h-6 bg-emerald-500 rounded-full animate-bounce shadow-[0_0_10px_rgba(16,185,129,0.5)]"></div>
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
