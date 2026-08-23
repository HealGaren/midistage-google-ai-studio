import { Song, ChartSettings, InputMapping } from '../../types';
import { ChartEvent, SectionSpan, laneColor, keyLabel, mappingTargetName, sectionColor, noteName } from '../../utils/chart';
import { highwayGeometry, KeyRect, PadRect, LK_PAD_CHANNEL, classifyMappingNotes, padOf } from '../../utils/launchkey';
import { EventStatus, HitFx } from '../../hooks/useConductor';
import { qwertyLayout, QwertyKey } from '../../utils/qwerty';

// ─────────────────────────────────────────────────────────────────────────────
// Game 모드 캔버스 그리기. 리듬게임 "하이웨이": 노트가 위에서 떨어져 아래 판정선에 닿는다.
// 레퍼런스: Synthesia(건반 위로 떨어지는 노트), osu!mania/Guitar Hero(레인·판정선·히트 이펙트).
//
// 레이아웃 세 가지:
//   device : 하단에 Launchkey 건반+패드를 그리고, 노트가 실제 눌러야 할 키 위로 떨어진다.
//            여러 키 중 아무거나 눌러도 되는 매핑은 그 키들을 덮는 넓은 노트 하나.
//   keyboard: 하단에 US QWERTY 자판을 그리고, 매핑된 글쇠 위로 노트가 떨어진다.
//   lanes  : 매핑마다 세로 레인 하나.
// 세로축은 beat. pxPerBeat 는 "미리 보여줄 마디 수"로 정해진다. 템포가 변해도 모양은 그대로.
//
// 프레임마다 바뀌는 것(위치·상태·눌림)만 여기서 읽고, 곡에서 파생되는 것(레인 배치, 라벨,
// 키→레인 표)은 computeLayout / 호출자가 미리 계산해 넘긴다 — 60fps 에서 할당을 피하려고.
// ─────────────────────────────────────────────────────────────────────────────

export interface LaneBox {
  mappingId: string; x: number; w: number; color: string;
  keys: string;            // "J K L ;"
  keyTokens: string[];     // ["j","k","l",";"] — pressedKeys 대조용
  name: string;
  kind: 'keys' | 'pads' | 'extra';
  keyMidis: number[]; padMidis: number[];
}

export interface EventLabel { text: string; autoDurBeats: number; }

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
  layout: Layout;
  labels: Map<string, EventLabel>;   // eventId → 라벨(미리 계산)
  nextEventBeat: number | null;
  nextLanes: Set<string>;            // 다음 박에 눌러야 할 매핑 id
}

export interface Geometry {
  gutterL: number; gutterR: number; panelH: number; hitY: number;
  hwX: number; hwW: number;
  whiteKeys: KeyRect[]; blackKeys: KeyRect[]; pads: PadRect[]; hasPads: boolean; padArea: { x: number; w: number };
  qwerty: QwertyKey[];
}

export interface Layout {
  lanes: LaneBox[];
  geometry: Geometry;
  laneById: Map<string, LaneBox>;
  laneByKeyMidi: Map<number, LaneBox>;
  laneByPadMidi: Map<number, LaneBox>;
  laneByQwerty: Map<string, LaneBox>;
}

export const GUTTER_L = 150;
export const GUTTER_R = 130;

