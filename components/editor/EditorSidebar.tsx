
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

  const deleteFolder = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    onUpdateSong({
      ...song,
      presetFolders: song.presetFolders.filter(f => f.id !== id),
      presets: song.presets.map(p => p.folderId === id ? { ...p, folderId: null } : p)
    });
  };

  const updateFolderName = (id: string, name: string) => {
    onUpdateSong({
      ...song,
      presetFolders: song.presetFolders.map(f => f.id === id ? { ...f, name } : f)
    });
  };

  const duplicatePreset = (id: string) => {
    const original = song.presets.find(p => p.id === id);
    if (!original) return;
    const newPreset: NotePreset = {
      ...original,
      id: uuidv4(),
      name: `${original.name} (Copy)`,
      notes: original.notes.map(n => ({ ...n, id: uuidv4() }))
    };
    onUpdateSong({ ...song, presets: [...song.presets, newPreset] });
    onSelectPreset(newPreset.id);
  };

  const duplicateSequence = (id: string) => {
    const original = song.sequences.find(s => s.id === id);
    if (!original) return;
    const newSequence: Sequence = {
      ...original,
      id: uuidv4(),
      name: `${original.name} (Copy)`,
      items: original.items.map(i => ({ ...i, id: uuidv4() }))
    };
    onUpdateSong({ ...song, sequences: [...song.sequences, newSequence] });
    onSelectSequence(newSequence.id);
  };

  const renderItem = (
    item: { id: string, name: string, subLabel?: string }, 
    isSelected: boolean, 
    onSelect: () => void, 
    onDelete: () => void,
    onDuplicate: () => void
  ) => (
    <div key={item.id} onClick={onSelect} className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer border transition-all ${isSelected ? 'bg-indigo-600/20 border-indigo-500/50 shadow-lg scale-[1.02]' : 'border-transparent text-slate-400 hover:bg-slate-800/50'}`}>
      <div className="flex flex-col min-w-0 flex-1">
        <span className="text-xs font-bold truncate pr-1">{item.name}</span>
        {item.subLabel && <span className="text-[8px] font-black uppercase opacity-40">{item.subLabel}</span>}
      </div>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button 
          onClick={(e) => { e.stopPropagation(); onDuplicate(); }} 
          title="Duplicate"
          className="p-1 hover:text-indigo-400 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M8 7v8a2 2 0 002 2h6M8 7V5a2 2 0 012-2h4.586a1 1 0 01.707.293l4.414 4.414a1 1 0 01.293.707V15a2 2 0 01-2 2h-2M8 7H6a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2v-2" /></svg>
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onDelete(); }} 
          title="Delete"
          className="p-1 hover:text-rose-500 transition-all"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
        </button>
      </div>
    </div>
  );

  return (
    <div className="w-72 flex flex-col gap-4 bg-slate-900/60 rounded-3xl p-5 border border-slate-800 overflow-y-auto custom-scrollbar shadow-inner backdrop-blur-sm">
      {activeTab === 'presets' ? (
        <>
          <div className="flex gap-2">
            <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, presets: [...song.presets, {id, name: "New Preset", notes: []}]}); onSelectPreset(id); }} className="flex-1 py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg transition-all">+ Preset</button>
            <button onClick={() => { const nf = { id: uuidv4(), name: "New Folder" }; onUpdateSong({...song, presetFolders: [...(song.presetFolders || []), nf]}); setRenamingFolderId(nf.id); }} className="px-3 bg-slate-800 rounded-xl text-slate-400 hover:text-white transition-colors border border-slate-700 shadow-inner"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" /></svg></button>
          </div>
          <div className="space-y-1">
            <h3 className="px-2 pb-1 text-[9px] font-black uppercase text-slate-600 tracking-widest">Ungrouped</h3>
            {song.presets.filter(p => !p.folderId).map(p => renderItem(
              {id: p.id, name: p.name, subLabel: `${p.notes.length} Notes`}, 
              selectedPresetId === p.id, 
              () => onSelectPreset(p.id), 
              () => onUpdateSong({...song, presets: song.presets.filter(x => x.id !== p.id)}),
              () => duplicatePreset(p.id)
            ))}
          </div>
          {(song.presetFolders || []).map(folder => (
            <div key={folder.id} className="space-y-1 mt-2">
              <div className="flex items-center justify-between px-2 py-2 group bg-slate-800/30 rounded-xl border border-slate-800/50 hover:bg-slate-800/50 transition-colors">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <button onClick={() => toggleFolder(folder.id)} className={`transition-transform duration-200 ${expandedFolders.has(folder.id) ? 'rotate-90 text-indigo-400' : 'text-slate-600'}`}>
                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 20 20"><path d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"/></svg>
                  </button>
                  {renamingFolderId === folder.id ? (
                    <input 
                      autoFocus 
                      className="bg-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded outline-none border border-indigo-500 w-full"
                      value={folder.name} 
                      onChange={(e) => updateFolderName(folder.id, e.target.value)} 
                      onBlur={() => setRenamingFolderId(null)} 
                      onKeyDown={(e) => e.key === 'Enter' && setRenamingFolderId(null)}
                    />
                  ) : (
                    <span onClick={() => toggleFolder(folder.id)} className={`text-[10px] font-black uppercase truncate cursor-pointer ${expandedFolders.has(folder.id) ? 'text-indigo-400' : 'text-slate-500'}`}>{folder.name}</span>
                  )}
                </div>
                <div className="flex opacity-0 group-hover:opacity-100 transition-opacity gap-1">
                  <button onClick={() => setRenamingFolderId(folder.id)} className="p-1 hover:text-indigo-400">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" /></svg>
                  </button>
                  <button onClick={(e) => deleteFolder(folder.id, e)} className="p-1 hover:text-rose-500">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                  </button>
                </div>
              </div>
              {expandedFolders.has(folder.id) && (
                <div className="pl-4 space-y-1 border-l-2 border-slate-800 ml-3 mt-1 animate-in slide-in-from-top-1 duration-200">
                  {song.presets.filter(p => p.folderId === folder.id).map(p => renderItem(
                    {id: p.id, name: p.name, subLabel: `${p.notes.length} Notes`}, 
                    selectedPresetId === p.id, 
                    () => onSelectPreset(p.id), 
                    () => onUpdateSong({...song, presets: song.presets.filter(x => x.id !== p.id)}),
                    () => duplicatePreset(p.id)
                  ))}
                  {song.presets.filter(p => p.folderId === folder.id).length === 0 && <span className="text-[8px] font-black uppercase text-slate-700 block py-2">Empty Folder</span>}
                </div>
              )}
            </div>
          ))}
        </>
      ) : (
        <>
          <button onClick={() => { const id = uuidv4(); onUpdateSong({...song, sequences: [...song.sequences, {id, name: "New Sequence", mode: SequenceMode.STEP, items: [], gridSnap: 1.0}]}); onSelectSequence(id); }} className="w-full py-3 bg-indigo-600 rounded-xl text-[10px] font-black uppercase text-white hover:bg-indigo-500 shadow-lg transition-all">+ Sequence</button>
          <div className="space-y-1 mt-2">
            <h3 className="px-2 pb-1 text-[9px] font-black uppercase text-slate-600 tracking-widest">All Sequences</h3>
            {song.sequences.map(s => renderItem(
              {id: s.id, name: s.name, subLabel: s.mode}, 
              selectedSequenceId === s.id, 
              () => onSelectSequence(s.id), 
              () => onUpdateSong({...song, sequences: song.sequences.filter(x => x.id !== s.id)}),
              () => duplicateSequence(s.id)
            ))}
          </div>
        </>
      )}
    </div>
  );
};
