import React, { useMemo, useRef } from 'react';
import { Song, InputMapping } from '../types';
import { deviceLayout, LK_PAD_CHANNEL, classifyMappingNotes } from '../utils/launchkey';
import { laneColor, keyLabel, mappingKeys, mappingTargetName, noteName, activeMappingsFor } from '../utils/chart';

// ─────────────────────────────────────────────────────────────────────────────
// Launchkey Mini MK3 모양 그대로 "무엇이 눌려 있고 무엇을 눌러야 하는지" 보여준다.
//  - 매핑된 키/패드는 그 매핑의 레인 색으로 칠하고 키보드 글쇠를 적는다
//  - 눌린 키/패드는 밝게, 다음에 눌러야 할 것(expected)은 테두리가 깜빡인다
//  - 노브 8개는 CC 21~28 현재값
// 마우스로 키/패드를 눌러도 매핑이 트리거된다(onTrigger 가 있을 때). 누른 채 밖으로 나가도 뗀다.
// ─────────────────────────────────────────────────────────────────────────────

interface Props {
  song: Song;
  pressedKeys: Set<string>;
  pressedMidiNotes: Set<string>;          // "channel-pitch"
  ccStates: Record<string, number>;       // "channel-cc"
  expectedMappingIds?: Set<string>;
  onTrigger?: (m: InputMapping, isRelease: boolean) => void;
  className?: string;
  showLegend?: boolean;
}

interface Placement { keys: Map<number, InputMapping[]>; pads: Map<number, InputMapping[]>; unplaced: InputMapping[]; }

/** 현재 씬의 매핑이 기기의 어느 키/패드에 해당하는지 (Game 하이웨이와 같은 분류 규칙) */
export function placeMappings(song: Song): Placement {
  const keys = new Map<number, InputMapping[]>();
  const pads = new Map<number, InputMapping[]>();
  const unplaced: InputMapping[] = [];
  activeMappingsFor(song).forEach(m => {
    const c = classifyMappingNotes(m);
    c.keyMidis.forEach(n => keys.set(n, [...(keys.get(n) || []), m]));
    c.padMidis.forEach(n => pads.set(n, [...(pads.get(n) || []), m]));
    if (!c.keyMidis.length && !c.padMidis.length) unplaced.push(m);
  });
  return { keys, pads, unplaced };
}

