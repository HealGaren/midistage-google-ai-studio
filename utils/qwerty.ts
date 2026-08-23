// ─────────────────────────────────────────────────────────────────────────────
// 컴퓨터 키보드(US QWERTY) 배치. Game 모드 'keyboard' 레이아웃과 하단 패널이 쓴다.
// 키 이름은 normalizeKey 결과(소문자, 'space', 'arrowleft' …)와 같다.
// ─────────────────────────────────────────────────────────────────────────────
import { Rect } from './launchkey';

export interface QwertyKey extends Rect { key: string; label: string; }

// 각 줄: [왼쪽 들여쓰기(키 단위), 키 목록]. 너비가 다른 키는 [이름, 폭] 로.
type KeySpec = string | [string, number, string?];
const ROWS: { indent: number; keys: KeySpec[] }[] = [
  { indent: 0,    keys: ['`', '1', '2', '3', '4', '5', '6', '7', '8', '9', '0', '-', '=', ['backspace', 2, '⌫']] },
  { indent: 1.5,  keys: ['q', 'w', 'e', 'r', 't', 'y', 'u', 'i', 'o', 'p', '[', ']', ['\\', 1.5]] },
  { indent: 1.75, keys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l', ';', "'", ['enter', 2.25, '⏎']] },
  { indent: 2.25, keys: ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/', ['shift', 2.75, '⇧']] },
  { indent: 3.75, keys: [['space', 7, 'space'], ['arrowleft', 1, '←'], ['arrowup', 1, '↑'], ['arrowdown', 1, '↓'], ['arrowright', 1, '→']] },
];
const UNITS = 15; // 가장 긴 줄의 폭(키 단위)

/** 폭 W 에 맞춘 전체 자판. 높이는 5줄 */
export function qwertyLayout(area: Rect): QwertyKey[] {
  const u = area.w / UNITS;
  const gap = u * 0.08;
  const rowH = area.h / ROWS.length;
  const out: QwertyKey[] = [];
  ROWS.forEach((row, r) => {
    let x = area.x + row.indent * u;
    row.keys.forEach(spec => {
      const [key, w, label] = typeof spec === 'string' ? [spec, 1, spec] : [spec[0], spec[1], spec[2] ?? spec[0]];
      out.push({ key, label: label.length === 1 ? label.toUpperCase() : label, x: x + gap / 2, y: area.y + r * rowH + gap / 2, w: w * u - gap, h: rowH - gap });
      x += w * u;
    });
  });
  return out;
}
