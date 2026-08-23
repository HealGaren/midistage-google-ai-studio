import { Song, ChartSettings, InputMapping } from '../../types';
import { ChartEvent, SectionSpan, laneColor, mappingKeys, mappingMidiNotes, mappingTargetName, innerNotesOf, noteName, sectionColor } from '../../utils/chart';
import { highwayGeometry, KeyRect, PadRect, LK_PAD_CHANNEL, LK_KEY_LOW, LK_KEY_HIGH, padOf } from '../../utils/launchkey';
import { EventStatus, HitFx } from '../../hooks/useConductor';

// ─────────────────────────────────────────────────────────────────────────────
// Game 모드 캔버스 그리기. 리듬게임 "하이웨이": 노트가 위에서 떨어져 아래 판정선에 닿는다.
// 레퍼런스: Synthesia(건반 위로 떨어지는 노트), osu!mania/Guitar Hero(레인·판정선·히트 이펙트).
//
// 레이아웃 두 가지:
//   device : 하단에 Launchkey 건반+패드를 그리고, 노트가 실제 눌러야 할 키 위로 떨어진다.
//            여러 키 중 아무거나 눌러도 되는 매핑은 그 키들을 덮는 넓은 노트 하나.
//   lanes  : 매핑마다 세로 레인 하나.
// 세로축은 beat. pxPerBeat 는 "미리 보여줄 마디 수"로 정해진다. 템포가 변해도 모양은 그대로.
// ─────────────────────────────────────────────────────────────────────────────

export interface LaneBox { mappingId: string; x: number; w: number; color: string; keys: string; name: string; kind: 'keys' | 'pads' | 'extra'; keyMidis: number[]; padMidis: number[]; }

export interface HighwayFrame {
  ctx: CanvasRenderingContext2D;
  W: number; H: number;
  song: Song;
  settings: ChartSettings;
  events: ChartEvent[];
  spans: SectionSpan[];
  pos: number;            // 화면 위치(부드럽게 보간된 값)
  now: number;
  holding: boolean;
  running: boolean;
  statusOf: (id: string) => EventStatus;
  fx: HitFx[];
  pressedKeys: Set<string>;
  pressedMidiNotes: Set<string>;
  lanes: LaneBox[];
  geometry: Geometry;
  nextEventBeat: number | null;
}

export interface Geometry {
  gutterL: number; gutterR: number; panelH: number; hitY: number;
  hwX: number; hwW: number;
  keys: KeyRect[]; pads: PadRect[]; keyboardW: number; hasPads: boolean; padArea: { x: number; w: number };
}

export const GUTTER_L = 150;
export const GUTTER_R = 130;

const keyLabel = (m: InputMapping) => mappingKeys(m).map(k => k.length === 1 ? k.toUpperCase() : k).join(' ');

