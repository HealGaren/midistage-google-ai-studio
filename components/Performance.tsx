
import React, { useEffect, useState, useCallback } from 'react';
import { Song, ActiveNoteState, InputMapping } from '../types';
import { midiService } from '../webMidiService';

interface PerformanceProps {
  song: Song;
  activeNotes: ActiveNoteState[];
  onTrigger: (mappingId: string, type: 'preset' | 'sequence', targetId: string, isRelease: boolean) => void;
  selectedInputId: string;
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

const Performance: React.FC<PerformanceProps> = ({ song, activeNotes, onTrigger, selectedInputId }) => {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());

  const findMappings = useCallback((type: 'keyboard' | 'midi', value: string | number) => {
    return song.mappings.filter(m => {
      if (!m.isEnabled) return false;
      if (m.triggerType !== type) return false;

      if (m.isRange) {
        if (type === 'midi') {
          const start = Number(m.triggerStart);
          const end = Number(m.triggerEnd);
          const numValue = Number(value);
          return numValue >= start && numValue <= end;
        } else {
          const start = String(m.triggerStart);
          const end = String(m.triggerEnd);
          const val = String(value);
          return val >= start && val <= end;
        }
      } else {
        return m.triggerValue === value;
      }
    });
  }, [song.mappings]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      const mappings = findMappings('keyboard', e.key);
      if (mappings.length > 0) {
        setPressedKeys(prev => new Set(prev).add(e.key));
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false));
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      const mappings = findMappings('keyboard', e.key);
      if (mappings.length > 0) {
        setPressedKeys(prev => { const next = new Set(prev); next.delete(e.key); return next; });
        mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true));
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
      const mappings = findMappings('midi', pitch);
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false));
    };
    
    const onNoteOff = (e: any) => {
      const pitch = e.note.number;
      const mappings = findMappings('midi', pitch);
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true));
    };
    
    input.addListener('noteon', onNoteOn);
    input.addListener('noteoff', onNoteOff);
    return () => { input.removeListener('noteon', onNoteOn); input.removeListener('noteoff', onNoteOff); };
  }, [selectedInputId, findMappings, onTrigger]);

  const getActionName = (type: 'preset' | 'sequence', id: string) => {
    if (type === 'preset') return song.presets.find(p => p.id === id)?.name || 'Unknown Preset';
    return song.sequences.find(s => s.id === id)?.name || 'Unknown Sequence';
  };

  return (
    <div className="h-full flex flex-col gap-6">
      <div className="flex flex-col">
        <h2 className="text-4xl font-black text-white">{song.name}</h2>
        <div className="mt-2">
          <span className="px-3 py-1 bg-slate-800 rounded-full text-xs font-bold text-slate-400 border border-slate-700 uppercase tracking-widest">
            Tempo: {song.bpm} BPM
          </span>
        </div>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="col-span-1 lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Control Surface</h3>
            <span className="text-[10px] text-slate-600 font-black">Active Mappings: {song.mappings.filter(m => m.isEnabled).length}</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {song.mappings.map(map => {
              if (!map.isEnabled) return null;
              const isActive = (map.triggerType === 'keyboard' && pressedKeys.has(map.triggerValue as string));
              
              let triggerDisplay = '';
              if (map.isRange) {
                triggerDisplay = `${map.triggerStart}..${map.triggerEnd}`;
              } else {
                triggerDisplay = String(map.triggerValue);
              }

              return (
                <button
                  key={map.id}
                  onMouseDown={() => onTrigger(map.id, map.actionType, map.actionTargetId, false)}
                  onMouseUp={() => onTrigger(map.id, map.actionType, map.actionTargetId, true)}
                  className={`h-24 p-4 rounded-xl flex flex-col items-start justify-between transition-all border-b-4 transform active:translate-y-1 active:border-b-0 ${isActive ? 'bg-indigo-600 border-indigo-800 ring-2 ring-indigo-400' : 'bg-slate-800 hover:bg-slate-700 border-slate-900'}`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-[9px] font-black opacity-40 uppercase truncate pr-2">
                      {map.triggerType === 'keyboard' ? '⌨️' : '🎹'} {triggerDisplay}
                    </span>
                    <div className={`w-2 h-2 rounded-full ${isActive ? 'bg-white animate-pulse shadow-[0_0_8px_white]' : 'bg-slate-600'}`}></div>
                  </div>
                  <div className="text-left w-full">
                    <p className="text-[8px] font-black uppercase opacity-50 tracking-tighter">{map.actionType}</p>
                    <p className="font-bold truncate text-sm leading-tight">{getActionName(map.actionType, map.actionTargetId)}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest">Midi Monitor</h3>
          <div className="bg-slate-900/50 rounded-2xl border border-slate-800 p-6 min-h-[400px]">
            {activeNotes.length === 0 ? <div className="h-full flex flex-col items-center justify-center text-slate-600"><p className="text-sm font-medium">Silent</p></div> : (
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
                      <div className="w-1.5 h-6 bg-emerald-500 rounded-full animate-bounce shadow-[0_0_10px_rgba(16,185,129,0.5)]" style={{animationDelay:'0.1s'}}></div>
                    </div>
                    {an.duration && <DurationBar duration={an.duration} />}
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
