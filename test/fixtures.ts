import { Song, SongChart, InputMapping, SequenceMode } from '../types';
import { DEFAULT_CHART_SETTINGS, beatMs } from '../utils/chart';

/** 6/8, 67bpm. 매핑 2개: 'a' = 코드 프리셋, 'j' = 6스텝 STEP 시퀀스. 패턴 1마디: a@0(6박), j@0..5 */
export function makeSong(over: Partial<Song> = {}): Song {
  const presetId = 'p-chord', seqId = 'seq-rh';
  const mappings: InputMapping[] = [
    { id: 'm-a', keyboardValue: 'a', midiValue: '48', midiChannel: 1, isMidiRange: false, midiRangeStart: 0, midiRangeEnd: 0, actionType: 'preset', actionTargetId: presetId, isEnabled: true, scope: 'scene' },
    { id: 'm-j', keyboardValue: 'j,k,l,;', midiValue: '60,62,64,65,67,69,71,72', midiChannel: 1, isMidiRange: false, midiRangeStart: 0, midiRangeEnd: 0, actionType: 'sequence', actionTargetId: seqId, isEnabled: true, scope: 'scene' },
  ];
  const chart: SongChart = {
    patterns: [{ id: 'pat', name: 'bar', bars: 1, hits: [
      { mappingId: 'm-a', beat: 0, durationBeats: 6 },
      ...[0, 1, 2, 3, 4, 5].map(b => ({ mappingId: 'm-j', beat: b })),
    ] }],
    sections: [{ id: 's1', name: 'A', bars: 2, patternId: 'pat' }, { id: 's2', name: 'B', bars: 2, patternId: 'pat' }],
    lyrics: [], settings: {}, takes: [],
  };
  return {
    id: 'song', name: 'T', bpm: 67, beatsPerBar: 6, beatUnit: 8,
    presets: [{ id: presetId, name: 'Db', folderId: null, notes: [{ id: 'n1', pitch: 61, velocity: 0.7, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }] }],
    presetFolders: [],
    sequences: [{ id: seqId, name: 'RH', mode: SequenceMode.STEP, bpm: 67, gridSnap: 0.5, items: [80, 82, 80, 84, 82, 80].map((p, i) => ({ id: `it${i}`, type: 'note', beatPosition: i * 0.5, sustainUntilNext: true, noteData: { pitch: p, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' } })) }],
    mappings, ccMappings: [],
    scenes: [{ id: 'sc', name: 'Main', mappingIds: mappings.map(m => m.id) }], activeSceneId: 'sc',
    chart, ...over,
  };
}

export const BEAT_MS = beatMs(67, 8); // 6/8 한 박(8분음표) ≈ 447.8ms — 코어와 같은 함수
export const settings: Readonly<typeof DEFAULT_CHART_SETTINGS> = Object.freeze({ ...DEFAULT_CHART_SETTINGS });

/** 가짜 시계 */
export function fakeClock(start = 1000) {
  let t = start;
  return { now: () => t, advance: (ms: number) => { t += ms; }, set: (ms: number) => { t = ms; } };
}
