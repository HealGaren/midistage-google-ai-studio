import { Song, SongChart, ChartSettings, ChartSection, ChartPattern, LyricLine, SequenceMode, InputMapping } from '../types';
import { v4 as uuidv4 } from 'uuid';

// ─────────────────────────────────────────────────────────────────────────────
// Game 모드 차트 유틸. 차트는 "섹션 × 패턴" 으로 적혀 있고, 여기서 실제로 화면에
// 떨어뜨릴 이벤트 목록(절대 beat)으로 펼친다. 렌더러와 지휘자(useConductor)는
// 펼쳐진 ChartEvent 만 본다.
// ─────────────────────────────────────────────────────────────────────────────

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  earlyWindowBeats: 1,
  lateWindowBeats: 0.5,
  tempoFollow: 'gentle',
  holdForNotes: true,
  lookaheadBars: 2,
  layout: 'device',
  showInnerNotes: true,
  driveSequenceSteps: true,
};

export function chartSettings(song: Song): ChartSettings {
  return { ...DEFAULT_CHART_SETTINGS, ...(song.chart?.settings || {}) };
}

export function emptyChart(): SongChart {
  return { sections: [], patterns: [], lyrics: [], settings: {}, takes: [] };
}

/** 한 박의 길이(ms). Song.bpm 은 4분음표 기준이라 8분음표 박이면 절반. */
export function beatMs(bpm: number, beatUnit: number): number {
  return (60000 / (bpm || 120)) * (4 / (beatUnit || 4));
}

export interface SectionSpan {
  section: ChartSection;
  index: number;
  startBar: number;   // 0-based
  startBeat: number;
  endBeat: number;    // exclusive
}

export function sectionSpans(song: Song): SectionSpan[] {
  const bpb = song.beatsPerBar || 4;
  const out: SectionSpan[] = [];
  let bar = 0;
  (song.chart?.sections || []).forEach((section, index) => {
    const startBeat = bar * bpb;
    out.push({ section, index, startBar: bar, startBeat, endBeat: startBeat + section.bars * bpb });
    bar += section.bars;
  });
  return out;
}

export function totalBars(song: Song): number {
  return (song.chart?.sections || []).reduce((a, s) => a + s.bars, 0);
}

export function totalBeats(song: Song): number {
  return totalBars(song) * (song.beatsPerBar || 4);
}

export function sectionAtBeat(spans: SectionSpan[], beat: number): SectionSpan | undefined {
  for (let i = spans.length - 1; i >= 0; i--) {
    if (beat >= spans[i].startBeat) return spans[i];
  }
  return spans[0];
}

// ───────────────────────── 펼쳐진 이벤트 ─────────────────────────

export interface ChartEvent {
  id: string;            // 안정적인 id: `${sectionId}:${rep}:${hitIndex}`
  beat: number;          // 절대 beat
  mappingId: string;
  durationBeats: number; // 0 = 짧은 노트
  sectionIndex: number;
  /** 이 매핑이 시퀀스를 치는 경우, 이 노트가 시퀀스의 몇 번째 스텝인지(0-based, 길이로 나눈 나머지) */
  stepIndex?: number;
  /** stepIndex 가 가리키는 시퀀스 id */
  sequenceId?: string;
}

/**
 * 차트를 절대 beat 이벤트 목록으로 펼친다. beat → 매핑 순으로 정렬.
 *
 * stepIndex: 같은 시퀀스를 치는 이벤트를 곡 처음부터 센다. 곡을 "리셋 상태에서
 * 차트대로" 연주하면 엔진의 스텝 인덱스와 일치한다. 지휘자는 히트/탐색 때 이 값으로
 * 엔진 인덱스를 맞춰 준다 (놓친 노트가 있어도 다음 노트에서 맞는 음이 나오도록).
 */