/** 레인 배치 계산. 폭/레이아웃/곡이 바뀔 때만 다시 한다. */
export function computeLayout(song: Song, laneMappings: InputMapping[], W: number, H: number, settings: ChartSettings): Layout {
  const gutterL = GUTTER_L, gutterR = GUTTER_R;
  const hwX = gutterL, hwW = Math.max(100, W - gutterL - gutterR);
  const panelH = settings.layout === 'device' ? Math.max(90, Math.min(150, H * 0.17)) : settings.layout === 'keyboard' ? Math.max(120, Math.min(200, H * 0.24)) : 64;
  const hitY = H - panelH;
  const lanes: LaneBox[] = [];
  const mk = (m: InputMapping, x: number, w: number, kind: LaneBox['kind'], keyMidis: number[], padMidis: number[]): LaneBox => {
    const keys = keyLabel(m);
    return { mappingId: m.id, x, w, color: laneColor(song, m.id), keys, keyTokens: keys.toLowerCase().split(' ').filter(Boolean), name: mappingTargetName(song, m), kind, keyMidis, padMidis };
  };

  let geometry: Geometry;
  if (settings.layout === 'device') {
    const classified = laneMappings.map(m => ({ m, ...classifyMappingNotes(m) }));
    const hasPads = classified.some(c => c.padMidis.length > 0);
    const extras = classified.filter(c => c.keyMidis.length === 0 && c.padMidis.length === 0);
    const extraW = extras.length ? Math.min(70, hwW * 0.12) : 0;
    // 하단 패널(건반/패드)은 판정선 바로 아래: y = H - panelH
    const geo = highwayGeometry(hwW - extraW * extras.length - (extras.length ? 8 : 0), H, panelH, hasPads);
    const shift = <T extends { x: number }>(r: T): T => ({ ...r, x: r.x + hwX });
    const keys = geo.keys.map(shift);
    const pads = geo.padsBottom.map(shift);
    const padArea = { x: geo.padArea.x + hwX, w: geo.padArea.w };

    classified.forEach(c => {
      if (c.keyMidis.length) {
        const rects = keys.filter(k => c.keyMidis.includes(k.midi));
        const x0 = Math.min(...rects.map(r => r.x)), x1 = Math.max(...rects.map(r => r.x + r.w));
        lanes.push(mk(c.m, x0, x1 - x0, 'keys', c.keyMidis, []));
      } else if (c.padMidis.length) {
        const cols = c.padMidis.map(n => padOf(n)!.col);
        const cell = padArea.w / 8;
        const c0 = Math.min(...cols), c1 = Math.max(...cols);
        lanes.push(mk(c.m, padArea.x + c0 * cell, (c1 - c0 + 1) * cell, 'pads', [], c.padMidis));
      }
    });
    extras.forEach((c, i) => lanes.push(mk(c.m, hwX + hwW - extraW * (extras.length - i), extraW - 4, 'extra', [], [])));
    geometry = { gutterL, gutterR, panelH, hitY, hwX, hwW, whiteKeys: keys.filter(k => !k.black), blackKeys: keys.filter(k => k.black), pads, hasPads, padArea, qwerty: [] };
  } else if (settings.layout === 'keyboard') {
    // 컴퓨터 키보드: 매핑된 글쇠들을 덮는 x 범위가 레인. 글쇠가 없는 매핑은 오른쪽 extra 레인
    const qwerty = qwertyLayout({ x: hwX, y: hitY + 4, w: hwW, h: panelH - 8 });
    const byKey = new Map(qwerty.map(k => [k.key, k]));
    const extras: InputMapping[] = [];
    laneMappings.forEach(m => {
      const c = classifyMappingNotes(m);
      const ks = keyLabel(m).toLowerCase().split(' ').map(k => byKey.get(k)).filter((k): k is QwertyKey => !!k);
      if (!ks.length) { extras.push(m); return; }
      const x0 = Math.min(...ks.map(k => k.x)), x1 = Math.max(...ks.map(k => k.x + k.w));
      lanes.push(mk(m, x0, x1 - x0, 'keys', c.keyMidis, c.padMidis));
    });
    const extraW = extras.length ? Math.min(70, hwW * 0.12) : 0;
    extras.forEach((m, i) => { const c = classifyMappingNotes(m); lanes.push(mk(m, hwX + hwW - extraW * (extras.length - i), extraW - 4, 'extra', c.keyMidis, c.padMidis)); });
    geometry = { gutterL, gutterR, panelH, hitY, hwX, hwW, whiteKeys: [], blackKeys: [], pads: [], hasPads: false, padArea: { x: 0, w: 0 }, qwerty };
  } else {
    const n = Math.max(1, laneMappings.length);
    const gap = 6;
    const lw = (hwW - gap * (n - 1)) / n;
    laneMappings.forEach((m, i) => {
      const c = classifyMappingNotes(m);
      lanes.push(mk(m, hwX + i * (lw + gap), lw, 'extra', c.keyMidis, c.padMidis));
    });
    geometry = { gutterL, gutterR, panelH, hitY, hwX, hwW, whiteKeys: [], blackKeys: [], pads: [], hasPads: false, padArea: { x: 0, w: 0 }, qwerty: [] };
  }

  const laneById = new Map(lanes.map(l => [l.mappingId, l]));
  const laneByKeyMidi = new Map<number, LaneBox>();
  const laneByPadMidi = new Map<number, LaneBox>();
  const laneByQwerty = new Map<string, LaneBox>();
  lanes.forEach(l => { l.keyMidis.forEach(n => laneByKeyMidi.set(n, l)); l.padMidis.forEach(n => laneByPadMidi.set(n, l)); l.keyTokens.forEach(k => laneByQwerty.set(k, l)); });
  return { lanes, geometry, laneById, laneByKeyMidi, laneByPadMidi, laneByQwerty };
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

const hexCache = new Map<string, string>();
function hexA(hex: string, a: number): string {
  const key = `${hex}|${a.toFixed(3)}`;
  let v = hexCache.get(key);
  if (!v) {
    const h = hex.replace('#', '');
    v = `rgba(${parseInt(h.slice(0, 2), 16)},${parseInt(h.slice(2, 4), 16)},${parseInt(h.slice(4, 6), 16)},${a})`;
    if (hexCache.size > 2000) hexCache.clear();
    hexCache.set(key, v);
  }
  return v;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string {
  if (ctx.measureText(text).width <= maxW) return text;
  let lo = 0, hi = text.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (ctx.measureText(text.slice(0, mid) + '…').width <= maxW) lo = mid; else hi = mid - 1; }
  return lo > 0 ? text.slice(0, lo) + '…' : '';
}

/** 하단 패널의 키캡/패드/건반 하나 */
function drawCap(ctx: CanvasRenderingContext2D, r: { x: number; y: number; w: number; h: number }, lane: LaneBox | undefined, pressed: boolean, expected: boolean, blink: number,
  style: { idleFill: string; idleStroke: string; radius: number; label?: string; labelY?: number; labelColor?: string; sub?: string; subY?: number; subColor?: string }) {
  ctx.fillStyle = pressed ? (lane?.color || '#e2e8f0') : lane ? hexA(lane.color, style.idleFill === 'tint' ? 0.35 : 1) : style.idleFill;
  if (lane && !pressed && style.idleFill !== 'tint') ctx.fillStyle = lane.color;
  roundRect(ctx, r.x, r.y, r.w, r.h, style.radius); ctx.fill();
  if (expected) { ctx.strokeStyle = `rgba(251,191,36,${blink})`; ctx.lineWidth = 3; }
  else { ctx.strokeStyle = lane ? (style.idleStroke === 'lane' ? lane.color : style.idleStroke) : style.idleStroke; ctx.lineWidth = 1.2; }
  roundRect(ctx, r.x, r.y, r.w, r.h, style.radius); ctx.stroke();
  ctx.textAlign = 'center';
  if (style.sub) { ctx.fillStyle = style.subColor || '#334155'; ctx.font = '800 9px ui-sans-serif'; ctx.fillText(style.sub, r.x + r.w / 2, style.subY ?? (r.y + r.h - 10)); }
  if (lane && style.label !== undefined) { ctx.fillStyle = style.labelColor || '#0f172a'; ctx.font = '900 12px ui-sans-serif'; ctx.fillText(style.label, r.x + r.w / 2, style.labelY ?? (r.y + r.h - 26)); }
}

export function drawHighway(f: HighwayFrame) {
  const { ctx, W, H, song, settings, events, spans, pos, now, layout, labels, nextLanes } = f;
  const { lanes, geometry: g, laneById } = layout;
  const bpb = song.beatsPerBar || 4;
  const lookBeats = Math.max(1, settings.lookaheadBars) * bpb;
  const pxPerBeat = (g.hitY - 40) / lookBeats;
  const yOf = (beat: number) => g.hitY - (beat - pos) * pxPerBeat;
  const topBeat = pos + (g.hitY + 40) / pxPerBeat;
  const bottomBeat = pos - (H - g.hitY) / pxPerBeat;

  ctx.clearRect(0, 0, W, H);

  // ── 배경 & 레인 ──
  ctx.fillStyle = '#060a14';
  ctx.fillRect(0, 0, W, H);
  lanes.forEach(l => {
    ctx.fillStyle = hexA(l.color, 0.06);
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
  for (const l of lyrics) {
    if (l.beat < bottomBeat || l.beat > topBeat) continue;
    const y = yOf(l.beat);
    const past = l.beat < pos;
    ctx.fillStyle = past ? 'rgba(148,163,184,0.35)' : 'rgba(253,224,71,0.85)';
    ctx.font = `${past ? 600 : 800} 11px ui-sans-serif, system-ui`;
    ctx.fillText(fitText(ctx, l.text, g.gutterL - 22), g.hwX - 10, y + 8);
    ctx.fillStyle = past ? 'rgba(148,163,184,0.3)' : 'rgba(253,224,71,0.6)';
    ctx.fillRect(g.hwX - 6, y - 1, 6, 2);
  }

  // ── 다음 노트 레인 강조 ──
  nextLanes.forEach(id => {
    const l = laneById.get(id); if (!l) return;
    const grad = ctx.createLinearGradient(0, g.hitY - 160, 0, g.hitY);
    grad.addColorStop(0, hexA(l.color, 0));
    grad.addColorStop(1, hexA(l.color, f.holding ? 0.35 : 0.18));
    ctx.fillStyle = grad;
    ctx.fillRect(l.x, g.hitY - 160, l.w, 160);
  });

  // ── 노트 ──
  const fxTime = new Map<string, number>();
  for (const x of f.fx) if (x.kind === 'hit') fxTime.set(`${x.mappingId}|${x.beat}`, x.time);
  const minH = 16;
  ctx.textBaseline = 'middle';
  for (const e of events) {
    if (e.beat + e.durationBeats < bottomBeat - 1 || e.beat > topBeat) continue;
    const l = laneById.get(e.mappingId); if (!l) continue;
    const st = f.statusOf(e.id);
    const yHead = yOf(e.beat);
    if (st === 'hit' && yHead > g.hitY + 6) continue;   // 친 노트는 판정선 아래로 안 내려보낸다
    const tail = Math.max(0, e.durationBeats) * pxPerBeat;
    const h = Math.max(minH, tail);
    const y = yHead - h;
    const x = l.x + 3, w = l.w - 6;
    const past = e.beat < pos - 0.05;
    let alpha = 1;
    if (st === 'missed' || st === 'skipped') alpha = 0.28;
    else if (st === 'hit') { const t = fxTime.get(`${e.mappingId}|${e.beat}`); alpha = t === undefined ? 0 : Math.max(0, 1 - (now - t) / 220); }
    else if (past && !f.holding) alpha = 0.7;
    if (alpha <= 0) continue;

    // 꼬리(지속)
    if (tail > minH) {
      ctx.fillStyle = hexA(l.color, 0.22 * alpha);
      roundRect(ctx, x + w * 0.18, y, w * 0.64, h, 6); ctx.fill();
      ctx.strokeStyle = hexA(l.color, 0.6 * alpha); ctx.lineWidth = 1.5;
      roundRect(ctx, x + w * 0.18, y, w * 0.64, h, 6); ctx.stroke();
    }
    // 머리
    const headH = Math.min(h, 22);
    const isNext = st === 'pending' && f.nextEventBeat !== null && Math.abs(e.beat - f.nextEventBeat) < 0.01;
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
    const label = labels.get(e.id);
    if (alpha > 0.3 && label) {
      ctx.fillStyle = st === 'pending' ? '#0b1220' : '#e2e8f0';
      ctx.font = '900 11px ui-sans-serif, system-ui';
      ctx.textAlign = 'center';
      ctx.fillText(fitText(ctx, label.text, w - 8), x + w / 2, yHead - headH / 2);
    }
    // 자동 지속 길이(프리셋/스텝의 duration) — 반투명 꼬리
    if (label && label.autoDurBeats > 0 && st === 'pending' && tail <= minH) {
      const ah = label.autoDurBeats * pxPerBeat;
      ctx.fillStyle = hexA(l.color, 0.12 * alpha);
      roundRect(ctx, x + w * 0.3, yHead - headH - ah, w * 0.4, ah, 4); ctx.fill();
    }
  }

  // ── 판정선 ──
  ctx.shadowBlur = 0;
  const lineColor = f.holding ? '#fbbf24' : f.running ? '#e2e8f0' : '#64748b';
  ctx.strokeStyle = lineColor; ctx.lineWidth = f.holding ? 3 : 2;
  ctx.beginPath(); ctx.moveTo(g.hwX, g.hitY); ctx.lineTo(g.hwX + g.hwW, g.hitY); ctx.stroke();
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
  for (const x of f.fx) {
    const age = now - x.time;
    if (age > 650) continue;
    const l = laneById.get(x.mappingId); if (!l) continue;
    const cx = l.x + l.w / 2;
    if (x.kind === 'hit') {
      const t = age / 380;
      if (t < 1) {
        ctx.strokeStyle = hexA(l.color, 1 - t); ctx.lineWidth = 3 * (1 - t) + 1;
        ctx.beginPath(); ctx.ellipse(cx, g.hitY, Math.min(l.w / 2 + 30 * t, l.w), 10 + 22 * t, 0, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = hexA(l.color, 0.35 * (1 - t));
        ctx.fillRect(l.x, g.hitY - 60 * (1 - t), l.w, 60 * (1 - t));
      }
      const off = Math.round(x.offsetMs);
      const label = Math.abs(off) <= 35 ? 'PERFECT' : off > 0 ? `+${off}` : `${off}`;
      const a = 1 - age / 650;
      ctx.fillStyle = Math.abs(off) <= 35 ? `rgba(110,231,183,${a})` : off > 0 ? `rgba(251,146,60,${a})` : `rgba(96,165,250,${a})`;
      ctx.font = '900 12px ui-sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(label, cx, g.hitY - 34 - age / 25);
    } else {
      ctx.fillStyle = `rgba(248,113,113,${1 - age / 650})`;
      ctx.font = '900 12px ui-sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('MISS', cx, g.hitY - 34 - age / 25);
    }
  }

  // ── 하단 패널 ──
  ctx.fillStyle = '#0b1220';
  ctx.fillRect(0, g.hitY, W, H - g.hitY);
  const pressedKeysMidi = new Set<number>(), pressedPads = new Set<number>();
  f.pressedMidiNotes.forEach(k => { const i = k.indexOf('-'); const ch = +k.slice(0, i), p = +k.slice(i + 1); (ch === LK_PAD_CHANNEL ? pressedPads : pressedKeysMidi).add(p); });
  const laneKeyPressed = (l: LaneBox) => l.keyTokens.some(k => f.pressedKeys.has(k));
  const blink = 0.55 + 0.45 * Math.abs(Math.sin(now / 160));

  if (settings.layout === 'device') {
    for (const k of g.whiteKeys) {
      const l = layout.laneByKeyMidi.get(k.midi);
      drawCap(ctx, { x: k.x + 1, y: k.y + 2, w: k.w - 2, h: k.h - 4 }, l, pressedKeysMidi.has(k.midi) || (!!l && laneKeyPressed(l)), !!l && nextLanes.has(l.mappingId), blink,
        { idleFill: l ? 'tint' : '#e5e7eb', idleStroke: 'rgba(0,0,0,0)', radius: 4, label: l?.keyTokens[0]?.toUpperCase() || '', sub: noteName(k.midi) });
    }
    for (const k of g.blackKeys) {
      const l = layout.laneByKeyMidi.get(k.midi);
      drawCap(ctx, { x: k.x, y: k.y + 2, w: k.w, h: k.h - 2 }, l, pressedKeysMidi.has(k.midi) || (!!l && laneKeyPressed(l)), !!l && nextLanes.has(l.mappingId), blink,
        { idleFill: '#111827', idleStroke: '#000', radius: 3, label: l?.keyTokens[0]?.toUpperCase() || '', labelY: k.y + k.h - 10 });
    }
    for (const p of g.pads) {
      const l = layout.laneByPadMidi.get(p.midi);
      const pressed = pressedPads.has(p.midi) || (!!l && laneKeyPressed(l));
      drawCap(ctx, p, l, pressed, !!l && nextLanes.has(l.mappingId), blink,
        { idleFill: l ? 'tint' : '#111827', idleStroke: 'lane', radius: 5, label: l?.keyTokens[0]?.toUpperCase() || '', labelY: p.y + p.h / 2 + 4, labelColor: pressed ? '#0f172a' : '#f8fafc' });
      ctx.fillStyle = pressed ? '#0f172a' : '#64748b'; ctx.font = '800 8px ui-sans-serif'; ctx.textAlign = 'left';
      ctx.fillText(String(p.midi), p.x + 4, p.y + 8);
    }
  }
  if (settings.layout === 'keyboard') {
    for (const k of g.qwerty) {
      const l = layout.laneByQwerty.get(k.key);
      const pressed = f.pressedKeys.has(k.key) || (!!l && (l.keyMidis.some(m => pressedKeysMidi.has(m)) || l.padMidis.some(m => pressedPads.has(m))));
      drawCap(ctx, k, l, pressed, !!l && nextLanes.has(l.mappingId), blink,
        { idleFill: l ? 'tint' : '#1f2937', idleStroke: l ? 'lane' : '#334155', radius: 5, label: l ? k.label : undefined, labelY: k.y + k.h / 2 + 4, labelColor: pressed ? '#0f172a' : '#f8fafc' });
      if (!l) { ctx.fillStyle = '#64748b'; ctx.font = '800 10px ui-sans-serif'; ctx.textAlign = 'center'; ctx.fillText(k.label, k.x + k.w / 2, k.y + k.h / 2 + 4); }
    }
  }
  // 키캡(extra 레인 및 lanes 레이아웃)
  for (const l of lanes) {
    if (l.kind !== 'extra') continue;
    const pressed = laneKeyPressed(l) || l.keyMidis.some(m => pressedKeysMidi.has(m)) || l.padMidis.some(m => pressedPads.has(m));
    const expected = nextLanes.has(l.mappingId);
    ctx.fillStyle = pressed ? l.color : hexA(l.color, 0.25);
    roundRect(ctx, l.x + 2, g.hitY + 6, l.w - 4, g.panelH - 12, 8); ctx.fill();
    ctx.strokeStyle = expected ? `rgba(251,191,36,${blink})` : hexA(l.color, 0.8); ctx.lineWidth = expected ? 3 : 1.2;
    roundRect(ctx, l.x + 2, g.hitY + 6, l.w - 4, g.panelH - 12, 8); ctx.stroke();
    ctx.fillStyle = pressed ? '#0f172a' : '#f8fafc'; ctx.font = '900 13px ui-sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(l.keys || '—', l.x + l.w / 2, g.hitY + g.panelH / 2 - 6);
    ctx.fillStyle = pressed ? '#0f172a' : hexA(l.color, 0.95); ctx.font = '700 9px ui-sans-serif';
    ctx.fillText(fitText(ctx, l.name, l.w - 10), l.x + l.w / 2, g.hitY + g.panelH / 2 + 10);
  }
}
