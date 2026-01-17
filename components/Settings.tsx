
import React from 'react';
import { ProjectData, GlobalMapping, TriggerType, GlobalActionType } from '../types';
import { midiService } from '../webMidiService';
import { v4 as uuidv4 } from 'uuid';

interface SettingsProps {
  project: ProjectData;
  onUpdateProject: (updater: (prev: ProjectData) => ProjectData) => void;
}

const Settings: React.FC<SettingsProps> = ({ project, onUpdateProject }) => {
  const inputs = midiService.getInputs();
  const outputs = midiService.getOutputs();

  const addGlobalMapping = () => {
    const newMapping: GlobalMapping = {
      id: uuidv4(),
      triggerType: 'keyboard',
      triggerValue: '',
      triggerChannel: 0,
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

  return (
    <div className="max-w-4xl space-y-12 animate-in fade-in slide-in-from-bottom-2 duration-300 pb-20">
      <h2 className="text-3xl font-black text-white">Project Settings</h2>

      {/* Project Identity & MIDI IO */}
      <div className="space-y-6">
        <div className="space-y-2">
          <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Performance Name</label>
          <input 
            type="text" 
            value={project.name}
            onChange={(e) => onUpdateProject(prev => ({ ...prev, name: e.target.value }))}
            className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Master MIDI Input</label>
            <select 
              value={project.selectedInputId}
              onChange={(e) => onUpdateProject(prev => ({ ...prev, selectedInputId: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all appearance-none"
            >
              <option value="">{inputs.length === 0 ? 'Searching for inputs...' : 'No Input Selected'}</option>
              {inputs.map(input => (
                <option key={input.id} value={input.id}>{input.name}</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-widest">Master MIDI Output</label>
            <select 
              value={project.selectedOutputId}
              onChange={(e) => onUpdateProject(prev => ({ ...prev, selectedOutputId: e.target.value }))}
              className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-600 transition-all appearance-none"
            >
              <option value="">{outputs.length === 0 ? 'Searching for outputs...' : 'No Output Selected'}</option>
              {outputs.map(output => (
                <option key={output.id} value={output.id}>{output.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Global Mappings Section */}
      <div className="space-y-6">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-xl font-black text-white">Global Control Mappings</h3>
            <p className="text-xs text-slate-500 font-bold uppercase tracking-widest mt-1">Control your setlist and engine state</p>
          </div>
          <button 
            onClick={addGlobalMapping}
            className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-lg"
          >
            + New Global Trigger
          </button>
        </div>

        <div className="grid grid-cols-1 gap-4">
          {(project.globalMappings || []).map(mapping => (
            <div key={mapping.id} className={`grid grid-cols-[60px_100px_180px_1fr_50px] gap-4 bg-slate-900/40 border border-slate-800 p-5 rounded-2xl items-center transition-all ${!mapping.isEnabled && 'opacity-40 grayscale'}`}>
              <div className="flex flex-col items-center gap-1">
                <label className="text-[8px] text-slate-600 font-black uppercase">On</label>
                <input 
                  type="checkbox" 
                  checked={mapping.isEnabled} 
                  onChange={(e) => updateGlobalMapping(mapping.id, { isEnabled: e.target.checked })} 
                  className="w-5 h-5 accent-indigo-500 cursor-pointer" 
                />
              </div>
              
              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-slate-600 font-black uppercase">Type</label>
                <select 
                  value={mapping.triggerType} 
                  onChange={(e) => updateGlobalMapping(mapping.id, { triggerType: e.target.value as TriggerType })}
                  className="bg-slate-800 text-[10px] font-black p-2 rounded-lg border border-slate-700 outline-none"
                >
                  <option value="keyboard">Keyb</option>
                  <option value="midi">MIDI</option>
                </select>
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[8px] text-slate-600 font-black uppercase">Trigger {mapping.triggerType === 'midi' && '(Pitch & Ch)'}</label>
                <div className="flex gap-1">
                  <input 
                    type="text" 
                    value={mapping.triggerValue} 
                    onChange={(e) => updateGlobalMapping(mapping.id, { triggerValue: mapping.triggerType === 'midi' ? (parseInt(e.target.value) || 0) : e.target.value })}
                    placeholder={mapping.triggerType === 'keyboard' ? "Key" : "Midi #"}
                    className="bg-slate-800 text-[10px] font-bold p-2 rounded-lg border border-slate-700 outline-none text-center flex-1 min-w-0"
                  />
                  {mapping.triggerType === 'midi' && (
                    <select 
                      value={mapping.triggerChannel} 
                      onChange={(e) => updateGlobalMapping(mapping.id, { triggerChannel: parseInt(e.target.value) })}
                      className="bg-slate-800 text-[9px] font-black p-2 rounded-lg border border-slate-700 outline-none min-w-[50px]"
                    >
                      <option value={0}>All</option>
                      {Array.from({length: 16}).map((_, i) => <option key={i} value={i+1}>{i+1}</option>)}
                    </select>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-4">
                <div className="flex flex-col gap-1 flex-1">
                  <label className="text-[8px] text-slate-600 font-black uppercase">Action</label>
                  <select 
                    value={mapping.actionType} 
                    onChange={(e) => updateGlobalMapping(mapping.id, { actionType: e.target.value as GlobalActionType })}
                    className="bg-slate-800 text-[10px] font-black p-2 rounded-lg border border-slate-700 outline-none"
                  >
                    <option value="PREV_SONG">Prev Song</option>
                    <option value="NEXT_SONG">Next Song</option>
                    <option value="GOTO_SONG">Go To Song #</option>
                    <option value="RESET_SEQUENCES">Reset All</option>
                  </select>
                </div>
                {mapping.actionType === 'GOTO_SONG' && (
                  <div className="flex flex-col gap-1 w-16">
                    <label className="text-[8px] text-slate-600 font-black uppercase">#</label>
                    <input 
                      type="number" 
                      min="1"
                      value={mapping.actionValue || 1} 
                      onChange={(e) => updateGlobalMapping(mapping.id, { actionValue: parseInt(e.target.value) || 1 })}
                      className="bg-slate-800 text-[10px] font-bold p-2 rounded-lg border border-slate-700 outline-none text-center"
                    />
                  </div>
                )}
              </div>

              <button 
                onClick={() => removeGlobalMapping(mapping.id)}
                className="p-2 text-slate-600 hover:text-rose-500 transition-colors self-center"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
              </button>
            </div>
          ))}
          {(!project.globalMappings || project.globalMappings.length === 0) && (
            <div className="p-10 border-2 border-dashed border-slate-800 rounded-3xl flex flex-col items-center justify-center text-slate-600 opacity-50">
              <p className="text-sm font-bold uppercase tracking-widest">No Global Mappings Configured</p>
            </div>
          )}
        </div>
      </div>

      {/* Usage Tips */}
      <div className="p-8 bg-slate-900/50 border border-slate-800 rounded-3xl space-y-4">
        <h4 className="font-black text-sm text-indigo-400 uppercase tracking-[0.2em]">Usage & Setup Tip</h4>
        <div className="space-y-2 text-sm text-slate-400 leading-relaxed">
          <p>• <strong>MIDI Mapping:</strong> You can now specify which MIDI channel (1-16) to listen to for each mapping. Select "All" for Omni-mode behavior.</p>
          <p>• <strong>Panic Key:</strong> Mapping a global "Reset All (Panic)" key is highly recommended for live performances to immediately stop all notes and reset sequences if something goes wrong.</p>
          <p>• <strong>DAW Sync:</strong> Ensure your DAW is listening to the same MIDI output port. For virtual instruments, using a Virtual MIDI cable (like LoopMIDI or IAC Driver) is ideal.</p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