export function buildChartEvents(song: Song): ChartEvent[] {
  const chart = song.chart;
  if (!chart) return [];
  const bpb = song.beatsPerBar || 4;
  const patterns = new Map(chart.patterns.map(p => [p.id, p]));
  const mappingById = new Map(song.mappings.map(m => [m.id, m]));
  const events: ChartEvent[] = [];

  let bar = 0;
  chart.sections.forEach((section, sectionIndex) => {
    const pattern = section.patternId ? patterns.get(section.patternId) : undefined;
    const sectionStart = bar * bpb;
    if (pattern && pattern.bars > 0 && pattern.hits.length) {
      const patternBeats = pattern.bars * bpb;
      const sectionBeats = section.bars * bpb;
      const reps = Math.ceil(section.bars / pattern.bars);
      for (let rep = 0; rep < reps; rep++) {
        const repStart = rep * patternBeats;
        pattern.hits.forEach((hit, hitIndex) => {
          const local = repStart + hit.beat;
          if (local >= sectionBeats) return; // 섹션이 패턴 길이로 안 나눠떨어질 때 잘라냄
          if (!mappingById.has(hit.mappingId)) return; // 지워진 매핑
          events.push({
            id: `${section.id}:${rep}:${hitIndex}`,
            beat: sectionStart + local,
            mappingId: hit.mappingId,
            durationBeats: hit.durationBeats || 0,
            sectionIndex,
          });
        });
      }
    }
    bar += section.bars;
  });

  // 안정 정렬: beat → 매핑 순서(song.mappings 순)
  const laneOrder = new Map(song.mappings.map((m, i) => [m.id, i]));
  events.sort((a, b) => (a.beat - b.beat) || ((laneOrder.get(a.mappingId) ?? 0) - (laneOrder.get(b.mappingId) ?? 0)));

  // 시퀀스 스텝 인덱스
  const counters = new Map<string, number>();
  const seqById = new Map(song.sequences.map(s => [s.id, s]));
  for (const ev of events) {
    const m = mappingById.get(ev.mappingId);
    if (!m || m.actionType !== 'sequence') continue;
    const seq = seqById.get(m.actionTargetId);
    if (!seq) continue;
    // GROUP 모드에서 하위 시퀀스를 품은 경우는 인덱스 구조가 달라 건너뛴다
    if (seq.mode === SequenceMode.GROUP && seq.items.some(it => it.type === 'sequence')) continue;
    if (seq.mode === SequenceMode.AUTO) continue;
    const n = counters.get(seq.id) || 0;
    ev.stepIndex = seq.items.length ? n % seq.items.length : 0;
    ev.sequenceId = seq.id;
    counters.set(seq.id, n + 1);
  }
  return events;
}

/** 이벤트가 하나라도 있는 매핑들을 song.mappings 순서로 */
export function chartLaneMappings(song: Song, events: ChartEvent[]): InputMapping[] {
  const used = new Set(events.map(e => e.mappingId));
  return song.mappings.filter(m => used.has(m.id));
}

// ───────────────────────── 가사 텍스트 ⇄ 구조 ─────────────────────────
// 편집은 텍스트로 한다. 한 줄 = `@<마디>[.<박>] 가사`. 마디/박은 1-based.
//   @9 첫 줄
//   @9.4 둘째 줄(9마디 4박째)
// @ 없는 줄은 직전 줄 다음 마디로 흘려 넣는다.

export function parseLyrics(text: string, beatsPerBar: number, existing: LyricLine[] = []): LyricLine[] {
  const prevIds = existing.map(l => l.id);
  const lines: LyricLine[] = [];
  let lastBar = 0; // 0-based
  text.split(/\r?\n/).forEach(raw => {
    const line = raw.trim();
    if (!line) return;
    const m = line.match(/^@(\d+)(?:\.(\d+(?:\.\d+)?))?\s*(.*)$/);
    let beat: number;
    let body: string;
    if (m) {
      const bar = Math.max(1, parseInt(m[1], 10)) - 1;
      const b = m[2] ? Math.max(1, parseFloat(m[2])) - 1 : 0;
      beat = bar * beatsPerBar + b;
      lastBar = bar;
      body = m[3];
    } else {
      lastBar += 1;
      beat = lastBar * beatsPerBar;
      body = line;
    }
    lines.push({ id: prevIds[lines.length] || uuidv4(), beat, text: body });
  });
  return lines.sort((a, b) => a.beat - b.beat);
}

export function serializeLyrics(lyrics: LyricLine[], beatsPerBar: number): string {
  return [...lyrics].sort((a, b) => a.beat - b.beat).map(l => {
    const bar = Math.floor(l.beat / beatsPerBar) + 1;
    const beatIn = l.beat - (bar - 1) * beatsPerBar;
    const tag = beatIn > 0.0001 ? `@${bar}.${+(beatIn + 1).toFixed(2)}` : `@${bar}`;
    return `${tag} ${l.text}`;
  }).join('\n');
}

// ───────────────────────── 패턴 편집 보조 ─────────────────────────

