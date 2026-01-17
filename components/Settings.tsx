
import React from 'react';
import { ProjectData } from '../types';
import { midiService } from '../webMidiService';

interface SettingsProps {
  project: ProjectData;
  onUpdateProject: (updater: (prev: ProjectData) => ProjectData) => void;
}

const Settings: React.FC<SettingsProps> = ({ project, onUpdateProject }) => {
  const inputs = midiService.getInputs();
  const outputs = midiService.getOutputs();

  return (
    <div className="max-w-2xl space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
      <h2 className="text-3xl font-black text-white">Project Settings</h2>

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

        <div className="p-6 bg-slate-900/50 border border-slate-800 rounded-2xl">
          <h4 className="font-bold text-sm text-indigo-400 mb-2">Usage Tip</h4>
          <p className="text-sm text-slate-400 leading-relaxed">
            Ensure your DAW (Logic, Ableton, etc.) is configured to listen to the same Virtual MIDI port or physical output device selected above. 
            Inputs can be used to trigger presets from a physical master keyboard.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Settings;
