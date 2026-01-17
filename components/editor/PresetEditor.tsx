
import React, { useState, useMemo } from 'react';
import { NotePreset, Song, NoteItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { PianoView, midiToNoteName } from './PianoView';
import { UnitSelector } from './Common';

interface PresetEditorProps {
  preset: NotePreset;
  song: Song;
  onUpdate: (u: Partial<NotePreset>) => void;
  sendNoteOn: any;
  sendNoteOff: any;
}

export const PresetEditor: React.FC<PresetEditorProps> = ({ preset, song, onUpdate, sendNoteOn, sendNoteOff }) => {
  const [activeTab, setActiveTab] = useState<'notes' | 'glissando'>('notes');
  const [defaultChannel, setDefaultChannel] = useState(1);

  const activePitches = useMemo(() => new Set(preset.notes.map(n => n.pitch)), [preset.notes]);

  const addNote = (pitch: number = 60) => {
    const newNote: NoteItem = { id: uuidv4(), pitch, velocity: 0.8, channel: defaultChannel, preDelay: 0, duration: null, durationUnit: 'ms' };
    onUpdate({ notes: [...preset.notes, newNote] });
  };

  const updateNote = (id: string, u: Partial<NoteItem>) => {
    onUpdate({ notes: preset.notes.map(n => n.id === id ? { ...n, ...u } : n) });
  };

  const removeNote = (id: string) => {
    onUpdate({ notes: preset.notes.filter(n => n.id !== id) });
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex flex-col gap-4 mb-8 flex-shrink-0">
        <div className="flex items-center justify-between">
          <input 
            className="bg-transparent font-black text-4xl text-white focus:outline-none w-full max-w-md border-b-2 border-transparent focus:border-indigo-600 transition-all py-1" 
            value={preset.name} 
            onChange={(e) => onUpdate({ name: e.target.value })} 
          />
          <div className="flex gap-4">
            <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-inner">
              <span className="text-[9px] font-black text-slate-500 uppercase px-2">Folder</span>
              <select 
                value={preset.folderId || ''} 
                onChange={(e) => onUpdate({ folderId: e.target.value || null })}
                className="bg-slate-900 text-[11px] font-bold p-1.5 rounded-lg border border-slate-700 outline-none text-slate-200 focus:border-indigo-500"
              >
                <option value="">Root / None</option>
                {song.presetFolders.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2 bg-slate-800 p-2 rounded-xl border border-slate-700 shadow-inner">
              <span className="text-[9px] font-black text-slate-500 uppercase px-2">Test Ch</span>
              <input type="number" min="1" max="16" value={defaultChannel} onChange={(e) => setDefaultChannel(parseInt(e.target.value) || 1)} className="bg-slate-900 text-[11px] font-bold w-12 p-1.5 rounded-lg border border-slate-700 outline-none text-slate-200 text-center focus:border-indigo-500" />
            </div>
            <div className="flex bg-slate-800 p-1.5 rounded-2xl border border-slate-700 shadow-xl">
              <button onClick={() => setActiveTab('notes')} className={`px-6 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all ${activeTab === 'notes' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Notes List</button>
              <button onClick={() => setActiveTab('glissando')} className={`px-6 py-2.5 text-[10px] font-black uppercase rounded-xl transition-all ${activeTab === 'glissando' ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>Glissando</button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 flex flex-col min-h-0 space-y-8">
        {activeTab === 'notes' ? (
          <>
            <PianoView activePitches={activePitches} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} channel={defaultChannel} />
            
            <div className="flex-1 overflow-y-auto space-y-4 pr-3 custom-scrollbar">
              <div className="flex items-center justify-between sticky top-0 bg-slate-900 z-10 py-3 border-b border-slate-800/50">
                  <h4 className="text-[11px] font-black uppercase text-slate-500 tracking-widest">Chord / Note Configuration</h4>
                  <button onClick={() => addNote()} className="bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase px-6 py-3 rounded-2xl transition-all shadow-xl active:scale-95">+ Add New Note</button>
              </div>
              <div className="grid grid-cols-1 gap-4">
                  {preset.notes.map((note) => (
                  <div key={note.id} className="grid grid-cols-[1fr_90px_90px_100px_120px_40px] gap-6 bg-slate-800/40 border border-slate-800/60 p-6 rounded-3xl items-center hover:bg-slate-800/60 transition-all group animate-in slide-in-from-right-3 duration-200">
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Pitch ({midiToNoteName(note.pitch)})</span>
                        <div className="flex gap-2">
                            <input type="number" min="0" max="127" value={note.pitch} onChange={(e) => updateNote(note.id, { pitch: parseInt(e.target.value) || 0 })} className="bg-slate-950 text-[12px] font-bold p-3.5 rounded-2xl border border-slate-700 outline-none text-slate-200 flex-1 focus:border-indigo-500" />
                            <button onMouseDown={() => sendNoteOn(note.pitch, note.velocity, note.channel, null)} onMouseUp={() => sendNoteOff(note.pitch, note.channel)} className="p-3.5 bg-indigo-600/10 text-indigo-400 rounded-2xl hover:bg-indigo-600 hover:text-white transition-all shadow-inner border border-indigo-500/10"><svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg></button>
                        </div>
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Velocity</span>
                        <input type="number" step="0.1" min="0" max="1" value={note.velocity} onChange={(e) => updateNote(note.id, { velocity: parseFloat(e.target.value) || 0 })} className="bg-slate-950 text-[12px] font-bold p-3.5 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Channel</span>
                        <input type="number" min="1" max="16" value={note.channel} onChange={(e) => updateNote(note.id, { channel: parseInt(e.target.value) || 1 })} className="bg-slate-950 text-[12px] font-bold p-3.5 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <span className="text-[9px] text-slate-500 uppercase font-black">Delay (ms)</span>
                        <input type="number" min="0" value={note.preDelay} onChange={(e) => updateNote(note.id, { preDelay: parseInt(e.target.value) || 0 })} className="bg-slate-950 text-[12px] font-bold p-3.5 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
                      </div>
                      <div className="flex flex-col gap-2">
                        <div className="flex items-center justify-between">
                            <span className="text-[9px] text-slate-500 uppercase font-black">Duration</span>
                            <UnitSelector value={note.durationUnit} onChange={(u) => updateNote(note.id, { durationUnit: u })} />
                        </div>
                        <input type="number" placeholder="Latching" value={note.duration === null ? '' : note.duration} onChange={(e) => updateNote(note.id, { duration: e.target.value === '' ? null : parseFloat(e.target.value) })} className="bg-slate-950 text-[12px] font-bold p-3.5 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500 placeholder:text-slate-700" />
                      </div>
                      <button onClick={() => removeNote(note.id)} className="text-slate-700 hover:text-rose-500 transition-all p-2 mt-6 opacity-40 group-hover:opacity-100"><svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                  ))}
                  {preset.notes.length === 0 && (
                    <div className="py-24 border-2 border-dashed border-slate-800/50 rounded-[40px] flex flex-col items-center justify-center text-slate-700">
                      <svg className="w-16 h-16 mb-4 opacity-20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3" /></svg>
                      <p className="text-sm font-black uppercase tracking-[0.2em] opacity-40">Preset is empty</p>
                      <button onClick={() => addNote()} className="mt-6 text-indigo-500 hover:text-indigo-400 font-black uppercase text-xs tracking-widest bg-indigo-500/5 px-6 py-3 rounded-2xl border border-indigo-500/10">Add Note</button>
                    </div>
                  )}
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-y-auto space-y-12 pr-3 custom-scrollbar p-10 bg-slate-900/40 rounded-[40px] border border-slate-800/60 shadow-inner">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xl font-black text-indigo-400 tracking-tight">Glissando Performance</h4>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Automatic "Roll-up" effect for chord triggers</p>
              </div>
              <button 
                onClick={() => onUpdate({ glissando: preset.glissando ? undefined : { attackEnabled: true, releaseEnabled: false, lowestNote: 48, targetNote: 60, speed: 50, mode: 'white', lowestVelocity: 0.5, targetVelocity: 0.8 } })} 
                className={`px-8 py-4 rounded-2xl text-[11px] font-black uppercase transition-all shadow-2xl ${preset.glissando ? 'bg-rose-600/10 text-rose-500 border border-rose-500/20' : 'bg-indigo-600 text-white'}`}
              >
                {preset.glissando ? 'Disable Component' : 'Enable Component'}
              </button>
            </div>

            {preset.glissando ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-16">
                <div className="space-y-8">
                  <div className="grid grid-cols-2 gap-8">
                    <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 space-y-4">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">On Attack</label>
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={preset.glissando.attackEnabled} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, attackEnabled: e.target.checked }})} className="w-7 h-7 accent-indigo-500 cursor-pointer" />
                        <span className="text-sm font-bold text-slate-300">Run on Press</span>
                      </div>
                    </div>
                    <div className="bg-slate-950 p-6 rounded-3xl border border-slate-800 space-y-4">
                      <label className="text-[10px] text-slate-500 font-black uppercase tracking-widest">On Release</label>
                      <div className="flex items-center gap-4">
                        <input type="checkbox" checked={preset.glissando.releaseEnabled} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, releaseEnabled: e.target.checked }})} className="w-7 h-7 accent-indigo-500 cursor-pointer" />
                        <span className="text-sm font-bold text-slate-300">Run on Release</span>
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-950 p-8 rounded-[32px] border border-slate-800 space-y-8">
                    <div className="grid grid-cols-2 gap-8">
                       <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Start Pitch ({midiToNoteName(preset.glissando.lowestNote)})</span>
                        <input type="number" min="0" max="127" value={preset.glissando.lowestNote} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, lowestNote: parseInt(e.target.value) || 0 }})} className="bg-slate-900 text-[13px] font-bold p-4 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
                      </div>
                      <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Speed (ms)</span>
                        <input type="number" min="1" value={preset.glissando.speed} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, speed: parseInt(e.target.value) || 0 }})} className="bg-slate-900 text-[13px] font-bold p-4 rounded-2xl border border-slate-700 outline-none text-slate-200 focus:border-indigo-500" />
                      </div>
                    </div>
                    <div className="flex flex-col gap-3">
                      <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Note Range Selection</span>
                      <div className="flex bg-slate-900 p-1.5 rounded-2xl border border-slate-700">
                        {(['white', 'black', 'both'] as const).map(m => (
                          <button key={m} onClick={() => onUpdate({ glissando: { ...preset.glissando!, mode: m }})} className={`flex-1 py-3 text-[10px] font-black uppercase rounded-xl transition-all ${preset.glissando?.mode === m ? 'bg-slate-700 text-white shadow-inner' : 'text-slate-500 hover:text-slate-300'}`}>{m}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-950 p-8 rounded-[32px] border border-slate-800 space-y-8">
                   <h5 className="text-[10px] text-slate-500 font-black uppercase tracking-widest">Velocity Dynamics</h5>
                   <div className="space-y-12">
                     <div className="space-y-4">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-500 uppercase">Starting Velocity</span>
                          <span className="text-indigo-400 font-black">{Math.round(preset.glissando.lowestVelocity * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={preset.glissando.lowestVelocity} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, lowestVelocity: parseFloat(e.target.value) }})} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-indigo-500" />
                     </div>
                     <div className="space-y-4">
                        <div className="flex justify-between text-xs font-bold">
                          <span className="text-slate-500 uppercase">Target (Peak) Velocity</span>
                          <span className="text-indigo-400 font-black">{Math.round(preset.glissando.targetVelocity * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="1" step="0.01" value={preset.glissando.targetVelocity} onChange={(e) => onUpdate({ glissando: { ...preset.glissando!, targetVelocity: parseFloat(e.target.value) }})} className="w-full h-1.5 bg-slate-800 rounded-full appearance-none accent-indigo-500" />
                     </div>
                   </div>
                   <div className="p-6 bg-indigo-500/5 rounded-3xl border border-indigo-500/10 text-[11px] text-slate-400 font-medium leading-relaxed">
                     <p>Glissando creates a sequence of notes from the "Start Pitch" to each individual note in your preset. It's triggered either when you press the mapped key (Attack) or when you release it (Release).</p>
                   </div>
                </div>
              </div>
            ) : (
              <div className="py-24 flex flex-col items-center justify-center text-slate-700 opacity-40 space-y-4">
                 <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="1" d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                 <p className="text-sm font-black uppercase tracking-[0.3em]">Glissando is not active</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
