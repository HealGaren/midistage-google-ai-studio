
import React, { useMemo, useRef, useState } from 'react';
import { Sequence, Song, SequenceItem, NotePreset } from '../../types';
import { v4 as uuidv4 } from 'uuid';

interface TimelineEditorProps {
  sequence: Sequence;
  song: Song;
  onUpdate: (updates: Partial<Sequence>) => void;
  renderItemEditor: (item: SequenceItem, isEditing: boolean, setEditing: (id: string | null) => void) => React.ReactNode;
}

const BEAT_WIDTH = 120;
const SIDE_PADDING = 32;

const midiToNoteName = (midi: number) => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
};

export const TimelineEditor: React.FC<TimelineEditorProps> = ({ sequence, song, onUpdate, renderItemEditor }) => {
  const timelineRef = useRef<HTMLDivElement>(null);
  const [hoverBeat, setHoverBeat] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<string | null>(null);

  const timelineItemsWithLanes = useMemo(() => {
    const sorted = [...sequence.items].sort((a, b) => a.beatPosition - b.beatPosition);
    const getDur = (item: SequenceItem) => {
      if (item.overrideDuration !== null && item.overrideDurationUnit === 'beat') return item.overrideDuration;
      if (item.overrideDuration !== null && item.overrideDurationUnit === 'ms') return item.overrideDuration / (60000 / (song.bpm || 120));
      return 1.0;
    };
    const lanes: number[] = [];
    return sorted.map(item => {
      const dur = getDur(item);
      let laneIdx = 0;
      while (lanes[laneIdx] > item.beatPosition) laneIdx++;
      lanes[laneIdx] = item.beatPosition + dur + 0.05;
      return { ...item, lane: laneIdx, durationBeats: dur };
    });
  }, [sequence.items, song.bpm]);

  const handleMouseMove = (e: React.MouseEvent) => {
    const rect = timelineRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left + timelineRef.current!.scrollLeft;
    const rawBeat = (x - SIDE_PADDING) / BEAT_WIDTH;
    const snap = sequence.gridSnap || 1.0;
    setHoverBeat(Math.max(0, Math.round(rawBeat / snap) * snap));
  };

  const handleClick = (e: React.MouseEvent) => {
    if (hoverBeat === null) return;
    if (!(e.target as HTMLElement).classList.contains('timeline-grid-surface')) return;
    const newItem: SequenceItem = { id: uuidv4(), type: 'preset', targetId: song.presets[0]?.id || '', beatPosition: hoverBeat, overrideDuration: null, overrideDurationUnit: 'ms' };
    onUpdate({ items: [...sequence.items, newItem] });
    setEditingItemId(newItem.id);
  };

  return (
    <div ref={timelineRef} onMouseMove={handleMouseMove} onMouseLeave={() => setHoverBeat(null)} onClick={handleClick}
      className="relative min-w-[4800px] h-full min-h-[600px] bg-slate-950 rounded-3xl border border-slate-800 timeline-grid-surface cursor-crosshair overflow-hidden"
      style={{ backgroundImage: `linear-gradient(90deg, #1e293b 1px, transparent 1px), linear-gradient(90deg, #334155 1px, transparent 1px)`, backgroundSize: `${BEAT_WIDTH / 4}px 100%, ${BEAT_WIDTH}px 100%`, backgroundPosition: `${SIDE_PADDING}px 0` }}>
      
      <div className="sticky top-0 h-8 flex z-10 pointer-events-none" style={{ marginLeft: SIDE_PADDING }}>
        {Array.from({ length: 40 }).map((_, i) => (
          <div key={i} className="flex-shrink-0 flex items-end justify-start" style={{ width: BEAT_WIDTH }}>
            <span className="text-[9px] font-black text-slate-500 bg-slate-950 px-1.5 py-0.5 rounded-tr">BEAT {i}</span>
          </div>
        ))}
      </div>

      {hoverBeat !== null && (
        <div className="absolute h-full bg-indigo-500/10 pointer-events-none z-0 border-l border-indigo-500/30" style={{ left: SIDE_PADDING + hoverBeat * BEAT_WIDTH, width: BEAT_WIDTH * (sequence.gridSnap || 1.0) }}>
          <div className="absolute top-10 left-2 text-[9px] font-black text-indigo-400 uppercase whitespace-nowrap">Click to Add @ {hoverBeat.toFixed(2)}</div>
        </div>
      )}

      <div className="relative pt-12 min-h-full timeline-items-layer" style={{ paddingLeft: SIDE_PADDING }}>
        {timelineItemsWithLanes.map((item) => {
          const isEditing = editingItemId === item.id;
          const targetP = song.presets.find(p => p.id === item.targetId);
          const label = item.type === 'preset' ? (targetP?.name || "Select Preset") : `Note: ${midiToNoteName(item.noteData?.pitch || 0)}`;
          return (
            <div key={item.id} className="absolute pointer-events-auto transition-all" style={{ left: SIDE_PADDING + item.beatPosition * BEAT_WIDTH, top: 64 + (item.lane * 48), width: Math.max(BEAT_WIDTH * item.durationBeats, 80) }}>
              <div onClick={() => setEditingItemId(isEditing ? null : item.id)} className={`h-10 px-4 rounded-xl flex items-center gap-3 cursor-pointer border shadow-2xl transition-all overflow-hidden ${isEditing ? 'bg-indigo-600 border-indigo-300 z-50 ring-4 ring-indigo-500/40' : 'bg-slate-800 border-slate-700 hover:border-slate-500 hover:bg-slate-750 z-10'}`}>
                <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${item.type === 'preset' ? 'bg-indigo-400' : 'bg-emerald-400'}`} />
                <span className="text-[10px] font-black text-white truncate flex-1 uppercase tracking-tight">{label}</span>
                {item.overrideDuration !== null && <span className="text-[8px] bg-slate-950/80 px-2 py-0.5 rounded-full text-indigo-200 font-black">{item.overrideDuration}{item.overrideDurationUnit}</span>}
              </div>
              {isEditing && renderItemEditor(item, isEditing, setEditingItemId)}
            </div>
          );
        })}
      </div>
    </div>
  );
};
