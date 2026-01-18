
import React, { useState, useMemo, useRef, useEffect } from 'react';
import { Sequence, Song, SequenceItem, NoteItem } from '../../types';
import { v4 as uuidv4 } from 'uuid';
import { midiToNoteName } from './PianoView';
import { PianoRollVelocity } from './PianoRollVelocity';

interface PianoRollEditorProps {
  sequence: Sequence;
  song: Song;
  onUpdate: (u: Partial<Sequence>) => void;
  onClose: () => void;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
}

const BEAT_WIDTH = 160;
const KEY_HEIGHT = 28;

export const PianoRollEditor: React.FC<PianoRollEditorProps> = ({ sequence, song, onUpdate, onClose, sendNoteOn, sendNoteOff }) => {
  const [zoom, setZoom] = useState(1);
  const [showPresets, setShowPresets] = useState(true);
  const [snap, setSnap] = useState(0.25);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeChannel, setActiveChannel] = useState(1);
  const [hoverInfo, setHoverInfo] = useState<{ beat: number, pitch: number } | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const keysContainerRef = useRef<HTMLDivElement>(null);

  const midiKeys = useMemo(() => {
    const keys = [];
    for (let i = 127; i >= 0; i--) keys.push(i);
    return keys;
  }, []);

  const items = sequence.items;

  const handleGridMouseMove = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    const rawBeat = x / (BEAT_WIDTH * zoom);
    const snappedBeat = Math.floor(rawBeat / snap) * snap;
    
    const pitchIdx = Math.floor(y / KEY_HEIGHT);
    const pitch = midiKeys[pitchIdx];
    
    setHoverInfo({ beat: snappedBeat, pitch });
  };

  const handleGridClick = (e: React.MouseEvent, pitch: number) => {
    if ((e.target as HTMLElement).closest('.piano-note')) return;
    if (!hoverInfo) return;

    const newItem: SequenceItem = {
      id: uuidv4(),
      type: 'note',
      beatPosition: hoverInfo.beat,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: activeChannel,
        preDelay: 0,
        duration: snap, // 기본적으로 스냅 단위만큼의 길이를 가짐
        durationUnit: 'beat'
      }
    };

    onUpdate({ items: [...items, newItem] });
    setSelectedId(newItem.id);
    sendNoteOn(pitch, 0.8, activeChannel, null);
    setTimeout(() => sendNoteOff(pitch, activeChannel), 200);
  };

  const updateItem = (id: string, updates: Partial<SequenceItem>) => {
    onUpdate({
      items: items.map(item => item.id === id ? { ...item, ...updates } : item)
    });
  };

  const deleteItem = (id: string) => {
    onUpdate({ items: items.filter(i => i.id !== id) });
    if (selectedId === id) setSelectedId(null);
  };

  const toggleDuration = (id: string) => {
    const item = items.find(i => i.id === id);
    if (!item || !item.noteData) return;
    
    const newDuration = item.noteData.duration === null ? snap : null;
    updateItem(id, { noteData: { ...item.noteData, duration: newDuration } });
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (keysContainerRef.current) {
      keysContainerRef.current.style.transform = `translateY(-${e.currentTarget.scrollTop}px)`;
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950 flex flex-col animate-in fade-in duration-300">
      {/* Header Toolbar */}
      <header className="h-16 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-6 flex-shrink-0">
        <div className="flex items-center gap-6">
            <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm shadow-[0_0_15px_rgba(79,70,229,0.4)]">PR</div>
                <h2 className="font-black text-sm uppercase tracking-widest text-white">{sequence.name}</h2>
            </div>
            
            <div className="h-6 w-px bg-slate-800" />
            
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 bg-slate-950 px-3 py-1.5 rounded-xl border border-slate-800">
                  <span className="text-[9px] font-black text-slate-500 uppercase">CH</span>
                  <select 
                    value={activeChannel} 
                    onChange={(e) => setActiveChannel(parseInt(e.target.value))}
                    className="bg-transparent text-[10px] font-black text-indigo-400 outline-none cursor-pointer"
                  >
                    {Array.from({ length: 16 }).map((_, i) => (
                      <option key={i + 1} value={i + 1} className="bg-slate-900 text-white">CH {i + 1}</option>
                    ))}
                  </select>
                </div>

                <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800">
                    {[1, 0.5, 0.25, 0.125, 0.0625, 0.03125].map(s => (
                      <button 
                        key={s}
                        onClick={() => setSnap(s)} 
                        className={`px-2.5 py-1.5 text-[9px] font-black rounded-lg transition-all ${snap === s ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-400'}`}
                      >
                        1/{Math.round(1/s)}
                      </button>
                    ))}
                </div>
                
                <button 
                  onClick={() => setShowPresets(!showPresets)}
                  className={`px-4 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${showPresets ? 'bg-indigo-600/10 border-indigo-500 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-500'}`}
                >
                  Presets: {showPresets ? 'ON' : 'OFF'}
                </button>
            </div>
        </div>

        <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 bg-slate-950 px-4 py-2 rounded-xl border border-slate-800">
                <span className="text-[10px] font-black text-slate-600 uppercase">Zoom</span>
                <input type="range" min="0.5" max="3" step="0.1" value={zoom} onChange={(e) => setZoom(parseFloat(e.target.value))} className="w-24 h-1 bg-slate-800 rounded-full appearance-none accent-indigo-500" />
            </div>
            <button onClick={onClose} className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all">Close Editor</button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Piano Sidebar */}
        <div className="w-[100px] flex-shrink-0 bg-slate-900 border-r border-slate-800 overflow-hidden flex flex-col z-20">
          <div className={`transition-all duration-300 flex-shrink-0 ${showPresets ? 'h-16' : 'h-0'} bg-slate-800 border-b border-slate-700 flex items-center justify-center`}>
             <span className="text-[9px] font-black text-slate-500 uppercase tracking-tighter">Presets</span>
          </div>
          <div className="flex-1 overflow-hidden relative">
            <div ref={keysContainerRef} className="absolute top-0 left-0 w-full will-change-transform">
                {midiKeys.map(pitch => {
                    const isBlack = [1, 3, 6, 8, 10].includes(pitch % 12);
                    const isHovered = hoverInfo?.pitch === pitch;
                    return (
                        <div 
                        key={pitch} 
                        onMouseDown={() => { sendNoteOn(pitch, 0.8, activeChannel, null); setTimeout(() => sendNoteOff(pitch, activeChannel), 300); }}
                        className={`h-[28px] border-b border-slate-950 flex items-center justify-end pr-3 transition-colors cursor-pointer select-none active:bg-indigo-600 ${isHovered ? 'brightness-125 ring-1 ring-inset ring-indigo-500/30' : ''} ${isBlack ? 'bg-slate-950 text-slate-600' : 'bg-white text-slate-900'}`}
                        >
                            <span className="text-[9px] font-bold pointer-events-none">{pitch % 12 === 0 ? `C${Math.floor(pitch/12)-1}` : (isHovered ? midiToNoteName(pitch) : '')}</span>
                        </div>
                    );
                })}
            </div>
          </div>
        </div>

        {/* Main Grid Area */}
        <div 
          ref={scrollRef}
          onScroll={handleScroll}
          className="flex-1 overflow-auto bg-slate-950 custom-scrollbar relative"
        >
          {/* Preset Lane */}
          <div className={`sticky top-0 z-10 transition-all duration-300 ${showPresets ? 'h-16' : 'h-0'} overflow-hidden bg-slate-900/80 backdrop-blur-md border-b border-slate-800`}>
             <div className="relative h-full" style={{ width: 100 * BEAT_WIDTH * zoom }}>
                {items.filter(i => i.type === 'preset').map(item => (
                    <div 
                      key={item.id}
                      onClick={() => setSelectedId(item.id)}
                      className={`absolute top-2 h-10 px-3 rounded-xl border flex items-center gap-2 cursor-pointer transition-all shadow-xl ${selectedId === item.id ? 'bg-indigo-600 border-indigo-300 ring-2 ring-indigo-400/50' : 'bg-slate-800 border-slate-700 text-slate-400'}`}
                      style={{ left: item.beatPosition * BEAT_WIDTH * zoom, width: 140 }}
                    >
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="text-[10px] font-black uppercase truncate">{song.presets.find(p => p.id === item.targetId)?.name || 'Empty'}</span>
                    </div>
                ))}
             </div>
          </div>

          {/* Grid Background */}
          <div 
            className="relative" 
            onMouseMove={handleGridMouseMove}
            onMouseLeave={() => setHoverInfo(null)}
            style={{ 
                width: 100 * BEAT_WIDTH * zoom, 
                height: midiKeys.length * 28,
                backgroundImage: `
                linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px),
                linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px),
                linear-gradient(0deg, rgba(255,255,255,0.02) 1px, transparent 1px)
                `,
                backgroundSize: `
                ${(BEAT_WIDTH * zoom * snap)}px 100%, 
                ${(BEAT_WIDTH * zoom)}px 100%,
                100% 28px
                `
            }}
          >
             {/* Hover Guide */}
             {hoverInfo && (
                <>
                    <div 
                        className="absolute pointer-events-none bg-indigo-500/10 border-x border-indigo-500/20"
                        style={{ 
                            left: hoverInfo.beat * BEAT_WIDTH * zoom, 
                            width: snap * BEAT_WIDTH * zoom, 
                            top: 0, 
                            bottom: 0 
                        }}
                    />
                    <div 
                        className="absolute pointer-events-none bg-indigo-500/5 border-y border-indigo-500/20"
                        style={{ 
                            top: midiKeys.indexOf(hoverInfo.pitch) * 28, 
                            height: 28, 
                            left: 0, 
                            right: 0 
                        }}
                    />
                </>
             )}

             {midiKeys.map(pitch => (
                 <div 
                   key={pitch} 
                   onClick={(e) => handleGridClick(e, pitch)}
                   className="h-[28px] w-full border-b border-white/[0.02] cursor-crosshair" 
                 />
             ))}

             {/* Note Items */}
             {items.filter(i => i.type === 'note').map(item => {
                 const isSelected = selectedId === item.id;
                 const pitchIdx = midiKeys.indexOf(item.noteData!.pitch);
                 const duration = item.noteData?.duration;
                 const isSustain = duration === null;
                 const width = isSustain ? (BEAT_WIDTH * zoom * 0.5) : (duration! * BEAT_WIDTH * zoom);
                 const channel = item.noteData?.channel || 1;
                 
                 return (
                     <div 
                       key={item.id}
                       className={`piano-note absolute h-[24px] rounded-lg border-2 transition-all cursor-move flex items-center justify-between pl-2 pr-1 group ${isSelected ? 'bg-indigo-500 border-white shadow-[0_0_15px_rgba(99,102,241,0.5)] z-10' : 'bg-indigo-800/80 border-indigo-400/50 z-0'}`}
                       style={{ 
                         left: item.beatPosition * BEAT_WIDTH * zoom, 
                         top: pitchIdx * 28 + 2,
                         width: width,
                         maskImage: isSustain ? 'linear-gradient(to right, black 60%, transparent 100%)' : 'none',
                         WebkitMaskImage: isSustain ? 'linear-gradient(to right, black 60%, transparent 100%)' : 'none'
                       }}
                       onClick={(e) => { 
                         e.stopPropagation(); 
                         setSelectedId(item.id); 
                         sendNoteOn(item.noteData!.pitch, item.noteData!.velocity, channel, null); 
                         setTimeout(() => sendNoteOff(item.noteData!.pitch, channel), 200); 
                       }}
                     >
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1 pointer-events-none">
                           <span className="text-[8px] font-black text-white/60 uppercase truncate">{midiToNoteName(item.noteData!.pitch)}</span>
                        </div>

                        <div className="flex items-center">
                            {/* Duration Toggle Icon */}
                            <button 
                                onClick={(e) => { e.stopPropagation(); toggleDuration(item.id); }}
                                title={isSustain ? "Switch to Fixed Duration" : "Switch to Sustain"}
                                className={`p-1 rounded hover:bg-white/20 transition-colors ${isSustain ? 'text-white/40' : 'text-white'}`}
                            >
                                {isSustain ? (
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M13 3h-2v10h2V3zm4 4h-2v6h2V7zm4 4h-2v2h2v-2zM9 7H7v6h2V7zm-4 4H3v2h2v-2z" /></svg>
                                ) : (
                                    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24"><path d="M21 7L9 19l-5.5-5.5 1.41-1.41L9 16.17 19.59 5.59 21 7z" /></svg>
                                )}
                            </button>

                            {/* Resize handle (Only for Fixed Duration) */}
                            {!isSustain && (
                                <div 
                                    className="w-2 h-4 cursor-ew-resize hover:bg-white/20 rounded-r-lg ml-0.5"
                                    onMouseDown={(e) => {
                                        e.stopPropagation();
                                        const startX = e.clientX;
                                        const startDur = duration!;
                                        const onMouseMove = (moveE: MouseEvent) => {
                                            const diff = (moveE.clientX - startX) / (BEAT_WIDTH * zoom);
                                            // 스냅에 맞춰 리사이징
                                            const newDur = Math.max(snap, Math.round((startDur + diff) / snap) * snap);
                                            updateItem(item.id, { noteData: { ...item.noteData!, duration: newDur } });
                                        };
                                        const onMouseUp = () => {
                                            window.removeEventListener('mousemove', onMouseMove);
                                            window.removeEventListener('mouseup', onMouseUp);
                                        };
                                        window.addEventListener('mousemove', onMouseMove);
                                        window.addEventListener('mouseup', onMouseUp);
                                    }}
                                />
                            )}
                        </div>

                        {/* Drag Move Handle (Supports Horizontal and Vertical) */}
                        <div 
                          className="absolute inset-0 z-[-1]"
                          onMouseDown={(e) => {
                             e.stopPropagation();
                             const startX = e.clientX;
                             const startY = e.clientY;
                             const startBeat = item.beatPosition;
                             const startPitch = item.noteData!.pitch;
                             let lastPitch = startPitch;

                             const onMouseMove = (moveE: MouseEvent) => {
                                // 좌우 이동 (비트)
                                const diffX = (moveE.clientX - startX) / (BEAT_WIDTH * zoom);
                                const newBeat = Math.max(0, Math.round((startBeat + diffX) / snap) * snap);
                                
                                // 상하 이동 (음정)
                                const diffY = moveE.clientY - startY;
                                // midiKeys는 내림차순[127, 126...] 이므로 마우스가 아래로(Y증가) 가면 음정은 감소해야 함
                                const pitchDiff = -Math.round(diffY / KEY_HEIGHT);
                                const newPitch = Math.max(0, Math.min(127, startPitch + pitchDiff));

                                // 음정이 바뀌었을 때 오디션 소리 재생
                                if (newPitch !== lastPitch) {
                                  sendNoteOn(newPitch, item.noteData!.velocity, channel, null);
                                  setTimeout(() => sendNoteOff(newPitch, channel), 150);
                                  lastPitch = newPitch;
                                }

                                updateItem(item.id, { 
                                  beatPosition: newBeat,
                                  noteData: { ...item.noteData!, pitch: newPitch }
                                });
                             };
                             const onMouseUp = () => {
                                window.removeEventListener('mousemove', onMouseMove);
                                window.removeEventListener('mouseup', onMouseUp);
                             };
                             window.addEventListener('mousemove', onMouseMove);
                             window.addEventListener('mouseup', onMouseUp);
                          }}
                        />
                     </div>
                 );
             })}
          </div>
        </div>
      </div>

      {/* Footer / Velocity Panel */}
      <PianoRollVelocity 
        items={items.filter(i => i.type === 'note')}
        selectedId={selectedId}
        zoom={zoom}
        beatWidth={BEAT_WIDTH}
        snap={snap}
        onUpdateItem={(id, updates) => {
            const item = items.find(i => i.id === id);
            if (item && item.noteData) {
                updateItem(id, { noteData: { ...item.noteData, ...updates } });
                if (updates.channel) {
                  sendNoteOn(item.noteData.pitch, item.noteData.velocity, updates.channel, null);
                  setTimeout(() => sendNoteOff(item.noteData!.pitch, updates.channel!), 200);
                }
            }
        }}
        onDelete={() => selectedId && deleteItem(selectedId)}
      />
    </div>
  );
};
