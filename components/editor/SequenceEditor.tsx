
import React from 'react';
import { Sequence, Song, SequenceMode } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { TimelineEditor } from './TimelineEditor';
import { CompactItemEditor } from './CompactItemEditor';

interface SequenceEditorProps {
  sequence: Sequence;
  song: Song;
  onUpdate: (u: Partial<Sequence>) => void;
  onUpdateSong: (song: Song) => void;
}

export const SequenceEditor: React.FC<SequenceEditorProps> = ({ sequence, song, onUpdate, onUpdateSong }) => {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <input 
          className="bg-transparent font-black text-4xl text-white focus:outline-none w-full max-w-md border-b-2 border-transparent focus:border-slate-800 transition-all py-1" 
          value={sequence.name} 
          onChange={(e) => onUpdate({ name: e.target.value })} 
        />
        <div className="flex items-center gap-4 bg-slate-800 p-1.5 rounded-2xl border border-slate-700 shadow-xl">
          <span className="text-[10px] font-black text-slate-500 uppercase px-3">Mode</span>
          <select 
            value={sequence.mode} 
            onChange={(e) => onUpdate({ mode: e.target.value as SequenceMode })} 
            className="bg-slate-900 text-[10px] font-black uppercase p-2.5 rounded-xl border border-slate-700 outline-none text-slate-300 focus:border-indigo-500 shadow-inner"
          >
            <option value={SequenceMode.STEP}>Sequential (STEP)</option>
            <option value={SequenceMode.AUTO}>Timeline (AUTO)</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto custom-scrollbar relative">
        {sequence.mode === SequenceMode.AUTO ? (
          <TimelineEditor 
            sequence={sequence} 
            song={song} 
            onUpdate={onUpdate} 
            renderItemEditor={(item, isEditing, setEditing) => (
              <div className="absolute top-14 left-0 z-[100] animate-in zoom-in-95 fade-in slide-in-from-top-3 duration-200">
                <CompactItemEditor 
                  item={item} 
                  presets={song.presets} 
                  onUpdate={(u) => onUpdate({ items: sequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})}
                  onDelete={() => { onUpdate({ items: sequence.items.filter(i => i.id !== item.id)}); setEditing(null); }} 
                />
                <div className="fixed inset-0 z-[-1]" onClick={() => setEditing(null)} />
              </div>
            )} 
          />
        ) : (
          <div className="flex gap-6 p-6 min-h-[400px] items-start">
            {sequence.items.map((item, idx) => (
              <div key={item.id} className="flex-shrink-0 w-72 bg-slate-800/20 p-6 rounded-[32px] relative border border-slate-800/60 hover:border-slate-700 transition-all shadow-2xl hover:bg-slate-800/40">
                <div className="absolute -top-4 -left-4 w-10 h-10 bg-indigo-600 rounded-full flex items-center justify-center text-[14px] font-black shadow-2xl z-10 ring-8 ring-slate-950">{idx + 1}</div>
                <CompactItemEditor 
                  item={item} 
                  presets={song.presets} 
                  isStepView 
                  onUpdate={(u) => onUpdate({ items: sequence.items.map(i => i.id === item.id ? {...i, ...u} : i)})}
                  onDelete={() => onUpdate({ items: sequence.items.filter(i => i.id !== item.id)})} 
                />
              </div>
            ))}
            <button 
              onClick={() => onUpdate({ items: [...sequence.items, { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: sequence.items.length, overrideDuration: undefined, overrideDurationUnit: 'ms' }] })} 
              className="flex-shrink-0 w-24 h-48 border-2 border-dashed border-slate-800 rounded-[32px] flex items-center justify-center text-slate-800 hover:text-indigo-500 hover:border-indigo-500 transition-all hover:bg-indigo-500/5 group"
            >
              <svg className="w-8 h-8 group-hover:scale-125 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4" /></svg>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
