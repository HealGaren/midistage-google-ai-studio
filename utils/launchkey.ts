// ─────────────────────────────────────────────────────────────────────────────
// Novation Launchkey Mini MK3 의 물리 배치.
//
// 이 앱의 셋리스트가 실제로 쓰는 값으로 확정한 것:
//  - 건반 25키. 시작 노트는 기기의 Octave 버튼 설정에 따라 다르다 → ProjectData.deviceKeyLow 로
//    조정(Settings). 기본값은 매핑을 검증했던 48(C3)~72(C5).
//  - 패드 16개 = 2줄 × 8. Drum 모드 → 채널 10, 노트는 GM 드럼 배치:
//        윗줄 : 40 41 42 43 48 49 50 51
//        아랫줄: 36 37 38 39 44 45 46 47
//    (셋리스트의 "우상단 두 키 = 50,51", "우하단 = 47" 과 일치)
//  - 노브 8개 = CC 21~28, 채널 1. 모듈레이션 터치스트립 = CC 1.
//  - 패드 두 줄 오른쪽 버튼(채널 16, 누름 127/뗌 0): 윗줄 '>' = CC104, 아랫줄 Mute = CC105,
//    Mute 오른쪽 녹화 = CC117. 앱은 그대로 DAW 로 패스스루(글로벌 CC 매핑).
//
// 여기서는 폭 W 를 주면 각 키/패드/노브의 사각형을 돌려준다. SVG 뷰(Live 탭)와
// Game 모드 캔버스가 같은 함수를 써서 떨어지는 노트와 건반이 정확히 맞물린다.
// ─────────────────────────────────────────────────────────────────────────────

export const LK_KEY_LOW = 48;
export const LK_KEY_HIGH = 72;
export const LK_PAD_CHANNEL = 10;
export const LK_PAD_TOP = [40, 41, 42, 43, 48, 49, 50, 51];
export const LK_PAD_BOTTOM = [36, 37, 38, 39, 44, 45, 46, 47];
export const LK_KNOB_CCS = [21, 22, 23, 24, 25, 26, 27, 28];
export const LK_BUTTON_CH = 16;
export const LK_BUTTONS = [
  { cc: 104, label: '>',    row: 0 as const },  // scene/이전곡용
  { cc: 105, label: 'Mute', row: 1 as const },  // 다음곡용
  { cc: 117, label: '●',    row: 1 as const },  // 녹화 = 탭템포용 (Mute 오른쪽)
];

export const isBlackKey = (midi: number) => [1, 3, 6, 8, 10].includes(midi % 12);

export interface Rect { x: number; y: number; w: number; h: number; }
export interface KeyRect extends Rect { midi: number; black: boolean; }
export interface PadRect extends Rect { midi: number; row: 0 | 1; col: number; }
export interface KnobRect { cx: number; cy: number; r: number; cc: number; }
export interface ButtonRect extends Rect { cc: number; label: string; }

export interface DeviceLayout {
  width: number;
  height: number;
  keys: KeyRect[];          // 흰건반 먼저, 검은건반 나중(그리기 순서)
  pads: PadRect[];
  knobs: KnobRect[];
  buttons: ButtonRect[];    // 패드 오른쪽 '>' / Mute / ● (ch16 CC104/105/117)
  keyboard: Rect;           // 건반 전체 영역
  padArea: Rect;
  knobArea: Rect;
}

/** 건반 폭에 맞춰 키 사각형 계산. 흰건반 15개가 폭을 나눠 가진다. */
export function keyRects(area: Rect, low = LK_KEY_LOW, high = low + 24): KeyRect[] {
  const whites: number[] = [];
  for (let n = low; n <= high; n++) if (!isBlackKey(n)) whites.push(n);
  const ww = area.w / whites.length;
  const bw = ww * 0.62;
  const bh = area.h * 0.6;
  const out: KeyRect[] = [];
  whites.forEach((midi, i) => out.push({ midi, black: false, x: area.x + i * ww, y: area.y, w: ww, h: area.h }));
  for (let n = low; n <= high; n++) {
    if (!isBlackKey(n)) continue;
    // 바로 아래 흰건반의 오른쪽 경계에 걸친다
    const leftWhiteIdx = whites.findIndex(w => w > n) - 1;
    const cx = area.x + (leftWhiteIdx + 1) * ww;
    out.push({ midi: n, black: true, x: cx - bw / 2, y: area.y, w: bw, h: bh });
  }
  return out;
}

/**
 * 전체 기기 배치. 위에서부터 노브 → 패드 → 건반.
 * `compact` 면 Game 모드 하단처럼 건반+패드만(노브 생략).
 */
