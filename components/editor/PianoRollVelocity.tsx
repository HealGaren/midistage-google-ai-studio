
import React from 'react';
import { SequenceItem, NoteItem } from '../../types';

interface PianoRollVelocityProps {
  items: SequenceItem[];
  selectedId: string | null;
  zoom: number;
  beatWidth: number;
  snap: number;
  onUpdateItem: (id: string, updates: Partial<NoteItem>) => void;
  onDelete: () => void;
}

export const PianoRollVelocity: React.FC<PianoRollVelocityProps> = ({ items, selectedId, zoom, beatWidth, snap, onUpdateItem, onDelete }) => {
  const panelHeight = 120;
  const selectedNote = items.find(i => i.id === selectedId);

  return (
    <div className="h-40 bg-slate-900 border-t border-slate-800 flex flex-col flex-shrink-0">
      <div className="flex items-center justify-between px-6 py-2 bg-slate-800/50 border-b border-slate-800">
        <div className="flex items-center gap-6">
            <span className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Velocity & Properties</span>
            
            {selectedNote && (
                <div className="flex items-center gap-4 animate-in fade-in slide-in-from-left-2">
                    <div className="h-4 w-px bg-slate-700" />
                    
                    <div className="flex items-center gap-2">
                      <span className="text-[9px] font-black text-slate-500 uppercase">Note CH</span>
                      <select 
                        value={selectedNote.noteData?.channel || 1} 
                        onChange={(e) => onUpdateItem(selectedNote.id, { channel: parseInt(e.target.value) })}
                        className="bg-slate-950 text-[10px] font-black text-indigo-400 border border-slate-700 rounded-lg px-2 py-1 outline-none cursor-pointer"
                      >
                        {Array.from({ length: 16 }).map((_, i) => (
                          <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">CH {i + 1}</option>
                        ))}
                      </select>
                    </div>

                    <div className="h-4 w-px bg-slate-700" />
                    
                    <button 
                      onClick={() => onUpdateItem(selectedNote.id, { duration: selectedNote.noteData?.duration === null ? 0.25 : null })}
                      className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase border transition-all ${selectedNote.noteData?.duration === null ? 'bg-indigo-600/20 border-indigo-500 text-indigo-400' : 'bg-slate-950 border-slate-700 text-slate-500 hover:text-slate-300'}`}
                    >
                      {selectedNote.noteData?.duration === null ? 'Sustain: ON' : 'Fixed Duration'}
                    </button>

                    <div className="h-4 w-px bg-slate-700" />

                    <button onClick={onDelete} className="text-rose-500 hover:text-rose-400 text-[10px] font-black uppercase flex items-center gap-1.5 transition-colors">
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                        Delete
                    </button>
                </div>
            )}
        </div>
        <div className="text-[10px] font-bold text-slate-600 uppercase tracking-tighter italic">Drag bars to adjust velocity • Drag note edge to resize (snapped)</div>
      </div>
      
      <div className="flex-1 overflow-x-hidden relative flex">
        <div className="w-[100px] flex-shrink-0 border-r border-slate-800 bg-slate-950/20" />
        
        <div className="flex-1 overflow-x-auto custom-scrollbar bg-slate-950/40 relative">
          <div className="relative h-full" style={{ width: 100 * beatWidth * zoom }}>
            <div className="absolute inset-0 opacity-10 pointer-events-none" style={{
                backgroundImage: `linear-gradient(0deg, #fff 1px, transparent 1px)`,
                backgroundSize: `100% ${panelHeight / 4}px`
            }} />

            {items.map(item => {
              const isSelected = selectedId === item.id;
              const velocity = item.noteData?.velocity || 0.8;
              const barHeight = velocity * (panelHeight - 20);
              const duration = item.noteData?.duration || snap;
              
              return (
                <div 
                  key={item.id}
                  className="absolute bottom-0 group"
                  style={{ 
                    left: item.beatPosition * beatWidth * zoom,
                    width: Math.max(10, (item.noteData?.duration || 0.1) * beatWidth * zoom)
                  }}
                >
                  <div 
                    className={`mx-auto w-1.5 rounded-t-full transition-all cursor-ns-resize relative ${isSelected ? 'bg-indigo-400 shadow-[0_0_15px_rgba(129,140,248,0.8)]' : 'bg-slate-700 group-hover:bg-indigo-800'}`}
                    style={{ height: barHeight }}
                    onMouseDown={(e) => {
                        const startY = e.clientY;
                        const startVel = velocity;
                        const onMouseMove = (moveE: MouseEvent) => {
                            const diff = (startY - moveE.clientY) / (panelHeight - 20);
                            const newVel = Math.min(1, Math.max(0, startVel + diff));
                            onUpdateItem(item.id, { velocity: newVel });
                        };
                        const onMouseUp = () => {
                            window.removeEventListener('mousemove', onMouseMove);
                            window.removeEventListener('mouseup', onMouseUp);
                        };
                        window.addEventListener('mousemove', onMouseMove);
                        window.addEventListener('mouseup', onMouseUp);
                    }}
                  >
                    <div className={`absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full border-2 border-slate-900 transition-colors ${isSelected ? 'bg-white' : 'bg-indigo-500'}`} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
