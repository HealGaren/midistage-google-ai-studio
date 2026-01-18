
import React, { useState } from 'react';
import { Sequence, Song, SequenceMode, SequenceItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { TimelineEditor } from './TimelineEditor';
import { CompactItemEditor } from './CompactItemEditor';
import { PianoRollEditor } from './PianoRollEditor';

interface SequenceEditorProps {
  sequence: Sequence;
  song: Song;
  onUpdate: (u: Partial<Sequence>) => void;
  onUpdateSong: (song: Song) => void;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}

export const SequenceEditor: React.FC<SequenceEditorProps> = ({ sequence, song, onUpdate, onUpdateSong, sendNoteOn, sendNoteOff }) => {
  const [isPianoRollOpen, setIsPianoRollOpen] = useState(false);

  const addSequenceToGroup = () => {
    const newItem: SequenceItem = {
      id: uuidv4(),
      type: 'sequence',
      targetId: song.sequences.filter(s => s.id !== sequence.id)[0]?.id || '',
      beatPosition: sequence.items.length
    };
    onUpdate({ items: [...sequence.items, newItem] });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex items-center justify-between mb-8 flex-shrink-0">
        <div className="flex flex-col gap-1">
           <input 
            className="bg-transparent font-black text-4xl text-white focus:outline-none w-full max-w-md border-b-2 border-transparent focus:border-slate-800 transition-all py-1" 
            value={sequence.name} 
            onChange={(e) => onUpdate({ name: e.target.value })} 
          />
          <p className="text-[10px] font-black text-slate-500 uppercase tracking-[0.2em]">Sequence Configuration</p>
        </div>
        
        <div className="flex items-center gap-4">
          {sequence.mode !== SequenceMode.GROUP && (
            <button 
              onClick={() => setIsPianoRollOpen(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl text-[11px] font-black uppercase transition-all shadow-xl hover:shadow-indigo-500/20 active:scale-95"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
              Open Piano Roll
            </button>
          )}

          <div className="flex items-center gap-4 bg-slate-800 p-1.5 rounded-2xl border border-slate-700 shadow-xl">
            <span className="text-[10px] font-black text-slate-500 uppercase px-3">Mode</span>
            <select 
              value={sequence.mode} 
              onChange={(e) => onUpdate({ mode: e.target.value as SequenceMode, items: [] })} 
              className="bg-slate-900 text-[10px] font-black uppercase p-2.5 rounded-xl border border-slate-700 outline-none text-slate-300 focus:border-indigo-500 shadow-inner"
            >
              <option value={SequenceMode.STEP}>Sequential (STEP)</option>
              <option value={SequenceMode.AUTO}>Timeline (AUTO)</option>
              <option value={SequenceMode.GROUP}>Sequence Group (GROUP)</option>
            </select>
          </div>
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
        ) : sequence.mode === SequenceMode.STEP ? (
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
        ) : (
          /* GROUP MODE UI */
          <div className="max-w-4xl mx-auto space-y-4 p-8">
            <div className="flex items-center justify-between mb-8">
              <div>
                <h4 className="text-xl font-black text-indigo-400">Sequence Group Chain</h4>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Chains multiple sequences into one giant loop</p>
              </div>
              <button 
                onClick={addSequenceToGroup}
                className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-xl"
              >
                + Add Sequence to Chain
              </button>
            </div>

            <div className="space-y-4">
              {sequence.items.map((item, idx) => {
                const subSeq = song.sequences.find(s => s.id === item.targetId);
                return (
                  <div key={item.id} className="bg-slate-900 border border-slate-800 p-6 rounded-[32px] flex items-center gap-8 group hover:border-indigo-500/50 transition-all shadow-2xl relative">
                    <div className="w-12 h-12 rounded-2xl bg-slate-800 flex items-center justify-center text-lg font-black text-slate-500 group-hover:text-indigo-400 transition-colors">
                      {idx + 1}
                    </div>
                    
                    <div className="flex-1 flex flex-col gap-1">
                      <span className="text-[10px] font-black text-slate-600 uppercase">Target Sequence</span>
                      <select 
                        value={item.targetId}
                        onChange={(e) => onUpdate({ items: sequence.items.map(i => i.id === item.id ? {...i, targetId: e.target.value} : i)})}
                        className="bg-transparent text-xl font-black text-white outline-none cursor-pointer hover:text-indigo-400 transition-colors"
                      >
                        <option value="" disabled className="bg-slate-900">Select Sequence...</option>
                        {song.sequences.filter(s => s.id !== sequence.id).map(s => (
                          <option key={s.id} value={s.id} className="bg-slate-900">{s.name}</option>
                        ))}
                      </select>
                    </div>

                    <div className="flex flex-col items-end gap-1">
                      <span className="text-[10px] font-black text-slate-600 uppercase">Summary</span>
                      <div className="flex gap-2">
                        <span className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-black text-indigo-300">
                          {subSeq?.items.length || 0} Steps
                        </span>
                        <span className="px-3 py-1 bg-slate-800 rounded-full text-[10px] font-black text-slate-500 uppercase">
                          {subSeq?.mode}
                        </span>
                      </div>
                    </div>

                    <button 
                      onClick={() => onUpdate({ items: sequence.items.filter(i => i.id !== item.id)})}
                      className="p-3 text-slate-700 hover:text-rose-500 transition-colors"
                    >
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                    </button>
                    
                    {idx < sequence.items.length - 1 && (
                      <div className="absolute -bottom-6 left-12 w-1 h-8 bg-gradient-to-b from-indigo-500/40 to-transparent rounded-full z-[-1]" />
                    )}
                  </div>
                );
              })}

              {sequence.items.length === 0 && (
                <div className="py-24 border-2 border-dashed border-slate-800/40 rounded-[40px] flex flex-col items-center justify-center text-slate-600">
                  <p className="text-sm font-black uppercase tracking-[0.2em] opacity-40 italic">Chain is empty. Add sequences to group them.</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {isPianoRollOpen && (
        <PianoRollEditor 
          sequence={sequence}
          song={song}
          onUpdate={onUpdate}
          onClose={() => setIsPianoRollOpen(false)}
          sendNoteOn={sendNoteOn}
          sendNoteOff={sendNoteOff}
        />
      )}
    </div>
  );
};
