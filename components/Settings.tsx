
import React, { useRef, useState, useEffect, useCallback } from 'react';
import { ProjectData, GlobalMapping, GlobalActionType, CCMapping } from '../types';
import { midiService } from '../webMidiService';
import { v4 as uuidv4 } from 'uuid';

interface SettingsProps {
  project: ProjectData;
  onUpdateProject: (updater: (prev: ProjectData) => ProjectData) => void;
}

interface LearningState {
  id: string;
  type: 'keyboard' | 'midi';
}

const Settings: React.FC<SettingsProps> = ({ project, onUpdateProject }) => {
  const [isRescanning, setIsRescanning] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [learning, setLearning] = useState<LearningState | null>(null);
  
  const inputs = midiService.getInputs();
  const outputs = midiService.getOutputs();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleRescan = async () => {
    setIsRescanning(true);
    try {
      await midiService.rescan();
      setRefreshKey(prev => prev + 1);
    } catch (err) {
      console.error("Rescan failed", err);
    } finally {
      setTimeout(() => setIsRescanning(false), 600);
    }
  };

  const handleLearn = useCallback((value: string | number) => {
    if (!learning) return;
    const mapping = project.globalMappings.find(m => m.id === learning.id);
    if (!mapping) return;

    const field = learning.type === 'keyboard' ? 'keyboardValue' : 'midiValue';
    const currentValues = String(mapping[field] || '').split(',').map(v => v.trim()).filter(v => v !== "");
    const newValue = String(value);
    
    if (!currentValues.includes(newValue)) {
      const updatedValue = currentValues.length > 0 ? [...currentValues, newValue].join(', ') : newValue;
      onUpdateProject(prev => ({
        ...prev,
        globalMappings: prev.globalMappings.map(m => m.id === learning.id ? { ...m, [field]: updatedValue } : m)
      }));
    }
  }, [learning, project.globalMappings, onUpdateProject]);

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
    const input = midiService.getInputById(project.selectedInputId);
    if (!input) return;
    const onNoteOn = (e: any) => {
      handleLearn(e.note.number);
    };
    input.addListener('noteon', onNoteOn);
    return () => input.removeListener('noteon', onNoteOn);
  }, [learning, project.selectedInputId, handleLearn]);

  const addGlobalMapping = () => {
    const newMapping: GlobalMapping = {
      id: uuidv4(),
      keyboardValue: '',
      midiValue: '',
      midiChannel: 0,
      actionType: 'NEXT_SONG',
      isEnabled: true
    };
    onUpdateProject(prev => ({ ...prev, globalMappings: [...(prev.globalMappings || []), newMapping] }));
  };

  const removeGlobalMapping = (id: string) => {
    onUpdateProject(prev => ({ ...prev, globalMappings: prev.globalMappings.filter(m => m.id !== id) }));
  };

  const updateGlobalMapping = (id: string, updates: Partial<GlobalMapping>) => {
    onUpdateProject(prev => ({
      ...prev,
      globalMappings: prev.globalMappings.map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const addGlobalCCMapping = () => {
    const newMapping: CCMapping = {
      id: uuidv4(),
      name: `CC Mapping ${(project.globalCCMappings || []).length + 1}`,
      inputChannel: 1,
      inputCC: 1,
      outputChannel: 1,
      outputCC: 1,
      rangeEnabled: false,
      rangeMin: 0,
      rangeMax: 127,
      curveEnabled: false,
      curveValue: 0.5,
      outputRemapEnabled: false,
      isEnabled: true,
      scope: 'global'
    };
    onUpdateProject(prev => ({ ...prev, globalCCMappings: [...(prev.globalCCMappings || []), newMapping] }));
  };

  const addStandardGlobalCCs = () => {
    const standardCCs = [
      { cc: 1, name: 'Modulation' },
      { cc: 21, name: 'Knob 1' },
      { cc: 22, name: 'Knob 2' },
      { cc: 23, name: 'Knob 3' },
      { cc: 24, name: 'Knob 4' },
      { cc: 25, name: 'Knob 5' },
      { cc: 26, name: 'Knob 6' },
      { cc: 27, name: 'Knob 7' },
      { cc: 28, name: 'Knob 8' },
    ];
    const newMappings: CCMapping[] = standardCCs.map(({ cc, name }) => ({
      id: uuidv4(),
      name,
      inputChannel: 1,
      inputCC: cc,
      outputChannel: 1,
      outputCC: cc,
      rangeEnabled: false,
      rangeMin: 0,
      rangeMax: 127,
      curveEnabled: false,
      curveValue: 0.5,
      outputRemapEnabled: false,
      isEnabled: true,
      scope: 'global'
    }));
    onUpdateProject(prev => ({ ...prev, globalCCMappings: [...(prev.globalCCMappings || []), ...newMappings] }));
  };

  const removeGlobalCCMapping = (id: string) => {
    onUpdateProject(prev => ({ ...prev, globalCCMappings: (prev.globalCCMappings || []).filter(m => m.id !== id) }));
  };

  const updateGlobalCCMapping = (id: string, updates: Partial<CCMapping>) => {
    onUpdateProject(prev => ({
      ...prev,
      globalCCMappings: (prev.globalCCMappings || []).map(m => m.id === id ? { ...m, ...updates } : m)
    }));
  };

  const saveProjectToFile = () => {
    const dataStr = JSON.stringify(project, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(dataStr);
    const exportFileDefaultName = `${project.name.replace(/\s+/g, '_')}_${new Date().toISOString().slice(0, 10)}.json`;
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
  };

  const loadProjectFromFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    const files = event.target.files;
    if (!files || files.length === 0) return;
    fileReader.onload = (e) => {
      try {
        const content = e.target?.result;
        if (typeof content === 'string') {
          const importedProject = JSON.parse(content) as ProjectData;
          if (importedProject.songs && Array.isArray(importedProject.songs)) {
            onUpdateProject(() => importedProject);
            alert("Project loaded successfully!");
          } else {
            alert("Invalid project file format.");
          }
        }
      } catch (err) {
        console.error("Failed to load project:", err);
        alert("Error parsing project file.");
      }
    };
    fileReader.readAsText(files[0]);
  };

  return (
    <div className="max-w-6xl space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <div className="flex items-center justify-between">
        <h2 className="text-3xl font-black text-white">Project Settings</h2>
        <div className="flex gap-3">
          <input type="file" ref={fileInputRef} onChange={loadProjectFromFile} accept=".json" className="hidden" />
          <button onClick={() => fileInputRef.current?.click()} className="px-6 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-black uppercase tracking-widest transition-all border border-slate-700">Import JSON</button>
          <button onClick={saveProjectToFile} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg">Export JSON</button>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between">
            <div className="space-y-2 flex-1 mr-6">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Performance Name</label>
                <input type="text" value={project.name} onChange={(e) => onUpdateProject(prev => ({ ...prev, name: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all" />
            </div>
            <div className="pt-6">
                <button onClick={handleRescan} disabled={isRescanning} className={`flex items-center gap-2 px-6 py-3.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest border border-slate-700 transition-all ${isRescanning ? 'opacity-50 cursor-not-allowed' : ''}`}>
                    <svg className={`w-3.5 h-3.5 ${isRescanning ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                    {isRescanning ? 'Scanning...' : 'Rescan MIDI Devices'}
                </button>
            </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Master MIDI Input</label>
            <select value={project.selectedInputId} onChange={(e) => onUpdateProject(prev => ({ ...prev, selectedInputId: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all appearance-none">
              <option value="">{inputs.length === 0 ? 'Searching for inputs...' : 'No Input Selected'}</option>
              {inputs.map(input => <option key={input.id} value={input.id}>{input.name}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Master MIDI Output</label>
            <select value={project.selectedOutputId} onChange={(e) => onUpdateProject(prev => ({ ...prev, selectedOutputId: e.target.value }))} className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all appearance-none">
              <option value="">{outputs.length === 0 ? 'Searching for outputs...' : 'No Output Selected'}</option>
              {outputs.map(output => <option key={output.id} value={output.id}>{output.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-black text-white">Global Control Mappings</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Control your setlist and engine state</p>
          </div>
          <button onClick={addGlobalMapping} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg">+ New Global Trigger</button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {(project.globalMappings || []).map(mapping => {
            const isLearningK = learning?.id === mapping.id && learning?.type === 'keyboard';
            const isLearningM = learning?.id === mapping.id && learning?.type === 'midi';

            return (
              <div key={mapping.id} className={`grid grid-cols-[50px_1fr_1fr_1.5fr_50px] gap-6 bg-slate-900/40 border border-slate-800 p-6 rounded-[32px] items-center transition-all ${!mapping.isEnabled && 'opacity-40 grayscale'}`}>
                <div className="flex flex-col items-center gap-2">
                  <label className="text-[8px] text-slate-600 font-black uppercase">On</label>
                  <input type="checkbox" checked={mapping.isEnabled} onChange={(e) => updateGlobalMapping(mapping.id, { isEnabled: e.target.checked })} className="w-6 h-6 accent-indigo-500 cursor-pointer" />
                </div>
                
                {/* Keyboard Learn */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-indigo-400 font-black uppercase px-1">⌨️ Keyboard Keys</span>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={mapping.keyboardValue} 
                      onChange={(e) => updateGlobalMapping(mapping.id, { keyboardValue: e.target.value })} 
                      className={`w-full bg-slate-800 p-3 rounded-xl text-[10px] font-bold border outline-none transition-all pr-14 ${isLearningK ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-400' : 'border-slate-700 focus:border-indigo-500 text-slate-200'}`} 
                      placeholder="e.g. j, k" 
                    />
                    <button 
                      onClick={() => setLearning(isLearningK ? null : { id: mapping.id, type: 'keyboard' })}
                      className={`absolute right-1.5 top-1.5 bottom-1.5 px-2 rounded-lg text-[8px] font-black uppercase transition-all ${isLearningK ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      {isLearningK ? 'Rec' : 'Learn'}
                    </button>
                  </div>
                </div>

                {/* MIDI Learn */}
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] text-indigo-400 font-black uppercase px-1">🎹 MIDI Notes</span>
                  <div className="relative">
                    <input 
                      type="text" 
                      value={mapping.midiValue} 
                      onChange={(e) => updateGlobalMapping(mapping.id, { midiValue: e.target.value })} 
                      className={`w-full bg-slate-800 p-3 rounded-xl text-[10px] font-bold border outline-none transition-all pr-14 ${isLearningM ? 'border-rose-500 ring-2 ring-rose-500/20 text-rose-400' : 'border-slate-700 focus:border-indigo-500 text-slate-200'}`} 
                      placeholder="60, 62" 
                    />
                    <button 
                      onClick={() => setLearning(isLearningM ? null : { id: mapping.id, type: 'midi' })}
                      className={`absolute right-1.5 top-1.5 bottom-1.5 px-2 rounded-lg text-[8px] font-black uppercase transition-all ${isLearningM ? 'bg-rose-500 text-white animate-pulse' : 'bg-slate-700 text-slate-400 hover:text-white'}`}
                    >
                      {isLearningM ? 'Rec' : 'Learn'}
                    </button>
                  </div>
                  <div className="flex items-center gap-2 px-1">
                    <span className="text-[8px] font-black text-slate-600 uppercase tracking-tighter">Listen Ch</span>
                    <select value={mapping.midiChannel} onChange={(e) => updateGlobalMapping(mapping.id, { midiChannel: parseInt(e.target.value) })} className="bg-transparent text-[9px] font-bold outline-none text-slate-500">
                      <option value={0}>Omni (All)</option>
                      {Array.from({length: 16}).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                    </select>
                  </div>
                </div>

                {/* Global Action Selector */}
                <div className="flex items-center gap-4">
                  <div className="flex flex-col gap-2 flex-1">
                    <label className="text-[9px] text-slate-500 font-black uppercase px-1">Engine Action</label>
                    <select 
                      value={mapping.actionType} 
                      onChange={(e) => updateGlobalMapping(mapping.id, { actionType: e.target.value as GlobalActionType })}
                      className="bg-slate-800 text-[10px] font-black p-3.5 rounded-xl border border-slate-700 outline-none text-slate-200"
                    >
                      <option value="PREV_SONG">Previous Song</option>
                      <option value="NEXT_SONG">Next Song</option>
                      <option value="GOTO_SONG">Go To Song #</option>
                      <option value="RESET_SEQUENCES">Reset All Sequences (Panic)</option>
                    </select>
                  </div>
                  {mapping.actionType === 'GOTO_SONG' && (
                    <div className="flex flex-col gap-2 w-16">
                      <label className="text-[9px] text-slate-500 font-black uppercase text-center">#</label>
                      <input type="number" min="1" value={mapping.actionValue || 1} onChange={(e) => updateGlobalMapping(mapping.id, { actionValue: parseInt(e.target.value) || 1 })} className="bg-slate-800 text-[10px] font-bold p-3.5 rounded-xl border border-slate-700 outline-none text-center text-slate-200" />
                    </div>
                  )}
                </div>

                <button onClick={() => removeGlobalMapping(mapping.id)} className="p-3 text-slate-700 hover:text-rose-500 transition-colors self-center mt-4">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
              </div>
            );
          })}
          {(!project.globalMappings || project.globalMappings.length === 0) && (
            <div className="p-10 border-2 border-dashed border-slate-800 rounded-[40px] flex flex-col items-center justify-center text-slate-600 opacity-50">
              <p className="text-sm font-bold uppercase tracking-[0.3em]">No Global Mappings Configured</p>
            </div>
          )}
        </div>
      </div>

      {/* Global CC Mappings Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-black text-white">Global CC Mappings</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">CC pass-through that applies to all songs</p>
          </div>
          <div className="flex gap-2">
            <button onClick={addStandardGlobalCCs} className="px-4 py-2.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all">+ Std 9 CCs</button>
            <button onClick={addGlobalCCMapping} className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg">+ New CC</button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {(project.globalCCMappings || []).map(mapping => (
            <div key={mapping.id} className={`grid grid-cols-[50px_1fr_1fr_1fr_50px] gap-4 bg-slate-900/40 border border-slate-800 p-4 rounded-2xl items-center transition-all ${!mapping.isEnabled && 'opacity-40 grayscale'}`}>
              <div className="flex flex-col items-center gap-1">
                <label className="text-[8px] text-slate-600 font-black uppercase">On</label>
                <input type="checkbox" checked={mapping.isEnabled} onChange={(e) => updateGlobalCCMapping(mapping.id, { isEnabled: e.target.checked })} className="w-5 h-5 accent-indigo-500 cursor-pointer" />
              </div>
              
              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-600 font-black uppercase">Name</span>
                <input 
                  type="text" 
                  value={mapping.name} 
                  onChange={(e) => updateGlobalCCMapping(mapping.id, { name: e.target.value })} 
                  className="bg-slate-800 p-2 rounded-lg text-[10px] font-bold border border-slate-700 outline-none text-slate-200" 
                />
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-600 font-black uppercase">Input (CH / CC)</span>
                <div className="flex gap-2">
                  <select value={mapping.inputChannel} onChange={(e) => updateGlobalCCMapping(mapping.id, { inputChannel: parseInt(e.target.value) })} className="bg-slate-800 p-2 rounded-lg text-[10px] font-bold border border-slate-700 outline-none text-slate-200 flex-1">
                    <option value={0}>Omni</option>
                    {Array.from({length: 16}).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <input type="number" min="0" max="127" value={mapping.inputCC} onChange={(e) => updateGlobalCCMapping(mapping.id, { inputCC: parseInt(e.target.value) || 0 })} className="bg-slate-800 p-2 rounded-lg text-[10px] font-bold border border-slate-700 outline-none text-slate-200 w-16" />
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <span className="text-[8px] text-slate-600 font-black uppercase">Output (CH / CC)</span>
                <div className="flex gap-2">
                  <select value={mapping.outputChannel} onChange={(e) => updateGlobalCCMapping(mapping.id, { outputChannel: parseInt(e.target.value) })} className="bg-slate-800 p-2 rounded-lg text-[10px] font-bold border border-slate-700 outline-none text-slate-200 flex-1">
                    {Array.from({length: 16}).map((_, i) => <option key={i} value={i + 1}>{i + 1}</option>)}
                  </select>
                  <input type="number" min="0" max="127" value={mapping.outputCC} onChange={(e) => updateGlobalCCMapping(mapping.id, { outputCC: parseInt(e.target.value) || 0 })} className="bg-slate-800 p-2 rounded-lg text-[10px] font-bold border border-slate-700 outline-none text-slate-200 w-16" />
                </div>
              </div>

              <button onClick={() => removeGlobalCCMapping(mapping.id)} className="p-2 text-slate-700 hover:text-rose-500 transition-colors self-center">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {(!project.globalCCMappings || project.globalCCMappings.length === 0) && (
            <div className="p-8 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-600 opacity-50">
              <p className="text-sm font-bold uppercase tracking-[0.3em]">No Global CC Mappings</p>
            </div>
          )}
        </div>
      </div>

      <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-[40px] space-y-4 shadow-inner">
        <h4 className="font-black text-xs text-indigo-400 uppercase tracking-[0.3em]">Advanced Control Tips</h4>
        <div className="space-y-3 text-xs text-slate-500 font-medium leading-relaxed">
          <p>• <strong className="text-slate-300">Hybrid Control:</strong> You can map a foot switch (MIDI) and a laptop key simultaneously to "Next Song" for redundancy.</p>
          <p>• <strong className="text-slate-300">Panic/Reset:</strong> Always map "Reset All Sequences" to a prominent key. It stops all active notes and returns every sequence step-pointer to the first item.</p>
          <p>• <strong className="text-slate-300">MIDI Omni:</strong> Setting Listen Ch to "Omni" will trigger the global action regardless of which MIDI channel your controller is transmitting on.</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
