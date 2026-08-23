import { describe, it, expect } from 'vitest';
import { normalizeKey } from './inputCapture';
import { displayKey } from './chart';
import { qwertyLayout } from './qwerty';
import { importSongFromJson, exportSongToJson } from './songImportExport';
import { buildChartEvents } from './chart';
import { makeSong } from '../test/fixtures';

describe('normalizeKey', () => {
  it('공백은 space, 나머지는 소문자', () => {
    expect(normalizeKey(' ')).toBe('space'); expect(normalizeKey('ArrowLeft')).toBe('arrowleft'); expect(normalizeKey('J')).toBe('j');
  });
});

describe('displayKey', () => {
  it('한 글자는 대문자, 특수키는 기호 — 키캡/라벨/자판이 같은 규칙', () => {
    expect(displayKey('j')).toBe('J'); expect(displayKey(';')).toBe(';'); expect(displayKey('arrowleft')).toBe('←'); expect(displayKey('space')).toBe('space');
  });
});

describe('qwertyLayout', () => {
  it('모든 매핑 글쇠 이름을 찾을 수 있고 겹치지 않는다', () => {
    const keys = qwertyLayout({ x: 0, y: 0, w: 1500, h: 500 });
    const names = new Set(keys.map(k => k.key));
    for (const k of ['a', 's', 'j', ';', 'u', 'o', 'space', 'arrowleft', 'enter', 'backspace']) expect(names.has(k)).toBe(true);
    expect(names.size).toBe(keys.length);
  });
});

describe('song JSON import', () => {
  it('차트의 매핑/패턴 id 를 새 id 로 같이 바꿔 이벤트가 살아남는다', () => {
    const s = makeSong();
    const imported = importSongFromJson(exportSongToJson(s));
    expect(imported.id).not.toBe(s.id);
    expect(imported.chart!.patterns[0].hits[0].mappingId).not.toBe('m-a');
    expect(imported.beatsPerBar).toBe(6);
    expect(buildChartEvents(imported).length).toBe(buildChartEvents(s).length);
  });
});
