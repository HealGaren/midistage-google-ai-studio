
import React, { useState } from 'react';
import { Song, SequenceMode, NotePreset, Sequence, Scene } from '../types';
import { EditorSidebar } from './editor/EditorSidebar';
import { PresetEditor } from './editor/PresetEditor';
import { SequenceEditor } from './editor/SequenceEditor';
import { MappingEditor } from './editor/MappingEditor';
import { SceneEditor } from './editor/SceneEditor';

interface EditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
  selectedInputId: string;
}

const Editor: React.FC<EditorProps> = ({ song, onUpdateSong, sendNoteOn, sendNoteOff, selectedInputId }) => {
  const [activeSubTab, setActiveSubTab] = useState<'presets' | 'sequences' | 'scenes' | 'mappings'>('presets');
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(song.presets?.[0]?.id || null);
  const [selectedSequenceId, setSelectedSequenceId] = useState<string | null>(song.sequences?.[0]?.id || null);

  const selectedSequence = song.sequences.find(s => s.id === selectedSequenceId);
  const selectedPreset = song.presets.find(p => p.id === selectedPresetId);

  return (
    <div className="h-full flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-6 flex-shrink-0">
        <div className="flex items-center gap-10">
          <input 
            type="text" 
            value={song.name} 
            onChange={(e) => onUpdateSong({ ...song, name: e.target.value })} 
            className="bg-transparent text-5xl font-black focus:outline-none border-b-4 border-transparent focus:border-indigo-600 transition-all py-2 flex-1 tracking-tight" 
          />
          <div className="bg-slate-900/50 backdrop-blur-md px-6 py-3 rounded-[20px] border border-slate-800 shadow-2xl flex items-center gap-4">
            <span className="text-[11px] font-black text-slate-500 uppercase tracking-[0.2em]">Master BPM</span>
            <span className="text-2xl font-black text-indigo-400">{song.bpm}</span>
          </div>
        </div>
        <div className="flex gap-12 border-b border-slate-800/50">
          {(['presets', 'sequences', 'scenes', 'mappings'] as const).map(tab => (
            <button 
              key={tab} 
              onClick={() => setActiveSubTab(tab)} 
              className={`pb-5 px-2 text-[11px] font-black uppercase tracking-[0.25em] relative transition-all ${activeSubTab === tab ? 'text-indigo-400' : 'text-slate-600 hover:text-slate-300'}`}
            >
              {tab} 
              {activeSubTab === tab && <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500 shadow-[0_0_20px_rgba(99,102,241,1)] rounded-t-full" />}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-hidden min-h-0">
        {(activeSubTab === 'presets' || activeSubTab === 'sequences') && (
          <div className="flex h-full gap-8">
            <EditorSidebar 
              song={song} 
              onUpdateSong={onUpdateSong} 
              activeTab={activeSubTab} 
              selectedPresetId={selectedPresetId} 
              onSelectPreset={setSelectedPresetId} 
              selectedSequenceId={selectedSequenceId} 
              onSelectSequence={setSelectedSequenceId} 
            />
            <div className="flex-1 bg-slate-900 rounded-[48px] border border-slate-800 p-10 flex flex-col min-w-0 shadow-2xl overflow-hidden relative">
              {activeSubTab === 'presets' ? (
                selectedPreset ? (
                  <PresetEditor 
                    preset={selectedPreset} 
                    song={song}
                    onUpdate={(u) => onUpdateSong({ ...song, presets: song.presets.map(p => p.id === selectedPreset.id ? { ...p, ...u } : p) })}
                    sendNoteOn={sendNoteOn}
                    sendNoteOff={sendNoteOff}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-slate-700 font-black uppercase tracking-[0.3em] opacity-30">Select a preset to begin editing</div>
                )
              ) : selectedSequence ? (
                <SequenceEditor 
                  sequence={selectedSequence}
                  song={song}
                  onUpdate={(u) => onUpdateSong({...song, sequences: song.sequences.map(s => s.id === selectedSequence.id ? {...s, ...u} : s)})}
                  onUpdateSong={onUpdateSong}
                />
              ) : (
                <div className="h-full flex items-center justify-center text-slate-700 font-black uppercase tracking-[0.3em] opacity-30">Select a sequence to begin editing</div>
              )}
            </div>
          </div>
        )}

        {activeSubTab === 'scenes' && (
          <SceneEditor song={song} onUpdateSong={onUpdateSong} />
        )}

        {activeSubTab === 'mappings' && (
          <MappingEditor song={song} onUpdateSong={onUpdateSong} selectedInputId={selectedInputId} />
        )}
      </div>
    </div>
  );
};

export default Editor;