export function newPattern(name = 'Pattern', bars = 1): ChartPattern {
  return { id: uuidv4(), name, bars, hits: [] };
}

export function newSection(name = 'Section', bars = 4, patternId: string | null = null): ChartSection {
  return { id: uuidv4(), name, bars, patternId };
}

export const SECTION_COLORS = ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#ef4444', '#84cc16'];

export function sectionColor(section: ChartSection, index: number): string {
  return section.color || SECTION_COLORS[index % SECTION_COLORS.length];
}

/** 매핑별 레인 색 (song.mappings 순서 기준) */
export const LANE_COLORS = ['#38bdf8', '#f472b6', '#34d399', '#fbbf24', '#a78bfa', '#fb7185', '#2dd4bf', '#c084fc', '#f97316', '#4ade80', '#60a5fa', '#e879f9'];

export function laneColor(song: Song, mappingId: string): string {
  const idx = song.mappings.findIndex(m => m.id === mappingId);
  return LANE_COLORS[(idx < 0 ? 0 : idx) % LANE_COLORS.length];
}

/** 매핑 이름: 액션 대상의 이름 */
export function mappingTargetName(song: Song, m: InputMapping): string {
  if (m.actionType === 'preset' || m.actionType === 'toggle_preset') return song.presets.find(p => p.id === m.actionTargetId)?.name || '?';
  if (m.actionType === 'sequence') return song.sequences.find(s => s.id === m.actionTargetId)?.name || '?';
  return song.scenes.find(s => s.id === m.actionTargetId)?.name || '?';
}

/** 매핑이 받는 MIDI 노트 목록 (범위면 펼침) */
export function mappingMidiNotes(m: InputMapping): number[] {
  if (m.isMidiRange) {
    const out: number[] = [];
    for (let n = m.midiRangeStart; n <= m.midiRangeEnd; n++) out.push(n);
    return out;
  }
  return String(m.midiValue || '').split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
}

export function mappingKeys(m: InputMapping): string[] {
  return String(m.keyboardValue || '').split(',').map(s => s.trim()).filter(Boolean);
}

/**
 * 이 노트를 눌렀을 때 실제로 울리는 음들(표시용). 시퀀스 스텝이면 그 스텝의 음,
 * 프리셋이면 프리셋의 음. 길이는 ms→beat 로 환산(null 은 "누르는 동안" → 0).
 */
export function innerNotesOf(song: Song, ev: ChartEvent): { pitch: number; durationBeats: number }[] {
  const m = song.mappings.find(x => x.id === ev.mappingId);
  if (!m) return [];
  const bpb = beatMs(song.bpm, song.beatUnit || 4);
  const toBeats = (dur: number | null | undefined, unit: 'ms' | 'beat' | undefined) => {
    if (dur == null) return 0;
    if (unit === 'beat') return dur * (4 / (song.beatUnit || 4)); // 'beat' 단위는 4분음표 기준
    return dur / bpb;
  };
  if (m.actionType === 'preset' || m.actionType === 'toggle_preset') {
    const p = song.presets.find(x => x.id === m.actionTargetId);
    return (p?.notes || []).map(n => ({ pitch: n.pitch, durationBeats: toBeats(n.duration, n.durationUnit) }));
  }
  if (m.actionType === 'sequence' && ev.stepIndex !== undefined) {
    const seq = song.sequences.find(x => x.id === m.actionTargetId);
    const item = seq?.items[ev.stepIndex];
    if (!item) return [];
    if (item.type === 'note' && item.noteData) {
      const d = item.overrideDuration !== undefined ? item.overrideDuration : item.noteData.duration;
      const u = item.overrideDuration !== undefined ? item.overrideDurationUnit : item.noteData.durationUnit;
      return [{ pitch: item.noteData.pitch, durationBeats: toBeats(d, u) }];
    }
    if (item.type === 'preset') {
      const p = song.presets.find(x => x.id === item.targetId);
      return (p?.notes || []).map(n => {
        const d = item.overrideDuration !== undefined ? item.overrideDuration : n.duration;
        const u = item.overrideDuration !== undefined ? item.overrideDurationUnit : n.durationUnit;
        return { pitch: n.pitch, durationBeats: toBeats(d, u) };
      });
    }
  }
  return [];
}

export const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
export function noteName(midi: number): string {
  return `${NOTE_NAMES[midi % 12]}${Math.floor(midi / 12) - 1}`;
}
