import { describe, it, expect } from 'vitest';
import { classifyMappingNotes, padOf, keyRects, LK_PAD_TOP, LK_PAD_BOTTOM } from './launchkey';

const m = (midiValue: string, midiChannel: number, range?: [number, number]) => ({ midiValue, midiChannel, isMidiRange: !!range, midiRangeStart: range?.[0] ?? 0, midiRangeEnd: range?.[1] ?? 0 });

describe('Launchkey Mini MK3 배치', () => {
  it('패드 번호 → 줄/열 (사용자 기억: 우상단 두 키 50,51 / 우하단 47)', () => {
    expect(padOf(50)).toEqual({ row: 0, col: 6 }); expect(padOf(51)).toEqual({ row: 0, col: 7 });
    expect(padOf(47)).toEqual({ row: 1, col: 7 }); expect(padOf(52)).toBeNull();
    expect(LK_PAD_TOP.length + LK_PAD_BOTTOM.length).toBe(16);
  });
  it('채널 10 은 패드, 건반 범위(48~72)는 키, omni 는 범위로 구분', () => {
    expect(classifyMappingNotes(m('48', 10))).toEqual({ keyMidis: [], padMidis: [48] });
    expect(classifyMappingNotes(m('48', 1))).toEqual({ keyMidis: [48], padMidis: [] });
    expect(classifyMappingNotes(m('36,48', 0))).toEqual({ keyMidis: [48], padMidis: [36] });
    expect(classifyMappingNotes(m('', 1, [60, 62]))).toEqual({ keyMidis: [60, 61, 62], padMidis: [] });
    expect(classifyMappingNotes(m('24', 1))).toEqual({ keyMidis: [], padMidis: [] });
  });
  it('25키 = 흰 15 + 검은 10, 검은건반은 흰건반 경계에 걸친다', () => {
    const ks = keyRects({ x: 0, y: 0, w: 150, h: 40 });
    expect(ks.filter(k => !k.black).length).toBe(15); expect(ks.filter(k => k.black).length).toBe(10);
    const cs = ks.find(k => k.midi === 49)!; const c = ks.find(k => k.midi === 48)!;
    expect(cs.x + cs.w / 2).toBeCloseTo(c.x + c.w, 5);
  });
});
