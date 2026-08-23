import { describe, it, expect } from 'vitest';
import { buildChartEvents, parseLyrics, serializeLyrics, innerNotesOf, chartLaneMappings } from './chart';
import { makeSong } from '../test/fixtures';

describe('buildChartEvents', () => {
  it('섹션 × 패턴을 절대 박으로 펼치고 beat 순 정렬한다', () => {
    const ev = buildChartEvents(makeSong());
    expect(ev.length).toBe(4 * 7);                      // 4마디 × (a 1 + j 6)
    expect(ev[0].beat).toBe(0); expect(ev.at(-1)!.beat).toBe(23);
    expect(ev.every((e, i) => i === 0 || ev[i - 1].beat <= e.beat)).toBe(true);
  });
  it('시퀀스 레인은 곡 처음부터 센 stepIndex 를 갖는다(길이로 순환)', () => {
    const ev = buildChartEvents(makeSong()).filter(e => e.mappingId === 'm-j');
    expect(ev.map(e => e.stepIndex)).toEqual([0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5, 0, 1, 2, 3, 4, 5]);
    expect(ev[0].sequenceId).toBe('seq-rh');
  });
  it('패턴 길이로 안 나눠떨어지는 섹션은 잘라내고, 지워진 매핑은 버린다', () => {
    const s = makeSong();
    s.chart!.sections = [{ id: 'x', name: 'x', bars: 1, patternId: 'pat' }];
    s.chart!.patterns[0].bars = 2;
    s.chart!.patterns[0].hits.push({ mappingId: 'gone', beat: 0 }, { mappingId: 'm-a', beat: 6 });
    const ev = buildChartEvents(s);
    expect(ev.every(e => e.beat < 6)).toBe(true);
    expect(ev.some(e => e.mappingId === 'gone')).toBe(false);
  });
  it('chartLaneMappings 는 이벤트가 있는 매핑만 song 순서로', () => {
    const s = makeSong();
    expect(chartLaneMappings(s, buildChartEvents(s)).map(m => m.id)).toEqual(['m-a', 'm-j']);
  });
});

describe('lyrics', () => {
  it('@마디.박 파싱 / @ 없는 줄은 다음 마디 / 직렬화 왕복', () => {
    const l = parseLyrics('@9 첫 줄\n@9.4 둘째\n셋째', 6);
    expect(l.map(x => x.beat)).toEqual([48, 51, 54]);
    expect(serializeLyrics(l, 6)).toBe('@9 첫 줄\n@9.4 둘째\n@10 셋째');
    expect(parseLyrics(serializeLyrics(l, 6), 6, l).map(x => x.id)).toEqual(l.map(x => x.id)); // id 유지
  });
});

describe('innerNotesOf', () => {
  it('시퀀스 스텝의 실제 음과 프리셋의 음을 돌려준다', () => {
    const s = makeSong();
    const ev = buildChartEvents(s);
    expect(innerNotesOf(s, ev.find(e => e.mappingId === 'm-j' && e.stepIndex === 3)!)[0].pitch).toBe(84);
    expect(innerNotesOf(s, ev.find(e => e.mappingId === 'm-a')!)[0].pitch).toBe(61);
  });
});
