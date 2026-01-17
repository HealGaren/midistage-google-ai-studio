
import React from 'react';
import { SequenceItem, Song } from '../../types';
import { midiToNoteName } from './PianoView';
import { UnitSelector } from './Common';

interface CompactItemEditorProps {
  item: SequenceItem;
  presets: Song['presets'];
  onUpdate: (updates: Partial<SequenceItem>) => void;
  onDelete: () => void;
  isStepView?: boolean;
}

export const CompactItemEditor: React.FC<CompactItemEditorProps> = ({ item, presets, onUpdate, onDelete, isStepView }) => {
  return (
    <div className={`${isStepView ? 'w-full' : 'bg-slate-900 p-6 rounded-2xl border border-indigo-500 shadow-2xl w-72 ring-8 ring-slate-950/80 pointer-events-auto'} space-y-4`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          <button onClick={() => onUpdate({ type: 'preset' })} className={`px-3 py-1 text-[9px] font-black uppercase rounded ${item.type === 'preset' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Preset</button>
          <button onClick={() => onUpdate({ type: 'note', noteData: item.noteData || { pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' } })} className={`px-3 py-1 text-[9px] font-black uppercase rounded ${item.type === 'note' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Note</button>
        </div>
        <button onClick={onDelete} className="text-rose-500 p-1.5 hover:bg-rose-500/10 rounded-lg transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
      <div className="space-y-4">
        {item.type === 'preset' ? (
          <div className="space-y-1.5">
            <span className="text-[8px] text-slate-500 uppercase font-black">Target Preset</span>
            <select value={item.targetId || ''} onChange={(e) => onUpdate({ targetId: e.target.value })} className="bg-slate-800 text-[11px] font-bold p-2.5 rounded-xl border border-slate-700 outline-none w-full text-slate-200 focus:border-indigo-500">
              <option value="">None Selected</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] text-slate-500 uppercase font-black">Pitch ({midiToNoteName(item.noteData?.pitch || 0)})</span>
              <input type="number" min="0" max="127" value={item.noteData?.pitch} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, pitch: parseInt(e.target.value) || 0 }})} className="bg-slate-800 text-[11px] font-bold p-2.5 rounded-xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-[8px] text-slate-500 uppercase font-black">Velocity</span>
              <input type="number" step="0.1" value={item.noteData?.velocity} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, velocity: parseFloat(e.target.value) || 0.8 }})} className="bg-slate-800 text-[11px] font-bold p-2.5 rounded-xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[8px] text-slate-500 uppercase font-black">Duration Override</span>
            <UnitSelector value={item.overrideDurationUnit || 'ms'} onChange={(u) => onUpdate({ overrideDurationUnit: u })} />
          </div>
          <input 
            type="number" 
            step={item.overrideDurationUnit === 'beat' ? 0.25 : 1} 
            placeholder="Latching (Until Release)" 
            value={(item.overrideDuration === null || item.overrideDuration === undefined) ? '' : item.overrideDuration} 
            onChange={(e) => onUpdate({ overrideDuration: e.target.value === '' ? null : parseFloat(e.target.value)})} 
            className="bg-slate-800 text-[11px] font-bold p-2.5 rounded-xl border border-slate-700 outline-none placeholder:text-slate-600 text-slate-200 focus:border-indigo-500" 
          />
        </div>

        {isStepView && (
          <div className="flex items-center justify-between bg-slate-800/50 p-3 rounded-xl border border-slate-700">
            <span className="text-[8px] text-slate-400 uppercase font-black">Sustain until next step</span>
            <input 
              type="checkbox" 
              checked={item.sustainUntilNext || false} 
              onChange={(e) => onUpdate({ sustainUntilNext: e.target.checked })} 
              className="w-5 h-5 accent-indigo-500 rounded-lg cursor-pointer"
            />
          </div>
        )}

        {!isStepView && (
          <div className="flex flex-col gap-1.5 pt-2 border-t border-slate-800">
            <span className="text-[8px] text-slate-500 uppercase font-black">Beat Position</span>
            <input type="number" step="0.25" value={item.beatPosition} onChange={(e) => onUpdate({ beatPosition: parseFloat(e.target.value) || 0 })} className="bg-slate-800 text-[11px] font-bold p-2.5 rounded-xl border border-slate-700 outline-none w-full text-slate-200 focus:border-indigo-500" />
          </div>
        )}
      </div>
    </div>
  );
};