export const LaunchkeyView: React.FC<Props> = ({ song, pressedKeys, pressedMidiNotes, ccStates, expectedMappingIds, onTrigger, className, showLegend = true }) => {
  const W = 1000;
  const layout = useMemo(() => deviceLayout(W), []);
  const placement = useMemo(() => placeMappings(song), [song]);
  // 마우스로 누르고 있는 매핑들 — 키보드/MIDI 눌림과 별개로 추적해야 드래그해 나가도 뗄 수 있다
  const mouseHeld = useRef<InputMapping[] | null>(null);

  const pressedPitches = useMemo(() => {
    const keys = new Set<number>(); const pads = new Set<number>();
    pressedMidiNotes.forEach(k => {
      const [ch, p] = k.split('-').map(Number);
      if (ch === LK_PAD_CHANNEL) pads.add(p); else keys.add(p);
    });
    return { keys, pads };
  }, [pressedMidiNotes]);

  const isKeyPressed = (m: InputMapping) => mappingKeys(m).some(k => pressedKeys.has(k.toLowerCase()));
  const isExpected = (ms: InputMapping[] | undefined) => !!expectedMappingIds && !!ms?.some(m => expectedMappingIds.has(m.id));

  const press = (ms: InputMapping[] | undefined) => {
    if (!onTrigger || !ms?.length) return;
    releaseHeld();
    mouseHeld.current = ms;
    ms.forEach(m => onTrigger(m, false));
  };
  const releaseHeld = () => {
    const held = mouseHeld.current;
    if (!onTrigger || !held) return;
    mouseHeld.current = null;
    held.forEach(m => onTrigger(m, true));
  };
  const handlers = (ms: InputMapping[] | undefined) => ({
    onMouseDown: () => press(ms),
    onMouseUp: releaseHeld,
    onMouseLeave: releaseHeld,
    style: { cursor: ms?.length ? 'pointer' : 'default' } as React.CSSProperties,
  });

  return (
    <div className={className} onMouseUp={releaseHeld}>
      <svg viewBox={`0 0 ${W} ${layout.height}`} className="w-full h-auto select-none" style={{ maxHeight: 420 }}>
        <defs>
          <style>{`@keyframes lkPulse { 0%,100% { stroke-opacity: 1; } 50% { stroke-opacity: 0.25; } }`}</style>
        </defs>
        {/* 몸체 */}
        <rect x={0} y={0} width={W} height={layout.height} rx={18} fill="#0b1220" stroke="#1e293b" strokeWidth={2} />
        <text x={16} y={26} fill="#475569" fontSize={11} fontWeight={900} letterSpacing={3}>LAUNCHKEY MINI MK3</text>

        {/* 노브 */}
        {layout.knobs.map(k => {
          const v = ccStates[`1-${k.cc}`] ?? 0;
          const pct = v / 127;
          const a0 = Math.PI * 0.75, a1 = a0 + Math.PI * 1.5 * pct;
          const arc = (a: number) => ({ x: k.cx + Math.cos(a) * k.r, y: k.cy + Math.sin(a) * k.r });
          const p0 = arc(a0), p1 = arc(a1);
          const large = a1 - a0 > Math.PI ? 1 : 0;
          return (
            <g key={k.cc}>
              <circle cx={k.cx} cy={k.cy} r={k.r} fill="#111827" stroke="#334155" strokeWidth={3} />
              {pct > 0 && <path d={`M ${p0.x} ${p0.y} A ${k.r} ${k.r} 0 ${large} 1 ${p1.x} ${p1.y}`} fill="none" stroke="#f59e0b" strokeWidth={3} strokeLinecap="round" />}
              <line x1={k.cx} y1={k.cy} x2={k.cx + Math.cos(a1) * k.r * 0.6} y2={k.cy + Math.sin(a1) * k.r * 0.6} stroke="#e2e8f0" strokeWidth={2.5} strokeLinecap="round" />
              <text x={k.cx} y={k.cy + k.r + 12} textAnchor="middle" fill="#64748b" fontSize={9} fontWeight={800}>CC{k.cc} · {v}</text>
            </g>
          );
        })}

        {/* 패드 */}
        {layout.pads.map(p => {
          const ms = placement.pads.get(p.midi);
          const color = ms?.length ? laneColor(song, ms[0].id) : null;
          const pressed = pressedPitches.pads.has(p.midi) || (ms?.some(isKeyPressed) ?? false) || (!!ms && mouseHeld.current === ms);
          const expected = isExpected(ms);
          return (
            <g key={p.midi} {...handlers(ms)}>
              <rect x={p.x} y={p.y} width={p.w} height={p.h} rx={6}
                fill={pressed ? (color || '#e2e8f0') : color ? `${color}33` : '#111827'}
                stroke={expected ? '#fde68a' : color || '#1f2937'} strokeWidth={expected ? 3 : 1.5}
                style={expected ? { animation: 'lkPulse 0.6s ease-in-out infinite' } : undefined} />
              <text x={p.x + 6} y={p.y + 13} fill={pressed ? '#0f172a' : '#64748b'} fontSize={9} fontWeight={800}>{p.midi}</text>
              {ms && ms.length > 0 && (
                <>
                  <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 2} textAnchor="middle" fill={pressed ? '#0f172a' : '#f8fafc'} fontSize={13} fontWeight={900}>{keyLabel(ms[0]) || '—'}</text>
                  <text x={p.x + p.w / 2} y={p.y + p.h - 6} textAnchor="middle" fill={pressed ? '#0f172a' : color || '#94a3b8'} fontSize={8} fontWeight={700}>
                    {mappingTargetName(song, ms[0]).slice(0, 12)}
                  </text>
                </>
              )}
            </g>
          );
        })}

        {/* 건반 — 흰 먼저, 검은 위에 */}
        {layout.keys.filter(k => !k.black).map(k => {
          const ms = placement.keys.get(k.midi);
          const color = ms?.length ? laneColor(song, ms[0].id) : null;
          const pressed = pressedPitches.keys.has(k.midi) || (ms?.some(isKeyPressed) ?? false);
          const expected = isExpected(ms);
          return (
            <g key={k.midi} {...handlers(ms)}>
              <rect x={k.x + 1} y={k.y} width={k.w - 2} height={k.h} rx={4}
                fill={pressed ? (color || '#a5b4fc') : color ? `${color}55` : '#e5e7eb'}
                stroke={expected ? '#f59e0b' : '#0f172a'} strokeWidth={expected ? 3 : 1}
                style={expected ? { animation: 'lkPulse 0.6s ease-in-out infinite' } : undefined} />
              <text x={k.x + k.w / 2} y={k.y + k.h - 8} textAnchor="middle" fill="#334155" fontSize={9} fontWeight={800}>{noteName(k.midi)}</text>
              {ms && ms.length > 0 && (
                <text x={k.x + k.w / 2} y={k.y + k.h - 24} textAnchor="middle" fill="#0f172a" fontSize={12} fontWeight={900}>{keyLabel(ms[0]).split(' ')[0]}</text>
              )}
            </g>
          );
        })}
        {layout.keys.filter(k => k.black).map(k => {
          const ms = placement.keys.get(k.midi);
          const color = ms?.length ? laneColor(song, ms[0].id) : null;
          const pressed = pressedPitches.keys.has(k.midi) || (ms?.some(isKeyPressed) ?? false);
          const expected = isExpected(ms);
          return (
            <g key={k.midi} {...handlers(ms)}>
              <rect x={k.x} y={k.y} width={k.w} height={k.h} rx={3}
                fill={pressed ? (color || '#c7d2fe') : color ? color : '#111827'}
                stroke={expected ? '#f59e0b' : '#000'} strokeWidth={expected ? 3 : 1}
                style={expected ? { animation: 'lkPulse 0.6s ease-in-out infinite' } : undefined} />
              {ms && ms.length > 0 && (
                <text x={k.x + k.w / 2} y={k.y + k.h - 8} textAnchor="middle" fill="#0f172a" fontSize={10} fontWeight={900}>{keyLabel(ms[0]).split(' ')[0]}</text>
              )}
            </g>
          );
        })}
      </svg>

      {showLegend && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeMappingsFor(song).map(m => {
            const color = laneColor(song, m.id);
            const c = classifyMappingNotes(m);
            const active = isKeyPressed(m) || c.keyMidis.some(n => pressedPitches.keys.has(n)) || c.padMidis.some(n => pressedPitches.pads.has(n));
            const unplaced = placement.unplaced.includes(m);
            return (
              <button key={m.id} onMouseDown={() => press([m])} onMouseUp={releaseHeld} onMouseLeave={releaseHeld}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-[10px] font-bold transition-all ${active ? 'bg-white text-slate-900 border-white' : 'bg-slate-900/70 text-slate-300 border-slate-800 hover:border-slate-600'}`}
                title={unplaced ? '기기 범위(건반 48~72 / 패드 36~51) 밖이라 그림에는 없음 — 여기서 마우스로 칠 수 있음' : '마우스로 트리거'}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
                <span className="font-black">{keyLabel(m) || '—'}</span>
                <span className="opacity-70">{mappingTargetName(song, m)}</span>
                {unplaced && <span className="text-amber-400">⚠</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default LaunchkeyView;
