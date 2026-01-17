
import React from 'react';
import { Song, Scene, InputMapping } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface SceneEditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
}

export const SceneEditor: React.FC<SceneEditorProps> = ({ song, onUpdateSong }) => {
  const addScene = () => {
    const newScene: Scene = { id: uuidv4(), name: `Scene ${song.scenes.length + 1}`, mappingIds: [] };
    onUpdateSong({ ...song, scenes: [...song.scenes, newScene] });
  };

  const removeScene = (id: string) => {
    if (song.scenes.length <= 1) return;
    const newScenes = song.scenes.filter(s => s.id !== id);
    onUpdateSong({
      ...song,
      scenes: newScenes,
      activeSceneId: song.activeSceneId === id ? newScenes[0].id : song.activeSceneId
    });
  };

  const updateScene = (id: string, updates: Partial<Scene>) => {
    onUpdateSong({
      ...song,
      scenes: song.scenes.map(s => s.id === id ? { ...s, ...updates } : s)
    });
  };

  const toggleMappingForScene = (sceneId: string, mappingId: string) => {
    const scene = song.scenes.find(s => s.id === sceneId);
    if (!scene) return;
    
    const newMappingIds = scene.mappingIds.includes(mappingId)
      ? scene.mappingIds.filter(id => id !== mappingId)
      : [...scene.mappingIds, mappingId];
      
    updateScene(sceneId, { mappingIds: newMappingIds });
  };

  const localMappings = song.mappings.filter(m => m.scope === 'scene');

  return (
    <div className="h-full bg-slate-900 rounded-[40px] border border-slate-800 p-12 flex flex-col shadow-2xl overflow-hidden">
      <div className="flex justify-between items-center mb-12">
        <div>
          <h3 className="text-4xl font-black text-white tracking-tight">Performance Scenes</h3>
          <p className="text-[11px] text-slate-500 font-black uppercase tracking-[0.2em] mt-2">Activate specific mapping groups for each scene</p>
        </div>
        <button 
          onClick={addScene} 
          className="bg-indigo-600 px-10 py-5 rounded-[24px] font-black uppercase text-[11px] hover:bg-indigo-500 shadow-xl transition-all"
        >
          + Add New Scene
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-6 overflow-y-auto pr-4 custom-scrollbar">
        {song.scenes.map((scene) => (
          <div key={scene.id} className={`p-8 rounded-[32px] border transition-all flex flex-col gap-6 h-full ${song.activeSceneId === scene.id ? 'bg-indigo-600/10 border-indigo-500/50 shadow-inner ring-1 ring-indigo-500/20' : 'bg-slate-950/40 border-slate-800 hover:bg-slate-800/20'}`}>
            <div className="flex items-center justify-between">
                <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Scene Name</span>
                {song.activeSceneId === scene.id && <span className="text-[9px] bg-indigo-500 text-white px-2 py-0.5 rounded-full font-black uppercase">Live Active</span>}
            </div>
            
            <input 
              value={scene.name} 
              onChange={(e) => updateScene(scene.id, { name: e.target.value })} 
              className="bg-slate-900 p-4 rounded-2xl text-xl font-bold border border-slate-800 focus:border-indigo-500 outline-none text-white w-full shadow-inner"
            />

            <div className="flex-1 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                <span className="text-[9px] font-black text-slate-400 uppercase">Active Mappings ({scene.mappingIds.length})</span>
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2 pr-2 custom-scrollbar">
                {localMappings.map(m => {
                  const trigger = m.keyboardValue || (m.isMidiRange ? `${m.midiRangeStart}..${m.midiRangeEnd}` : m.midiValue);
                  const targetName = m.actionType === 'preset' ? song.presets.find(p => p.id === m.actionTargetId)?.name : song.sequences.find(s => s.id === m.actionTargetId)?.name;
                  
                  return (
                    <label key={m.id} className="flex items-center justify-between p-3 bg-slate-900/50 rounded-xl border border-slate-800 cursor-pointer hover:bg-slate-800/50 transition-all group">
                       <div className="flex flex-col">
                          <span className="text-[10px] font-bold text-slate-200 group-hover:text-indigo-400 transition-colors">{targetName || 'No Target'}</span>
                          <span className="text-[8px] font-black text-slate-500 uppercase">{m.keyboardValue ? '⌨️' : '🎹'} {trigger}</span>
                       </div>
                       <input 
                        type="checkbox" 
                        checked={scene.mappingIds.includes(m.id)} 
                        onChange={() => toggleMappingForScene(scene.id, m.id)}
                        className="w-5 h-5 accent-indigo-600 rounded cursor-pointer"
                       />
                    </label>
                  );
                })}
                {localMappings.length === 0 && (
                  <div className="py-8 text-center border-2 border-dashed border-slate-800/50 rounded-2xl">
                    <p className="text-[10px] font-black uppercase text-slate-600">No local mappings defined</p>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-3 mt-auto pt-4 border-t border-slate-800">
                <button 
                    onClick={() => onUpdateSong({ ...song, activeSceneId: scene.id })}
                    disabled={song.activeSceneId === scene.id}
                    className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase transition-all ${song.activeSceneId === scene.id ? 'bg-slate-800 text-slate-600 cursor-default' : 'bg-indigo-600 text-white hover:bg-indigo-500 shadow-lg'}`}
                >
                    Switch to this Scene
                </button>
                <button 
                    onClick={() => removeScene(scene.id)} 
                    disabled={song.scenes.length <= 1}
                    className="p-3 text-slate-600 hover:text-rose-500 transition-colors disabled:opacity-20"
                >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
