
import React, { useState, useEffect, useCallback } from 'react';
import { Song, InputMapping, MappingScope } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { midiService } from '../../webMidiService';
import { midiToNoteName } from './PianoView';

interface MappingEditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  selectedInputId: string;
}

interface LearningState {
  id: string;
  type: 'keyboard' | 'midi';
}

export const MappingEditor: React.FC<MappingEditorProps> = ({ song, onUpdateSong, selectedInputId }) => {
  const [learning, setLearning] = useState<LearningState | null>(null);

  const handleLearn = useCallback((value: string | number) => {
    if (!learning) return;
    const mapping = song.mappings.find(m => m.id === learning.id);
    if (!mapping) return;

    const field = learning.type === 'keyboard' ? 'keyboardValue' : 'midiValue';
    const currentValues = String(mapping[field] || '').split(',').map(v => v.trim()).filter(v => v !== "");
    const newValue = String(value);
    
    if (!currentValues.includes(newValue)) {
      const updatedValue = currentValues.length > 0 ? [...currentValues, newValue].join(', ') : newValue;
      onUpdateSong({
        ...song,
        mappings: song.mappings.map(m => m.id === learning.id ? { ...m, [field]: updatedValue } : m)
      });
    }
  }, [learning, song, onUpdateSong]);

  useEffect(() => {
    if (!learning || learning.type !== 'keyboard') return;

    const onKeyDown = (e: KeyboardEvent) => {
      e.preventDefault();
      if (e.repeat) return;
      handleLearn(e.key);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [learning, handleLearn]);

  useEffect(() => {
    if (!learning || learning.type !== 'midi') return;

    const input = midiService.getInputById(selectedInputId);
    if (!input) return;

    const onNoteOn = (e: any) => {
      handleLearn(e.note.number);
    };

    input.addListener('noteon', onNoteOn);
    return () => input.removeListener('noteon', onNoteOn);
  }, [learning, selectedInputId, handleLearn]);

  const updateMapping = (id: string, updates: Partial<InputMapping>) => {
    onUpdateSong({
        ...song,
        mappings: song.mappings.map(m => m.id === id ? { ...m, ...updates } : m)
    });
  };

  const createNewMapping = () => {
    const newMap: InputMapping = { 
      id: uuidv4(), 
      keyboardValue: '', 
      midiValue: '', 
      midiChannel: 0, 
      isMidiRange: false, 
      midiRangeStart: 60, 
      midiRangeEnd: 72, 
      actionType: 'preset', 
      actionTargetId: '', 
      isEnabled: true, 
      scope: 'global' 
    };
    onUpdateSong({ ...song, mappings: [...song.mappings, newMap] });
  };

  return (
    <div className="h-full bg-slate-900 rounded-[40px] border border-slate-800 p-12 flex flex-col shadow-2xl overflow-hidden">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h3 className="text-4xl font-black text-white tracking-tight">Hybrid Mapping Library</h3>
          <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">Define triggers. Assign them to scenes in the Scene Editor.</p>
        </div>
        <button 
          onClick={createNewMapping} 
          className="bg-indigo-600 px-10 py-5 rounded-[24px] font-black uppercase text-[11px] hover:bg-indigo-500 shadow-xl transition-all"
        >
          + New Hybrid Mapping
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 pr-4 custom-scrollbar">
        {song.mappings.map(map => {
          const isLearningK = learning?.id === map.id && learning?.type === 'keyboard';
          const isLearningM = learning?.id === map.id && learning?.type === 'midi';

          return (
            <div key={map.id} className={`grid grid-cols-[1.2fr_1.5fr_1fr_1fr_1fr_40px] gap-6 bg-slate-950/40 p-6 rounded-[32px] items-start border border-slate-800 hover:bg-slate-800/30 transition-all ${!map.isEnabled && 'opacity-40 grayscale'}`}>
               
               {/* Column 1: Keyboard Input */}
               <div className="flex flex-col gap-2">
                 <span className="text-[9px] text-indigo-400 font-black uppercase px-1">⌨️ Keyboard Keys</span>
                 <div className="relative">
                   <input 
                     type="text" 
                     value={map.keyboardValue} 
                     onChange={(e) => updateMapping(map.id, { keyboardValue: e.target.value })} 
                     className={`w-full bg-slate-900 p-3 rounded-xl text-[10px] font-bold border outline-none transition-all pr-14 ${isLearningK ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-400' : 'border-slate-700 focus:border-indigo-500 text-slate-200'}`} 
                     placeholder="e.g. j, k" 
                   />
                   <button 
                     onClick={() => setLearning(isLearningK ? null : { id: map.id, type: 'keyboard' })}
                     className={`absolute right-1.5 top-1.5 bottom-1.5 px-2 rounded-lg text-[8px] font-black uppercase transition-all ${isLearningK ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                   >
                     {isLearningK ? 'Rec' : 'Learn'}
                   </button>
                 </div>
               </div>

               {/* Column 2: MIDI Input */}
               <div className="flex flex-col gap-2">
                 <div className="flex items-center justify-between px-1">
                    <span className="text-[9px] text-indigo-400 font-black uppercase">🎹 MIDI Notes</span>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                        <span className="text-[8px] font-black uppercase text-slate-500">Range</span>
                        <input type="checkbox" checked={map.isMidiRange} onChange={(e) => updateMapping(map.id, { isMidiRange: e.target.checked })} className="w-3 h-3 accent-indigo-500" />
                    </label>
                 </div>
                 
                 {map.isMidiRange ? (
                   <div className="flex gap-2">
                      <input type="number" value={map.midiRangeStart} onChange={(e) => updateMapping(map.id, { midiRangeStart: parseInt(e.target.value) || 0 })} className="bg-slate-900 p-3 rounded-xl text-[10px] font-bold border border-slate-700 outline-none w-full text-center" />
                      <span className="pt-3 text-slate-600">..</span>
                      <input type="number" value={map.midiRangeEnd} onChange={(e) => updateMapping(map.id, { midiRangeEnd: parseInt(e.target.value) || 0 })} className="bg-slate-900 p-3 rounded-xl text-[10px] font-bold border border-slate-700 outline-none w-full text-center" />
                   </div>
                 ) : (
                   <div className="relative">
                     <input 
                       type="text" 
                       value={map.midiValue} 
                       onChange={(e) => updateMapping(map.id, { midiValue: e.target.value })} 
                       className={`w-full bg-slate-900 p-3 rounded-xl text-[10px] font-bold border outline-none transition-all pr-14 ${isLearningM ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-400' : 'border-slate-700 focus:border-indigo-500 text-slate-200'}`} 
                       placeholder="60, 62" 
                     />
                     <button 
                       onClick={() => setLearning(isLearningM ? null : { id: map.id, type: 'midi' })}
                       className={`absolute right-1.5 top-1.5 bottom-1.5 px-2 rounded-lg text-[8px] font-black uppercase transition-all ${isLearningM ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-800 text-slate-400 hover:text-white'}`}
                     >
                       {isLearningM ? 'Rec' : 'Learn'}
                     </button>
                   </div>
                 )}
                 <div className="flex items-center gap-2 mt-1 px-1">
                    <span className="text-[8px] font-black text-slate-600 uppercase">CH</span>
                    <select value={map.midiChannel} onChange={(e) => updateMapping(map.id, { midiChannel: parseInt(e.target.value) })} className="bg-transparent text-[9px] font-bold outline-none text-slate-500">
                      <option value={0}>OMNI</option>
                      {Array.from({length:16}).map((_,i) => <option key={i} value={i+1}>{i+1}</option>)}
                    </select>
                 </div>
               </div>

               {/* Column 3: Scope Selector (Only Global vs Scene) */}
               <div className="flex flex-col gap-2">
                 <span className="text-[9px] text-slate-600 font-black uppercase px-1">Scope</span>
                 <select value={map.scope} onChange={(e) => updateMapping(map.id, { scope: e.target.value as MappingScope })} className="bg-slate-900 p-3 rounded-xl text-[10px] font-bold border border-slate-700 outline-none text-slate-200">
                   <option value="global">Global (All Scenes)</option>
                   <option value="scene">Scene Specific</option>
                 </select>
               </div>

               {/* Column 4: Action Type */}
               <div className="flex flex-col gap-2">
                 <span className="text-[9px] text-slate-600 font-black uppercase px-1">Action</span>
                 <select value={map.actionType} onChange={(e) => updateMapping(map.id, { actionType: e.target.value as any, actionTargetId: '' })} className="bg-slate-900 p-3 rounded-xl text-[10px] font-bold border border-slate-700 outline-none text-slate-200">
                   <option value="preset">Preset</option>
                   <option value="sequence">Sequence</option>
                   <option value="switch_scene">Switch Scene</option>
                 </select>
               </div>

               {/* Column 5: Target */}
               <div className="flex flex-col gap-2">
                 <span className="text-[9px] text-slate-600 font-black uppercase px-1">Target</span>
                 <select value={map.actionTargetId} onChange={(e) => updateMapping(map.id, { actionTargetId: e.target.value })} className="bg-slate-900 p-3 rounded-xl text-[10px] font-bold border border-slate-700 outline-none text-slate-200">
                   <option value="">Select...</option>
                   {map.actionType === 'preset' && song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                   {map.actionType === 'sequence' && song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                   {map.actionType === 'switch_scene' && song.scenes.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                 </select>
               </div>

               {/* Delete */}
               <button onClick={() => onUpdateSong({ ...song, mappings: song.mappings.filter(m => m.id !== map.id) })} className="text-slate-700 hover:text-rose-500 transition-all flex justify-center pt-8">
                 <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
               </button>
            </div>
          );
        })}
      </div>
    </div>
  );
};
