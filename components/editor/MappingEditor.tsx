
import React, { useState, useEffect, useCallback } from 'react';
import { Song, InputMapping } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { midiService } from '../../webMidiService';
import { midiToNoteName } from './PianoView';

interface MappingEditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  selectedInputId: string;
}

export const MappingEditor: React.FC<MappingEditorProps> = ({ song, onUpdateSong, selectedInputId }) => {
  const [learningId, setLearningId] = useState<string | null>(null);

  const handleLearn = useCallback((value: string | number) => {
    if (!learningId) return;
    const mapping = song.mappings.find(m => m.id === learningId);
    if (!mapping) return;

    const currentValues = String(mapping.triggerValue).split(',').map(v => v.trim()).filter(v => v !== "");
    const newValue = String(value);
    
    if (!currentValues.includes(newValue)) {
      const updatedValue = currentValues.length > 0 ? [...currentValues, newValue].join(', ') : newValue;
      onUpdateSong({
        ...song,
        mappings: song.mappings.map(m => m.id === learningId ? { ...m, triggerValue: updatedValue } : m)
      });
    }
  }, [learningId, song, onUpdateSong]);

  // Keyboard Learn
  useEffect(() => {
    if (!learningId) return;
    const mapping = song.mappings.find(m => m.id === learningId);
    if (!mapping || mapping.triggerType !== 'keyboard') return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.repeat) return;
      handleLearn(e.key);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [learningId, song.mappings, handleLearn]);

  // MIDI Learn
  useEffect(() => {
    if (!learningId) return;
    const mapping = song.mappings.find(m => m.id === learningId);
    if (!mapping || mapping.triggerType !== 'midi') return;

    const input = midiService.getInputById(selectedInputId);
    if (!input) return;

    const onNoteOn = (e: any) => {
      handleLearn(e.note.number);
    };

    input.addListener('noteon', onNoteOn);
    return () => input.removeListener('noteon', onNoteOn);
  }, [learningId, song.mappings, selectedInputId, handleLearn]);

  return (
    <div className="h-full bg-slate-900 rounded-[40px] border border-slate-800 p-12 flex flex-col shadow-[0_30px_60px_-15px_rgba(0,0,0,0.5)] overflow-hidden">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h3 className="text-4xl font-black text-white tracking-tight">Input Mapping</h3>
          <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">Connect MIDI Controllers & Performance Triggers</p>
        </div>
        <button 
          onClick={() => onUpdateSong({ ...song, mappings: [...song.mappings, { id: uuidv4(), triggerType: 'keyboard', isRange: false, triggerValue: '', triggerChannel: 0, triggerStart: '', triggerEnd: '', actionType: 'preset', actionTargetId: '', isEnabled: true }] })} 
          className="bg-indigo-600 px-10 py-5 rounded-[24px] font-black uppercase text-[11px] hover:bg-indigo-500 shadow-[0_15px_30px_-5px_rgba(79,70,229,0.5)] transition-all active:scale-95"
        >
          + New Mapping
        </button>
      </div>
      <div className="flex-1 overflow-y-auto space-y-6 pr-4 custom-scrollbar">
        {song.mappings.map(map => {
          const isLearning = learningId === map.id;
          const midiNotes = map.triggerType === 'midi' 
            ? String(map.triggerValue).split(',').map(v => {
                const n = parseInt(v.trim());
                return isNaN(n) ? null : midiToNoteName(n);
              }).filter(v => v !== null).join(', ')
            : null;

          return (
            <div key={map.id} className={`grid grid-cols-[140px_1fr_1fr_120px_60px] gap-8 bg-slate-950/40 p-8 rounded-[32px] items-center border border-slate-800 shadow-inner hover:bg-slate-800/30 transition-all ${!map.isEnabled && 'opacity-40 grayscale'}`}>
               <div className="flex flex-col gap-2.5">
                 <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest px-1">Source</span>
                 <select value={map.triggerType} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerType: e.target.value as any, triggerValue: ''} : m)})} className="bg-slate-900 p-3.5 rounded-2xl text-[11px] font-bold border border-slate-700 outline-none focus:border-indigo-500 text-slate-200">
                   <option value="keyboard">⌨️ Keyboard</option>
                   <option value="midi">🎹 MIDI Device</option>
                 </select>
               </div>

               <div className="flex flex-col gap-2.5">
                 <div className="flex items-center justify-between px-1">
                   <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest">Trigger Value(s)</span>
                   {midiNotes && <span className="text-[9px] text-indigo-400 font-black uppercase">{midiNotes}</span>}
                 </div>
                 <div className="relative">
                   <input 
                     type="text" 
                     value={map.triggerValue} 
                     onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: e.target.value} : m)})} 
                     className={`w-full bg-slate-900 p-3.5 rounded-2xl text-[11px] font-bold border outline-none transition-all pr-24 ${isLearning ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-400' : 'border-slate-700 focus:border-indigo-500 text-slate-200'}`} 
                     placeholder={map.triggerType === 'keyboard' ? "e.g. j, k, l" : "e.g. 60, 62, 64"} 
                   />
                   <button 
                     onClick={() => setLearningId(isLearning ? null : map.id)}
                     className={`absolute right-2 top-2 bottom-2 px-3 rounded-xl text-[8px] font-black uppercase transition-all ${isLearning ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                   >
                     {isLearning ? 'Recording...' : 'Learn'}
                   </button>
                 </div>
               </div>

               <div className="flex flex-col gap-2.5">
                 <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest px-1">Performance Action</span>
                 <select value={map.actionTargetId} onChange={(e) => { const tid = e.target.value; const isS = song.sequences.some(s => s.id === tid); onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, actionTargetId: tid, actionType: isS ? 'sequence' : 'preset'} : m)}); }} className="bg-slate-900 p-3.5 rounded-2xl text-[11px] font-bold border border-slate-700 outline-none focus:border-indigo-500 text-slate-200">
                   <option value="">Select Target...</option>
                   <optgroup label="Presets (Chords/Notes)">{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>
                   <optgroup label="Sequences (Playlists)">{song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup>
                 </select>
               </div>

               <div className="flex flex-col gap-2.5">
                 <span className="text-[9px] text-slate-600 font-black uppercase tracking-widest px-1">Clear</span>
                 <button 
                   onClick={() => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: ''} : m)})}
                   className="bg-slate-800/50 p-3.5 rounded-2xl text-[10px] font-black text-slate-500 hover:text-rose-400 transition-colors uppercase"
                 >
                   Reset
                 </button>
               </div>

               <button onClick={() => onUpdateSong({ ...song, mappings: song.mappings.filter(m => m.id !== map.id) })} className="text-slate-700 hover:text-rose-500 transition-all flex justify-center mt-6">
                 <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               </button>
            </div>
          );
        })}
        {song.mappings.length === 0 && (
          <div className="flex-1 flex flex-col items-center justify-center py-24 text-slate-700 opacity-40 space-y-4">
            <svg className="w-20 h-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" /></svg>
            <p className="text-sm font-black uppercase tracking-[0.3em]">No Mappings Set</p>
          </div>
        )}
      </div>
    </div>
  );
};
