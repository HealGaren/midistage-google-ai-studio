import React, { useState, useMemo } from 'react';
import { Song, CCMapping, MappingScope } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface CCMappingEditorProps {
  song: Song;
  onUpdateSong: (song: Song) => void;
  selectedInputId: string;
}

// Curve visualization component
const CurvePreview: React.FC<{ curveValue: number; currentInput?: number }> = ({ curveValue, currentInput }) => {
  const points = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 20; i++) {
      const x = i / 20;
      let y: number;
      if (curveValue === 0.5) {
        y = x;
      } else if (curveValue < 0.5) {
        const exp = 1 + (0.5 - curveValue) * 4;
        y = Math.pow(x, exp);
      } else {
        const exp = 1 / (1 + (curveValue - 0.5) * 4);
        y = Math.pow(x, exp);
      }
      pts.push(`${10 + x * 80},${90 - y * 80}`);
    }
    return pts.join(' ');
  }, [curveValue]);

  const currentPoint = useMemo(() => {
    if (currentInput === undefined) return null;
    const x = currentInput / 127;
    let y: number;
    if (curveValue === 0.5) {
      y = x;
    } else if (curveValue < 0.5) {
      const exp = 1 + (0.5 - curveValue) * 4;
      y = Math.pow(x, exp);
    } else {
      const exp = 1 / (1 + (curveValue - 0.5) * 4);
      y = Math.pow(x, exp);
    }
    return { x: 10 + x * 80, y: 90 - y * 80 };
  }, [curveValue, currentInput]);

  return (
    <svg viewBox="0 0 100 100" className="w-full h-full">
      {/* Grid */}
      <line x1="10" y1="90" x2="90" y2="90" stroke="#334155" strokeWidth="1" />
      <line x1="10" y1="90" x2="10" y2="10" stroke="#334155" strokeWidth="1" />
      <line x1="10" y1="10" x2="90" y2="10" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
      <line x1="90" y1="10" x2="90" y2="90" stroke="#334155" strokeWidth="0.5" strokeDasharray="2" />
      {/* Linear reference */}
      <line x1="10" y1="90" x2="90" y2="10" stroke="#475569" strokeWidth="0.5" strokeDasharray="4" />
      {/* Curve */}
      <polyline points={points} fill="none" stroke="#06b6d4" strokeWidth="2" />
      {/* Current point */}
      {currentPoint && (
        <circle cx={currentPoint.x} cy={currentPoint.y} r="4" fill="#f59e0b" />
      )}
    </svg>
  );
};