export function deviceLayout(width: number, opts: { compact?: boolean; keyHeight?: number; keyLow?: number } = {}): DeviceLayout {
  const pad = Math.max(4, width * 0.008);
  // 실제 기기 비율: 건반이 전체 폭, 패드 블록은 오른쪽 2/3 쯤에 놓인다
  const keyH = opts.keyHeight ?? Math.max(56, width * 0.14);
  // 패드 8열 + 버튼 열('>'·Mute) + 녹화 버튼 열 = 10칸
  const padBlockW = width * 0.62;
  const padBlockX = width - padBlockW - pad;
  const padCell = (padBlockW - pad * 9) / 10;
  const padH = padCell * 0.78;
  const knobH = opts.compact ? 0 : padCell * 0.9;

  const knobArea: Rect = { x: padBlockX, y: pad, w: padBlockW, h: knobH };
  const padArea: Rect = { x: padBlockX, y: knobArea.y + knobH + (knobH ? pad : 0), w: padBlockW, h: padH * 2 + pad };
  const keyboard: Rect = { x: pad, y: padArea.y + padArea.h + pad, w: width - pad * 2, h: keyH };

  const knobs: KnobRect[] = knobH ? LK_KNOB_CCS.map((cc, i) => ({
    cc, cx: padBlockX + i * (padCell + pad) + padCell / 2, cy: knobArea.y + knobH / 2, r: Math.min(padCell, knobH) * 0.36,
  })) : [];

  const pads: PadRect[] = [];
  LK_PAD_TOP.forEach((midi, col) => pads.push({ midi, row: 0, col, x: padBlockX + col * (padCell + pad), y: padArea.y, w: padCell, h: padH }));
  LK_PAD_BOTTOM.forEach((midi, col) => pads.push({ midi, row: 1, col, x: padBlockX + col * (padCell + pad), y: padArea.y + padH + pad, w: padCell, h: padH }));

  // '>'(윗줄)·Mute(아랫줄)는 9열째, 녹화는 Mute 오른쪽 10열째
  const bx = (col: number) => padBlockX + col * (padCell + pad);
  const buttons: ButtonRect[] = LK_BUTTONS.map((b, i) => ({
    cc: b.cc, label: b.label,
    x: bx(i === 2 ? 9 : 8), y: b.row === 0 ? padArea.y : padArea.y + padH + pad, w: padCell, h: padH,
  }));

  return {
    width,
    height: keyboard.y + keyboard.h + pad,
    keys: keyRects(keyboard, opts.keyLow ?? LK_KEY_LOW),
    pads,
    knobs,
    buttons,
    keyboard,
    padArea,
    knobArea,
  };
}

/** Game 모드 레인용: 건반 영역과 패드 레인 영역을 가로로 나눈다. */
export interface HighwayGeometry {
  keyboard: Rect;           // 건반(흰건반 15 폭)
  keys: KeyRect[];
  padLanes: { midi: number; row: 0 | 1; col: number; x: number; w: number }[]; // 8열(위/아래 패드가 같은 열)
  padArea: Rect;
  padsBottom: PadRect[];    // 하단 패널에 그릴 패드 사각형
}

export function highwayGeometry(width: number, height: number, panelH: number, hasPads: boolean, keyLow = LK_KEY_LOW): HighwayGeometry {
  const gap = 10;
  const padW = hasPads ? Math.min(width * 0.3, 8 * 44) : 0;
  const kbW = width - padW - (hasPads ? gap : 0);
  const keyboard: Rect = { x: 0, y: height - panelH, w: kbW, h: panelH };
  const keys = keyRects(keyboard, keyLow);
  const padArea: Rect = { x: kbW + gap, y: height - panelH, w: padW, h: panelH };
  const cell = padW / 8;
  const padLanes = hasPads ? Array.from({ length: 8 }, (_, col) => ({ midi: LK_PAD_BOTTOM[col], row: 1 as const, col, x: padArea.x + col * cell, w: cell })) : [];
  const padsBottom: PadRect[] = [];
  if (hasPads) {
    const ph = (panelH - 6) / 2;
    LK_PAD_TOP.forEach((midi, col) => padsBottom.push({ midi, row: 0, col, x: padArea.x + col * cell + 2, y: padArea.y + 2, w: cell - 4, h: ph - 2 }));
    LK_PAD_BOTTOM.forEach((midi, col) => padsBottom.push({ midi, row: 1, col, x: padArea.x + col * cell + 2, y: padArea.y + ph + 4, w: cell - 4, h: ph - 2 }));
  }
  return { keyboard, keys, padLanes, padArea, padsBottom };
}

/**
 * 매핑이 기기의 어느 키/패드에 놓이는지. Live 탭 그림과 Game 하이웨이가 **같은 함수**를 써야
 * 떨어지는 노트와 그려진 키가 어긋나지 않는다.
 *  - 채널 10 → 패드 (36~51 중 있는 것)
 *  - omni(0) → 건반 범위(48~72)면 건반, 범위 밖이면서 패드 번호면 패드
 *  - 그 외 채널 → 건반 범위 안의 것만
 */
export function classifyMappingNotes(m: { midiChannel: number; isMidiRange: boolean; midiRangeStart: number; midiRangeEnd: number; midiValue: string }, keyLow = LK_KEY_LOW): { keyMidis: number[]; padMidis: number[] } {
  const notes: number[] = [];
  if (m.isMidiRange) { for (let n = m.midiRangeStart; n <= m.midiRangeEnd; n++) notes.push(n); }
  else String(m.midiValue || '').split(',').forEach(s => { const n = parseInt(s.trim(), 10); if (!isNaN(n)) notes.push(n); });
  const keyMidis: number[] = [], padMidis: number[] = [];
  for (const n of notes) {
    const inKeys = n >= keyLow && n <= keyLow + 24;
    if (m.midiChannel === LK_PAD_CHANNEL) { if (padOf(n)) padMidis.push(n); }
    else if (m.midiChannel === 0 && !inKeys && padOf(n)) padMidis.push(n);
    else if (inKeys) keyMidis.push(n);
  }
  return { keyMidis, padMidis };
}

export function padOf(midi: number): { row: 0 | 1; col: number } | null {
  let col = LK_PAD_TOP.indexOf(midi);
  if (col >= 0) return { row: 0, col };
  col = LK_PAD_BOTTOM.indexOf(midi);
  if (col >= 0) return { row: 1, col };
  return null;
}
