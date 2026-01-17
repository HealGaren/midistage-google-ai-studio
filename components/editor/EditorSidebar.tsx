
import React, { useState } from 'react';
import { NotePreset, Sequence, PresetFolder, Song, SequenceMode } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface EditorSidebarProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  selectedPresetId: string | null;
  onSelectPreset: (id: string) => void;
  selectedSequenceId: string | null;
  onSelectSequence: (id: string) => void;
  activeTab: 'presets' | 'sequences';
}

export const EditorSidebar: React.FC<EditorSidebarProps> = ({ 
  song, onUpdateSong, selectedPresetId, onSelectPreset, selectedSequenceId, onSelectSequence, activeTab 
}) => {
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [renamingFolderId, setRenamingFolderId] = useState<string | null>(null);

  const toggleFolder = (id: string) => {
    const next = new Set(expandedFolders);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExpandedFolders(next);
  };

  const renderItem = (item: { id: string, name: string, subLabel?: string }, isSelected: boolean, onSelect: () => void, onDelete: () => void) => (
    <div key={item.id} onClick={onSelect} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${isSelected ? 'bg-indigo-600/15 border-indigo-500/50' : 'border-transparent text-slate-400 hover:bg-slate-800/50'}`}>
      <div className="flex flex-col min-w-0">
        <span className="text-xs font-bold truncate pr-1">{item.name}</span>
        {item.subLabel && <span className="text-[8px] font-black uppercase opacity-40">{item.subLabel}</span>}
      </div>
      <button onClick={(e) => { e.stopPropagation(); onDelete(); }} className="opacity-0 group-hover:opacity-100 p-1 hover:text-rose-500 transition-all">
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
      </button>
    </div>
  );

  return (
    <div className="w-72 flex flex-col gap-3 bg-slate-900/40 rounded-2xl p-4 border border-slate-800 overflow-y-auto custom-scrollbar shadow-inner">
      {activeTab === 'presets' ? (
        <>
          <div className="flex gap-2">
            <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, presets: [...song.presets, {id, name: "New Preset", notes: []}]}); onSelectPreset(id); }} className="flex-1 py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg">+ Preset</button>
            <button onClick={() => { const nf = { id: uuidv4(), name: "New Folder" }; onUpdateSong({...song, presetFolders: [...(song.presetFolders || []), nf]}); setRenamingFolderId(nf.id); }} className="px-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
          </div>
          <div className="space-y-1">
            {song.presets.filter(p => !p.folderId).map(p => renderItem({id: p.id, name: p.name, subLabel: `${p.notes.length} Notes`}, selectedPresetId === p.id, () => onSelectPreset(p.id), () => onUpdateSong({...song, presets: song.presets.filter(x => x.id !== p.id)})))}
          </div>
          {(song.presetFolders || []).map(folder => (
            <div key={folder.id} className="space-y-1 mt-2">
              <div className="flex items-center justify-between px-2 py-1 group bg-slate-800/20 rounded-lg">
                <button onClick={() => toggleFolder(folder.id)} className={`text-[10px] font-black uppercase truncate flex-1 text-left ${expandedFolders.has(folder.id) ? 'text-indigo-400' : 'text-slate-500'}`}>{folder.name}</button>
              </div>
              {expandedFolders.has(folder.id) && (
                <div className="pl-3 space-y-1 border-l border-slate-800 ml-1.5 mt-1">
                  {song.presets.filter(p => p.folderId === folder.id).map(p => renderItem({id: p.id, name: p.name}, selectedPresetId === p.id, () => onSelectPreset(p.id), () => onUpdateSong({...song, presets: song.presets.filter(x => x.id !== p.id)})))}
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, sequences: [...song.sequences, {id, name: "New Sequence", mode: SequenceMode.STEP, items: [], gridSnap: 1.0}]}); onSelectSequence(id); }} className="w-full py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg">+ Sequence</button>
          {song.sequences.map(s => renderItem({id: s.id, name: s.name, subLabel: s.mode}, selectedSequenceId === s.id, () => onSelectSequence(s.id), () => onUpdateSong({...song, sequences: song.sequences.filter(x => x.id !== s.id)})))}
        </>
      )}
    </div>
  );
};
