
import React, { useMemo } from 'react';

interface PianoViewProps {
  activePitches: Set<number>;
  sendNoteOn: (pitch: number, velocity: number, channel: number, duration: number | null) => void;
  sendNoteOff: (pitch: number, channel: number) => void;
  channel: number;
}

export const PianoView: React.FC<PianoViewProps> = ({ activePitches, sendNoteOn, sendNoteOff, channel }) => {
  const startPitch = 36; // C2
  const endPitch = 84;   // C6
  const keys = useMemo(() => {
    const arr = [];
    for (let i = startPitch; i <= endPitch; i++) arr.push(i);
    return arr;
  }, []);

  const handleKeyUp = (p: number) => {
    sendNoteOff(p, channel);
  };

  return (
    <div className="w-full bg-slate-950 border border-slate-900 rounded-2xl p-6 shadow-[inset_0_2px_20px_rgba(0,0,0,0.8)] overflow-x-auto custom-scrollbar">
      <div className="flex min-w-max h-32 relative">
        {keys.map(p => {
          const isBlack = [1, 3, 6, 8, 10].includes(p % 12);
          const hasNote = activePitches.has(p);
          return (
            <div 
              key={p} 
              onMouseDown={() => sendNoteOn(p, 0.8, channel, null)}
              onMouseUp={() => handleKeyUp(p)}
              onMouseLeave={() => handleKeyUp(p)}
              className={`
                relative flex-shrink-0 flex items-end justify-center pb-4 cursor-pointer border-r border-slate-950 transition-all active:translate-y-1 select-none
                ${isBlack ? 'w-8 h-20 bg-slate-900 z-10 -mx-4 rounded-b-xl shadow-2xl border-x border-slate-800' : 'w-14 h-32 bg-slate-300 text-slate-900 rounded-b-2xl font-black text-[10px]'}
                ${hasNote ? (isBlack ? 'bg-indigo-800 ring-2 ring-indigo-400 ring-inset shadow-[0_0_20px_rgba(99,102,241,0.6)]' : 'bg-indigo-300 ring-4 ring-indigo-500 ring-inset shadow-[0_0_25px_rgba(99,102,241,0.5)]') : ''}
              `}
            >
              {p % 12 === 0 && <span className="pointer-events-none opacity-50 font-black text-xs">C{Math.floor(p/12)-1}</span>}
              {hasNote && <div className="absolute top-4 w-2.5 h-2.5 bg-indigo-600 rounded-full shadow-[0_0_15px_rgba(79,70,229,1)] animate-pulse" />}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export const midiToNoteName = (midi: number) => {
  const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const octave = Math.floor(midi / 12) - 1;
  const name = NOTE_NAMES[midi % 12];
  return `${name}${octave}`;
};