export const CCMappingEditor: React.FC<CCMappingEditorProps> = ({ song, onUpdateSong, selectedInputId }) => {
  const [selectedMappingId, setSelectedMappingId] = useState<string | null>(null);
  const [editingCurve, setEditingCurve] = useState<string | null>(null);

  const ccMappings = song.ccMappings || [];
  const selectedMapping = ccMappings.find(m => m.id === selectedMappingId);

  const addCCMapping = () => {
    const newMapping: CCMapping = {
      id: uuidv4(),
      name: `CC Mapping ${ccMappings.length + 1}`,
      inputChannel: 0,
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
      scope: 'scene'
    };
    onUpdateSong({ ...song, ccMappings: [...ccMappings, newMapping] });
    setSelectedMappingId(newMapping.id);
  };

  const updateMapping = (id: string, updates: Partial<CCMapping>) => {
    onUpdateSong({
      ...song,
      ccMappings: ccMappings.map(m => m.id === id ? { ...m, ...updates } : m)
    });
  };

  const deleteMapping = (id: string) => {
    onUpdateSong({ ...song, ccMappings: ccMappings.filter(m => m.id !== id) });
    if (selectedMappingId === id) setSelectedMappingId(null);
  };

  return (
    <div className="h-full flex gap-6">
      {/* Sidebar - CC Mapping List */}
      <div className="w-72 bg-slate-900/50 rounded-3xl border border-slate-800 p-4 flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest">CC Mappings</h3>
          <button
            onClick={addCCMapping}
            className="p-2 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
            </svg>
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto space-y-2">
          {ccMappings.length === 0 ? (
            <div className="text-center text-slate-600 text-xs py-8">No CC mappings yet</div>
          ) : (
            ccMappings.map(mapping => (
              <div
                key={mapping.id}
                onClick={() => setSelectedMappingId(mapping.id)}
                className={`p-3 rounded-xl cursor-pointer transition-all ${
                  selectedMappingId === mapping.id
                    ? 'bg-indigo-600/20 border border-indigo-500/50'
                    : 'bg-slate-800/50 hover:bg-slate-800 border border-transparent'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-bold text-white truncate">{mapping.name}</span>
                  <span className={`w-2 h-2 rounded-full ${mapping.isEnabled ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-500">
                    CH{mapping.inputChannel === 0 ? '*' : mapping.inputChannel} CC{mapping.inputCC}
                  </span>
                  <span className="text-[10px] text-slate-600">→</span>
                  <span className="text-[10px] text-slate-500">
                    {mapping.outputRemapEnabled ? `CH${mapping.outputChannel} CC${mapping.outputCC}` : 'Pass-through'}
                  </span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main Editor */}
      <div className="flex-1 bg-slate-900 rounded-3xl border border-slate-800 p-8 overflow-y-auto">
        {selectedMapping ? (
          <div className="space-y-8">
            {/* Header */}
            <div className="flex items-center justify-between">
              <input
                type="text"
                value={selectedMapping.name}
                onChange={(e) => updateMapping(selectedMapping.id, { name: e.target.value })}
                className="bg-transparent text-2xl font-black focus:outline-none border-b-2 border-transparent focus:border-indigo-500"
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMapping.isEnabled}
                    onChange={(e) => updateMapping(selectedMapping.id, { isEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-10 h-6 rounded-full transition-all ${selectedMapping.isEnabled ? 'bg-emerald-600' : 'bg-slate-700'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white m-1 transition-all ${selectedMapping.isEnabled ? 'translate-x-4' : ''}`} />
                  </div>
                  <span className="text-xs font-bold text-slate-400">Enabled</span>
                </label>
                <button
                  onClick={() => deleteMapping(selectedMapping.id)}
                  className="p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Input Settings */}
            <section className="space-y-4">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Input</h4>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Channel (0 = All)</label>
                  <input
                    type="number"
                    min="0"
                    max="16"
                    value={selectedMapping.inputChannel}
                    onChange={(e) => updateMapping(selectedMapping.id, { inputChannel: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">CC Number</label>
                  <input
                    type="number"
                    min="0"
                    max="127"
                    value={selectedMapping.inputCC}
                    onChange={(e) => updateMapping(selectedMapping.id, { inputCC: parseInt(e.target.value) || 0 })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </section>

            {/* Scope */}
            <section className="space-y-4">
              <h4 className="text-xs font-black text-slate-500 uppercase tracking-widest">Scope</h4>
              <div className="flex gap-2">
                {(['scene', 'global'] as MappingScope[]).map(scope => (
                  <button
                    key={scope}
                    onClick={() => updateMapping(selectedMapping.id, { scope })}
                    className={`px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all ${
                      selectedMapping.scope === scope
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                    }`}
                  >
                    {scope}
                  </button>
                ))}
              </div>
            </section>

            {/* Processor 1: Range Mapping */}
            <section className="space-y-4 p-4 rounded-2xl border border-slate-800 bg-slate-800/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest">1. Range Mapping</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMapping.rangeEnabled}
                    onChange={(e) => updateMapping(selectedMapping.id, { rangeEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-8 h-5 rounded-full transition-all ${selectedMapping.rangeEnabled ? 'bg-cyan-600' : 'bg-slate-700'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white m-1 transition-all ${selectedMapping.rangeEnabled ? 'translate-x-3' : ''}`} />
                  </div>
                </label>
              </div>
              {selectedMapping.rangeEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Min Output (0-127)</label>
                    <input
                      type="number"
                      min="0"
                      max="127"
                      value={selectedMapping.rangeMin}
                      onChange={(e) => updateMapping(selectedMapping.id, { rangeMin: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Max Output (0-127)</label>
                    <input
                      type="number"
                      min="0"
                      max="127"
                      value={selectedMapping.rangeMax}
                      onChange={(e) => updateMapping(selectedMapping.id, { rangeMax: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}
            </section>

            {/* Processor 2: Curve */}
            <section className="space-y-4 p-4 rounded-2xl border border-slate-800 bg-slate-800/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-violet-400 uppercase tracking-widest">2. Response Curve</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMapping.curveEnabled}
                    onChange={(e) => updateMapping(selectedMapping.id, { curveEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-8 h-5 rounded-full transition-all ${selectedMapping.curveEnabled ? 'bg-violet-600' : 'bg-slate-700'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white m-1 transition-all ${selectedMapping.curveEnabled ? 'translate-x-3' : ''}`} />
                  </div>
                </label>
              </div>
              {selectedMapping.curveEnabled && (
                <div className="flex gap-6">
                  <div className="w-32 h-32 bg-slate-900 rounded-xl p-2">
                    <CurvePreview curveValue={selectedMapping.curveValue} />
                  </div>
                  <div className="flex-1 space-y-3">
                    <div>
                      <label className="text-xs text-slate-400 mb-2 block">
                        Curve: {selectedMapping.curveValue < 0.5 ? 'Exponential' : selectedMapping.curveValue > 0.5 ? 'Logarithmic' : 'Linear'}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="1"
                        step="0.05"
                        value={selectedMapping.curveValue}
                        onChange={(e) => updateMapping(selectedMapping.id, { curveValue: parseFloat(e.target.value) })}
                        className="w-full accent-violet-500"
                      />
                      <div className="flex justify-between text-[9px] text-slate-600 mt-1">
                        <span>Slow Start</span>
                        <span>Linear</span>
                        <span>Fast Start</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            {/* Processor 3: Output Remap */}
            <section className="space-y-4 p-4 rounded-2xl border border-slate-800 bg-slate-800/30">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-black text-amber-400 uppercase tracking-widest">3. Output Remap</h4>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedMapping.outputRemapEnabled}
                    onChange={(e) => updateMapping(selectedMapping.id, { outputRemapEnabled: e.target.checked })}
                    className="sr-only"
                  />
                  <div className={`w-8 h-5 rounded-full transition-all ${selectedMapping.outputRemapEnabled ? 'bg-amber-600' : 'bg-slate-700'}`}>
                    <div className={`w-3 h-3 rounded-full bg-white m-1 transition-all ${selectedMapping.outputRemapEnabled ? 'translate-x-3' : ''}`} />
                  </div>
                </label>
              </div>
              {selectedMapping.outputRemapEnabled && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Output Channel</label>
                    <input
                      type="number"
                      min="1"
                      max="16"
                      value={selectedMapping.outputChannel}
                      onChange={(e) => updateMapping(selectedMapping.id, { outputChannel: parseInt(e.target.value) || 1 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-400 mb-1 block">Output CC Number</label>
                    <input
                      type="number"
                      min="0"
                      max="127"
                      value={selectedMapping.outputCC}
                      onChange={(e) => updateMapping(selectedMapping.id, { outputCC: parseInt(e.target.value) || 0 })}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                </div>
              )}
            </section>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-slate-700 font-black uppercase tracking-[0.3em] opacity-30">
            Select a CC mapping or create a new one
          </div>
        )}
      </div>
    </div>
  );
};
