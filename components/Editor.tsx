
import React, { useState } from 'react';
import { Song, SequenceMode, SequenceItem, DurationUnit } from '../types';
import { EditorSidebar } from './editor/EditorSidebar';
import { TimelineEditor } from './editor/TimelineEditor';
import { v4 as uuidv4 } from 'uuid';

interface EditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}

const UnitSelector: React.FC<{ value: DurationUnit, onChange: (u: DurationUnit) => void }> = ({ value, onChange }) => (
  <div className="flex bg-slate-900 rounded p-0.5 border border-slate-700">
    <button onClick={() => onChange('ms')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'ms' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>ms</button>
    <button onClick={() => onChange('beat')} className={`px-1.5 py-0.5 text-[7px] font-black uppercase rounded ${value === 'beat' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>beat</button>
  </div>
);

const CompactItemEditor: React.FC<{ 
  item: SequenceItem, 
  presets: Song['presets'], 
  onUpdate: (updates: Partial<SequenceItem>) => void, 
  onDelete: () => void,
  isStepView?: boolean
}> = ({ item, presets, onUpdate, onDelete, isStepView }) => {
  return (
    <div className={`${isStepView ? 'w-full' : 'bg-slate-900 p-5 rounded-2xl border border-indigo-500 shadow-2xl w-64 ring-4 ring-slate-950/80 pointer-events-auto'} space-y-4`} onClick={(e) => e.stopPropagation()}>
      <div className="flex items-center justify-between">
        <div className="flex bg-slate-800 rounded-lg p-0.5">
          <button onClick={() => onUpdate({ type: 'preset' })} className={`px-2.5 py-1 text-[8px] font-black uppercase rounded ${item.type === 'preset' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Preset</button>
          <button onClick={() => onUpdate({ type: 'note', noteData: item.noteData || { pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: 500, durationUnit: 'ms' } })} className={`px-2.5 py-1 text-[8px] font-black uppercase rounded ${item.type === 'note' ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>Note</button>
        </div>
        <button onClick={onDelete} className="text-rose-500 p-1 hover:bg-rose-500/10 rounded transition-colors">
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
      <div className="space-y-4">
        {item.type === 'preset' ? (
          <div className="space-y-1">
            <span className="text-[7px] text-slate-500 uppercase font-black">Target Preset</span>
            <select value={item.targetId || ''} onChange={(e) => onUpdate({ targetId: e.target.value })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full text-slate-200">
              <option value="">None</option>
              {presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1">
              <span className="text-[7px] text-slate-500 uppercase font-black">Pitch</span>
              <input type="number" min="0" max="127" value={item.noteData?.pitch} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, pitch: parseInt(e.target.value) || 0 }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none text-slate-200" />
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-[7px] text-slate-500 uppercase font-black">Velocity</span>
              <input type="number" step="0.1" value={item.noteData?.velocity} onChange={(e) => onUpdate({ noteData: { ...item.noteData!, velocity: parseFloat(e.target.value) || 0.8 }})} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none text-slate-200" />
            </div>
          </div>
        )}
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <span className="text-[7px] text-slate-500 uppercase font-black">Duration Override</span>
            <UnitSelector value={item.overrideDurationUnit || 'ms'} onChange={(u) => onUpdate({ overrideDurationUnit: u })} />
          </div>
          <input 
            type="number" 
            step={item.overrideDurationUnit === 'beat' ? 0.25 : 1} 
            placeholder="Hold until release" 
            value={item.overrideDuration === null ? '' : item.overrideDuration} 
            onChange={(e) => onUpdate({ overrideDuration: e.target.value === '' ? null : parseFloat(e.target.value)})} 
            className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none placeholder:text-slate-600 text-slate-200" 
          />
        </div>

        {!isStepView && (
          <div className="flex flex-col gap-1 pt-1 border-t border-slate-800">
            <span className="text-[7px] text-slate-500 uppercase font-black">Beat Position</span>
            <input type="number" step="0.25" value={item.beatPosition} onChange={(e) => onUpdate({ beatPosition: parseFloat(e.target.value) || 0 })} className="bg-slate-800 text-[10px] font-bold p-2 rounded border border-slate-700 outline-none w-full text-slate-200" />
          </div>
        )}
      </div>
    </div>
  );
};

const Editor: React.FC<EditorProps> = ({ song, onUpdateSong, sendNoteOn, sendNoteOff }) => {
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'sequences' | 'mappings'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(song.presets?.[0]?.id || null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(song.sequences?.[0]?.id || null);

  const selectedSequence = song.sequences.find(s => s.id === selectedSequenceId);

  return (
    <div className="h-full flex flex-col gap-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex flex-col gap-4 flex-shrink-0">
        <div className="flex items-center gap-6">
          <input type="text" value={song.name} onChange={(e) => onUpdateSong({ ...song, name: e.target.value })} className="bg-transparent text-3xl font-black focus:outline-none border-b-2 border-transparent focus:border-indigo-600 transition-colors py-1 flex-1" />
          <div className="bg-slate-900 px-4 py-2 rounded-xl border border-slate-800 shadow-lg"><span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">BPM: {song.bpm}</span></div>
        </div>
        <div className="flex gap-8 border-b border-slate-800">
          {(['presets', 'sequences', 'mappings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveSubTab(tab)} className={`pb-3 px-1 text-xs font-black uppercase tracking-widest relative transition-all ${activeSubTab === tab ? 'text-indigo-400' : 'text-slate-500 hover:text-slate-300'}`}>
              {tab} {activeSubTab === tab && <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-indigo-500 shadow-[0_0_10px_rgba(99,102,241,0.5)]" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {(activeSubTab === 'presets' || activeSubTab === 'sequences') && (
          <div className="flex h-full gap-6">
            <EditorSidebar song={song} onUpdateSong={onUpdateSong} activeTab={activeSubTab} selectedPresetId={selectedPresetId} onSelectPreset={setSelectedPresetId} selectedSequenceId={selectedSequenceId} onSelectSequence={setSelectedSequenceId} />
            <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 flex flex-col min-w-0 shadow-2xl overflow-hidden relative">
              {activeSubTab === 'presets' ? (
                <div className="flex items-center justify-center h-full text-slate-700 font-black uppercase tracking-widest opacity-50">Select a preset to begin editing</div>
              ) : selectedSequence ? (
                <div className="flex flex-col h-full overflow-hidden">
                  <div className="flex items-center justify-between mb-8 flex-shrink-0">
                    <input className="bg-transparent font-black text-3xl text-white focus:outline-none w-full max-w-md border-b border-transparent focus:border-slate-800 transition-all" value={selectedSequence.name} onChange={(e) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, name: e.target.value} : s)})} />
                    <select value={selectedSequence.mode} onChange={(e) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, mode: e.target.value as SequenceMode} : s)})} className="bg-slate-800 text-[10px] font-black uppercase p-2 rounded-lg border border-slate-700 outline-none text-slate-300">
                      <option value={SequenceMode.STEP}>Sequential (STEP)</option>
                      <option value={SequenceMode.AUTO}>Timeline (AUTO)</option>
                    </select>
                  </div>
                  <div className="flex-1 overflow-auto custom-scrollbar relative">
                    {selectedSequence.mode === SequenceMode.AUTO ? (
                      <TimelineEditor 
                        sequence={selectedSequence} 
                        song={song} 
                        onUpdate={(u) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, ...u} : s)})} 
                        renderItemEditor={(item, isEditing, setEditing) => (
                          <div className="absolute top-12 left-0 z-[100] animate-in zoom-in-95 fade-in slide-in-from-top-2 duration-200">
                            <CompactItemEditor 
                              item={item} 
                              presets={song.presets} 
                              onUpdate={(u) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, items: s.items.map(i => i.id === item.id ? {...i, ...u} : i)} : s)})}
                              onDelete={() => { onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, items: s.items.filter(i => i.id !== item.id)} : s)}); setEditing(null); }} 
                            />
                            <div className="fixed inset-0 z-[-1]" onClick={() => setEditing(null)} />
                          </div>
                        )} 
                      />
                    ) : (
                      <div className="flex gap-4 p-4 min-h-[300px]">
                        {selectedSequence.items.map((item, idx) => (
                          <div key={item.id} className="flex-shrink-0 w-64 bg-slate-800/20 p-4 rounded-2xl relative border border-slate-800 hover:border-slate-700 transition-colors shadow-lg self-start">
                            <div className="absolute -top-3 -left-3 w-8 h-8 bg-indigo-600 rounded-full flex items-center justify-center text-[12px] font-black shadow-xl z-10 ring-4 ring-slate-900">{idx + 1}</div>
                            <CompactItemEditor 
                              item={item} 
                              presets={song.presets} 
                              isStepView 
                              onUpdate={(u) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, items: s.items.map(i => i.id === item.id ? {...i, ...u} : i)} : s)})}
                              onDelete={() => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, items: s.items.filter(i => i.id !== item.id)} : s)})} 
                            />
                          </div>
                        ))}
                        <button onClick={() => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, items: [...s.items, { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: s.items.length, overrideDuration: null, overrideDurationUnit: 'ms' }]} : s)})} className="flex-shrink-0 w-20 h-40 border-2 border-dashed border-slate-800 rounded-2xl flex items-center justify-center text-slate-700 hover:text-indigo-500 hover:border-indigo-500 transition-all">+</button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-slate-700 font-black uppercase tracking-widest opacity-50">Select a sequence to begin editing</div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'mappings' && (
          <div className="h-full bg-slate-900 rounded-3xl border border-slate-800 p-10 flex flex-col shadow-2xl overflow-hidden">
            <div className="flex justify-between items-center mb-10">
              <div>
                <h3 className="text-3xl font-black text-white">Input Mapping</h3>
                <p className="text-xs text-slate-500 font-black uppercase tracking-widest mt-1">Bind MIDI Controllers or Keyboard Keys to Actions</p>
              </div>
              <button onClick={() => onUpdateSong({ ...song, mappings: [...song.mappings, { id: uuidv4(), triggerType: 'keyboard', isRange: false, triggerValue: '', triggerChannel: 0, triggerStart: '', triggerEnd: '', actionType: 'preset', actionTargetId: '', isEnabled: true }] })} className="bg-indigo-600 px-8 py-4 rounded-2xl font-black uppercase text-[10px] hover:bg-indigo-500 shadow-lg">+ New Mapping</button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
              {song.mappings.map(map => (
                <div key={map.id} className={`grid grid-cols-[120px_200px_1fr_40px] gap-8 bg-slate-800/10 p-6 rounded-3xl items-center border border-slate-800/50 hover:bg-slate-800/20 transition-all ${!map.isEnabled && 'opacity-40 grayscale'}`}>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Trigger Type</span><select value={map.triggerType} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerType: e.target.value as any} : m)})} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 text-slate-200"><option value="keyboard">Keyboard</option><option value="midi">MIDI</option></select></div>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Source Value</span><input type="text" value={map.triggerValue} onChange={(e) => onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, triggerValue: e.target.value} : m)})} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 text-slate-200" placeholder="Key or Pitch #" /></div>
                   <div className="flex flex-col gap-1"><span className="text-[8px] text-slate-600 font-black uppercase">Target Performance Unit</span><select value={map.actionTargetId} onChange={(e) => { const tid = e.target.value; const isS = song.sequences.some(s => s.id === tid); onUpdateSong({...song, mappings: song.mappings.map(m => m.id === map.id ? {...m, actionTargetId: tid, actionType: isS ? 'sequence' : 'preset'} : m)}); }} className="bg-slate-900 p-2.5 rounded-xl text-[10px] font-bold border border-slate-700 outline-none focus:border-indigo-500 text-slate-200"><option value="">Select Target...</option><optgroup label="Presets">{song.presets.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup><optgroup label="Sequences">{song.sequences.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</optgroup></select></div>
                   <button onClick={() => onUpdateSong({ ...song, mappings: song.mappings.filter(m => m.id !== map.id) })} className="text-slate-600 hover:text-rose-500 transition-colors flex justify-center"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Editor;