/** 레인 배치 계산. 폭/레이아웃/곡이 바뀔 때만 다시 한다. */
export function computeLayout(song: Song, laneMappings: InputMapping[], W: number, H: number, settings: ChartSettings): { lanes: LaneBox[]; geometry: Geometry } {
  const gutterL = GUTTER_L, gutterR = GUTTER_R;
  const hwX = gutterL, hwW = Math.max(100, W - gutterL - gutterR);
  const panelH = settings.layout === 'device' ? Math.max(90, Math.min(150, H * 0.17)) : 64;
  const hitY = H - panelH;
  const lanes: LaneBox[] = [];

  if (settings.layout === 'device') {
    const byKey = (m: InputMapping) => mappingMidiNotes(m).filter(n => n >= LK_KEY_LOW && n <= LK_KEY_HIGH && m.midiChannel !== LK_PAD_CHANNEL);
    const byPad = (m: InputMapping) => mappingMidiNotes(m).filter(n => !!padOf(n) && (m.midiChannel === LK_PAD_CHANNEL || (m.midiChannel === 0 && (n < LK_KEY_LOW || n > LK_KEY_HIGH))));
    const hasPads = laneMappings.some(m => byPad(m).length > 0);
    const extras = laneMappings.filter(m => byKey(m).length === 0 && byPad(m).length === 0);
    const extraW = extras.length ? Math.min(70, hwW * 0.12) : 0;
    // 하단 패널(건반/패드)은 판정선 바로 아래: y = H - panelH
    const geo = highwayGeometry(hwW - extraW * extras.length - (extras.length ? 8 : 0), H, panelH, hasPads);
    // 좌표를 하이웨이 원점으로 옮긴다
    const shift = (r: { x: number }) => ({ ...r, x: r.x + hwX });
    const keys = geo.keys.map(shift) as KeyRect[];
    const pads = geo.padsBottom.map(shift) as PadRect[];
    const padArea = { x: geo.padArea.x + hwX, w: geo.padArea.w };

    laneMappings.forEach(m => {
      const color = laneColor(song, m.id);
      const kms = byKey(m), pms = byPad(m);
      if (kms.length) {
        const rects = keys.filter(k => kms.includes(k.midi));
        const x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.w));
        lanes.push({ mappingId: m.id, x: x0, w: x1 - x0, color, keys: keyLabel(m), name: mappingTargetName(song, m), kind: 'keys', keyMidis: kms, padMidis: [] });
      } else if (pms.length) {
        const cols = pms.map(n => padOf(n)!.col);
        const cell = padArea.w / 8;
        const c0 = Math.min(...cols), c1 = Math.max(...cols);
        lanes.push({ mappingId: m.id, x: padArea.x + c0 * cell, w: (c1 - c0 + 1) * cell, color, keys: keyLabel(m), name: mappingTargetName(song, m), kind: 'pads', keyMidis: [], padMidis: pms });
      }
    });
    extras.forEach((m, i) => {
      const x = hwX + hwW - extraW * (extras.length - i);
      lanes.push({ mappingId: m.id, x, w: extraW - 4, color: laneColor(song, m.id), keys: keyLabel(m), name: mappingTargetName(song, m), kind: 'extra', keyMidis: [], padMidis: [] });
    });
    return { lanes, geometry: { gutterL, gutterR, panelH, hitY, hwX, hwW, keys, pads, keyboardW: geo.keyboard.w, hasPads, padArea } };
  }

  // lanes 레이아웃
  const n = Math.max(1, laneMappings.length);
  const gap = 6;
  const lw = (hwW - gap * (n - 1)) / n;
  laneMappings.forEach((m, i) => {
    lanes.push({ mappingId: m.id, x: hwX + i * (lw + gap), w: lw, color: laneColor(song, m.id), keys: keyLabel(m), name: mappingTargetName(song, m), kind: 'extra', keyMidis: mappingMidiNotes(m), padMidis: [] });
  });
  return { lanes, geometry: { gutterL, gutterR, panelH, hitY, hwX, hwW, keys: [], pads: [], keyboardW: 0, hasPads: false, padArea: { x: 0, w: 0 } } };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function hexA(hex: string, a: number): string {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

export function drawHighway(f: HighwayFrame) {
  const { ctx, W, H, song, settings, events, spans, pos, now, lanes, geometry: g } = f;
  const bpb = song.beatsPerBar || 4;
  const lookBeats = Math.max(1, settings.lookaheadBars) * bpb;
  const pxPerBeat = (g.hitY - 40) / lookBeats;
  const yOf = (beat: number) => g.hitY - (beat - pos) * pxPerBeat;
  const topBeat = pos + (g.hitY + 40) / pxPerBeat;
  const bottomBeat = pos - (H - g.hitY) / pxPerBeat;
  const laneById = new Map(lanes.map(l => [l.mappingId, l]));

  ctx.clearRect(0, 0, W, H);

  // ── 배경 & 레인 ──
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, W, H);
  lanes.forEach(l => {
    const grad = ctx.createLinearGradient(0, 0, 0, g.hitY);
    grad.addColorStop(0, hexA(l.color, 0.02));
    grad.addColorStop(1, hexA(l.color, 0.09));
    ctx.fillStyle = grad;
    ctx.fillRect(l.x, 0, l.w, g.hitY);
    ctx.strokeStyle = 'rgba(148,163,184,0.08)';
    ctx.lineWidth = 1;
    ctx.strokeRect(l.x + 0.5, 0.5, l.w - 1, g.hitY - 1);
  });

  // ── 박/마디/섹션 선 ──
  const firstBeat = Math.floor(bottomBeat);
  ctx.textBaseline = 'middle';
  for (let b = Math.max(0, firstBeat); b <= topBeat; b++) {
    const y = yOf(b);
    if (y < 0 || y > H) continue;
    const isBar = b % bpb === 0;
    ctx.strokeStyle = isBar ? 'rgba(226,232,240,0.35)' : 'rgba(148,163,184,0.12)';
    ctx.lineWidth = isBar ? 1.5 : 1;
    ctx.beginPath(); ctx.moveTo(g.hwX, y); ctx.lineTo(g.hwX + g.hwW, y); ctx.stroke();
    if (isBar) {
      ctx.fillStyle = 'rgba(226,232,240,0.7)';
      ctx.font = '900 12px ui-sans-serif, system-ui';
      ctx.textAlign = 'right';
      ctx.fillText(`${b / bpb + 1}`, g.hwX - 10, y - 8);
    }
  }
  spans.forEach(s => {
    const y = yOf(s.startBeat);
    if (y < -20 || y > H) return;
    const c = sectionColor(s.section, s.index);
    ctx.strokeStyle = c; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(g.hwX, y); ctx.lineTo(g.hwX + g.hwW, y); ctx.stroke();
    ctx.fillStyle = c;
    ctx.font = '900 12px ui-sans-serif, system-ui';
    ctx.textAlign = 'left';
    ctx.fillText(s.section.name.toUpperCase(), g.hwX + g.hwW + 10, y - 9);
    ctx.fillStyle = 'rgba(148,163,184,0.7)';
    ctx.font = '700 10px ui-sans-serif, system-ui';
    ctx.fillText(`${s.section.bars} bars`, g.hwX + g.hwW + 10, y + 8);
  });
  // 곡 끝
  const endBeat = spans.length ? spans[spans.length - 1].endBeat : 0;
  if (endBeat > 0) {
    const y = yOf(endBeat);
    if (y > -20 && y < H) {
      ctx.strokeStyle = 'rgba(248,113,113,0.9)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(g.hwX, y); ctx.lineTo(g.hwX + g.hwW, y); ctx.stroke();
      ctx.fillStyle = '#f87171'; ctx.font = '900 12px ui-sans-serif'; ctx.textAlign = 'left';
      ctx.fillText('END', g.hwX + g.hwW + 10, y - 9);
    }
  }

  // ── 가사 마커(왼쪽 거터) ──
  const lyrics = song.chart?.lyrics || [];
  ctx.textAlign = 'right';
  lyrics.forEach(l => {
    if (l.beat < bottomBeat || l.beat > topBeat) return;
    const y = yOf(l.beat);
    const past = l.beat < pos;
    ctx.fillStyle = past ? 'rgba(148,163,184,0.35)' : 'rgba(253,224,71,0.85)';
    ctx.font = `${past ? 600 : 800} 11px ui-sans-serif, system-ui`;
    let t = l.text;
    while (t.length > 1 && ctx.measureText(t).width > g.gutterL - 22) t = t.slice(0, -1);
    if (t !== l.text) t += '…';
    ctx.fillText(t, g.hwX - 10, y + 8);
    ctx.fillStyle = past ? 'rgba(148,163,184,0.3)' : 'rgba(253,224,71,0.6)';
    ctx.fillRect(g.hwX - 6, y - 1, 6, 2);
  });

  // ── 다음 노트 레인 강조 ──
  if (f.nextEventBeat !== null) {
    events.forEach(e => {
      if (Math.abs(e.beat - f.nextEventBeat!) > 0.01 || f.statusOf(e.id) !== 'pending') return;
      const l = laneById.get(e.mappingId); if (!l) return;
      const grad = ctx.createLinearGradient(0, g.hitY - 160, 0, g.hitY);
      grad.addColorStop(0, hexA(l.color, 0));
      grad.addColorStop(1, hexA(l.color, f.holding ? 0.35 : 0.18));
      ctx.fillStyle = grad;
      ctx.fillRect(l.x, g.hitY - 160, l.w, 160);
    });
  }

  // ── 노트 ──
  const minH = 16;
  ctx.textBaseline = 'middle';
  for (const e of events) {
    if (e.beat + e.durationBeats < bottomBeat - 1 || e.beat > topBeat) continue;
    const l = laneById.get(e.mappingId); if (!l) continue;
    const st = f.statusOf(e.id);
    if (st === 'hit' && yOf(e.beat) > g.hitY + 6) continue;   // 친 노트는 판정선 아래로 안 내려보낸다
    const yHead = yOf(e.beat);
    const tail = Math.max(0, e.durationBeats) * pxPerBeat;
    const h = Math.max(minH, tail);
    const y = yHead - h;
    const x = l.x + 3, w = l.w - 6;
    const past = e.beat < pos - 0.05;
    let alpha = 1;
    if (st === 'missed' || st === 'skipped') alpha = 0.28;
    else if (st === 'hit') alpha = Math.max(0, 1 - (now - (f.fx.find(x => x.beat === e.beat && x.mappingId === e.mappingId)?.time ?? now)) / 220);
    else if (past && !f.holding) alpha = 0.7;

    // 꼬리(지속)
    if (tail > minH) {
      ctx.fillStyle = hexA(l.color, 0.22 * alpha);
      roundRect(ctx, x + w * 0.18, y, w * 0.64, h, 6); ctx.fill();
      ctx.strokeStyle = hexA(l.color, 0.6 * alpha); ctx.lineWidth = 1.5;
      roundRect(ctx, x + w * 0.18, y, w * 0.64, h, 6); ctx.stroke();
    }
    // 머리
    const headH = Math.min(h, 22);
    const isNext = f.nextEventBeat !== null && Math.abs(e.beat - f.nextEventBeat) < 0.01 && st === 'pending';
    const pulse = isNext && f.holding ? 0.5 + 0.5 * Math.abs(Math.sin(now / 180)) : 1;
    ctx.fillStyle = st === 'missed' || st === 'skipped' ? `rgba(100,116,139,${alpha})` : hexA(l.color, (isNext ? 1 : 0.85) * alpha * pulse);
    roundRect(ctx, x, yHead - headH, w, headH, 6); ctx.fill();
    ctx.strokeStyle = `rgba(255,255,255,${0.9 * alpha})`; ctx.lineWidth = isNext ? 2 : 1;
    roundRect(ctx, x, yHead - headH, w, headH, 6); ctx.stroke();
    if (isNext && f.holding) {
      ctx.shadowColor = l.color; ctx.shadowBlur = 18;
      roundRect(ctx, x, yHead - headH, w, headH, 6); ctx.stroke();
      ctx.shadowBlur = 0;
    }
    // 라벨: 키 + 실제로 울릴 음(있으면). 매핑 이름은 반복되는 노트마다 적으면 시끄러워서 생략
    const inner = settings.showInnerNotes ? innerNotesOf(song, e) : [];
    if (alpha > 0.3) {
      ctx.fillStyle = st === 'pending' ? '#0b1220' : '#e2e8f0';
      ctx.font = '900 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      const pitches = inner.map(n => noteName(n.pitch)).join(' ');
      const label = pitches && w > 60 ? `${l.keys}  ·  ${pitches}` : pitches && w <= 60 ? pitches : l.keys;
      let t = label;
      while (t.length > 1 && ctx.measureText(t).width > w - 8) t = t.slice(0, -1);
      ctx.fillText(t, x + w / 2, yHead - headH / 2);
    }
    // 자동 지속 길이(프리셋/스텝의 duration) — 반투명 꼬리
    if (inner.length && st === 'pending') {
      const autoDur = Math.max(...inner.map(n => n.durationBeats));
      if (autoDur > 0 && tail <= minH) {
        const ah = autoDur * pxPerBeat;
        ctx.fillStyle = hexA(l.color, 0.12 * alpha);
        roundRect(ctx, x + w * 0.3, yHead - headH - ah, w * 0.4, ah, 4); ctx.fill();
      }
    }
  }

  // ── 판정선 ──
  ctx.shadowBlur = 0;
  const lineColor = f.holding ? '#fbbf24' : f.running ? '#e2e8f0' : '#64748b';
  ctx.strokeStyle = lineColor; ctx.lineWidth = f.holding ? 3 : 2;
  ctx.beginPath(); ctx.moveTo(g.hwX, g.hitY); ctx.lineTo(g.hwX + g.hwW, g.hitY); ctx.stroke();
  // 상태 표시는 오른쪽 거터 맨 아래(판정선 옆). 왼쪽은 마디 번호/가사가 쓴다
  ctx.font = '900 11px ui-sans-serif'; ctx.textAlign = 'left';
  if (f.holding) {
    ctx.shadowColor = '#fbbf24'; ctx.shadowBlur = 16;
    ctx.beginPath(); ctx.moveTo(g.hwX, g.hitY); ctx.lineTo(g.hwX + g.hwW, g.hitY); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText('WAITING', g.hwX + g.hwW + 10, g.hitY + 14);
  } else if (!f.running) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('STOPPED', g.hwX + g.hwW + 10, g.hitY + 14);
  }

  // ── 히트/미스 이펙트 ──
  f.fx.forEach(x => {
    const age = now - x.time;
    if (age > 650) return;
    const l = laneById.get(x.mappingId); if (!l) return;
    const cx = l.x + l.w / 2;
    if (x.kind === 'hit') {
      const t = age / 380;
      if (t < 1) {
        ctx.strokeStyle = hexA(l.color, 1 - t); ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath(); ctx.ellipse(cx, g.hitY, Math.min(l.w / 2 + 30 * t, l.w) , 10 + 22 * t, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = hexA(l.color, 0.35 * (1 - t));
        ctx.fillRect(l.x, g.hitY - 60 * (1 - t), l.w, 60 * (1 - t));
      }
      const off = Math.round(x.offsetMs);
      const label = Math.abs(off) <= 35 ? 'PERFECT' : off > 0 ? `+${off}` : `${off}`;
      ctx.fillStyle = Math.abs(off) <= 35 ? `rgba(110,231,183,${1 - age / 650})` : off > 0 ? `rgba(251,146,60,${1 - age / 650})` : `rgba(96,165,250,${1 - age / 650})`;
      ctx.font = '900 12px ui-sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, cx, g.hitY - 34 - age / 25);
    } else {
      ctx.fillStyle = `rgba(248,113,113,${1 - age / 650})`;
      ctx.font = '900 12px ui-sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('MISS', cx, g.hitY - 34 - age / 25);
    }
  });

  // ── 하단 패널 ──
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, g.hitY, W, H - g.hitY);
  const pressedKeysMidi = new Set<number>(), pressedPads = new Set<number>();
  f.pressedMidiNotes.forEach(k => { const [ch, p] = k.split('-').map(Number); (ch === LK_PAD_CHANNEL ? pressedPads : pressedKeysMidi).add(p); });
  const laneKeyPressed = (l: LaneBox) => l.keys.toLowerCase().split(' ').some(k => k && f.pressedKeys.has(k));
  const nextLanes = new Set<string>();
  if (f.nextEventBeat !== null) events.forEach(e => { if (Math.abs(e.beat - f.nextEventBeat!) < 0.01 && f.statusOf(e.id) === 'pending') nextLanes.add(e.mappingId); });

  if (settings.layout === 'device') {
    const laneOfKey = (midi: number) => lanes.find(l => l.keyMidis.includes(midi));
    const laneOfPad = (midi: number) => lanes.find(l => l.padMidis.includes(midi));
    const blink = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
    g.keys.filter(k => !k.black).forEach(k => {
      const l = laneOfKey(k.midi);
      const pressed = pressedKeysMidi.has(k.midi) || (l ? laneKeyPressed(l) : false);
      const expected = l ? nextLanes.has(l.mappingId) : false;
      ctx.fillStyle = pressed ? (l?.color || '#a5b4fc') : l ? hexA(l.color, 0.35) : '#e5e7eb';
      roundRect(ctx, k.x + 1, k.y + 2, k.w - 2, k.h - 4, 4); ctx.fill();
      if (expected) { ctx.strokeStyle = `rgba(251,191,36,${blink})`; ctx.lineWidth = 3; roundRect(ctx, k.x + 2, k.y + 3, k.w - 4, k.h - 6, 4); ctx.stroke(); }
      ctx.fillStyle = '#334155'; ctx.font = '800 9px ui-sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(noteName(k.midi), k.x + k.w / 2, k.y + k.h - 10);
      if (l) { ctx.fillStyle = '#0f172a'; ctx.font = '900 12px ui-sans-serif'; ctx.fillText(l.keys.split(' ')[0] || '', k.x + k.w / 2, k.y + k.h - 26); }
    });
    g.keys.filter(k => k.black).forEach(k => {
      const l = laneOfKey(k.midi);
      const pressed = pressedKeysMidi.has(k.midi) || (l ? laneKeyPressed(l) : false);
      const expected = l ? nextLanes.has(l.mappingId) : false;
      ctx.fillStyle = pressed ? (l?.color || '#c7d2fe') : l ? l.color : '#111827';
      roundRect(ctx, k.x, k.y + 2, k.w, k.h - 2, 3); ctx.fill();
      ctx.strokeStyle = expected ? `rgba(251,191,36,${blink})` : '#000'; ctx.lineWidth = expected ? 3 : 1;
      roundRect(ctx, k.x, k.y + 2, k.w, k.h - 2, 3); ctx.stroke();
      if (l) { ctx.fillStyle = '#0f172a'; ctx.font = '900 10px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillText(l.keys.split(' ')[0] || '', k.x + k.w / 2, k.y + k.h - 10); }
    });
    g.pads.forEach(p => {
      const l = laneOfPad(p.midi);
      const pressed = pressedPads.has(p.midi) || (l ? laneKeyPressed(l) : false);
      const expected = l ? nextLanes.has(l.mappingId) : false;
      ctx.fillStyle = pressed ? (l?.color || '#e2e8f0') : l ? hexA(l.color, 0.3) : '#111827';
      roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.fill();
      ctx.strokeStyle = expected ? `rgba(251,191,36,${blink})` : l ? l.color : '#1f2937'; ctx.lineWidth = expected ? 3 : 1.2;
      roundRect(ctx, p.x, p.y, p.w, p.h, 5); ctx.stroke();
      ctx.fillStyle = pressed ? '#0f172a' : '#64748b'; ctx.font = '800 8px ui-sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(String(p.midi), p.x + 4, p.y + 8);
      if (l) { ctx.fillStyle = pressed ? '#0f172a' : '#f8fafc'; ctx.font = '900 11px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillText(l.keys.split(' ')[0] || '', p.x + p.w / 2, p.y + p.h / 2 + 4); }
    });
  }
  // 키캡(extra 레인 및 lanes 레이아웃)
  lanes.filter(l => l.kind === 'extra').forEach(l => {
    const pressed = laneKeyPressed(l) || l.keyMidis.some(m => pressedKeysMidi.has(m) || pressedPads.has(m));
    const expected = nextLanes.has(l.mappingId);
    const blink = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));
    ctx.fillStyle = pressed ? l.color : hexA(l.color, 0.25);
    roundRect(ctx, l.x + 2, g.hitY + 6, l.w - 4, g.panelH - 12, 8); ctx.fill();
    ctx.strokeStyle = expected ? `rgba(251,191,36,${blink})` : hexA(l.color, 0.8); ctx.lineWidth = expected ? 3 : 1.2;
    roundRect(ctx, l.x + 2, g.hitY + 6, l.w - 4, g.panelH - 12, 8); ctx.stroke();
    ctx.fillStyle = pressed ? '#0f172a' : '#f8fafc'; ctx.font = '900 13px ui-sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(l.keys || '—', l.x + l.w / 2, g.hitY + g.panelH / 2 - 6);
    ctx.fillStyle = pressed ? '#0f172a' : hexA(l.color, 0.95); ctx.font = '700 9px ui-sans-serif';
    let t = l.name; while (t.length > 1 && ctx.measureText(t).width > l.w - 10) t = t.slice(0, -1);
    ctx.fillText(t, l.x + l.w / 2, g.hitY + g.panelH / 2 + 10);
  });
}
