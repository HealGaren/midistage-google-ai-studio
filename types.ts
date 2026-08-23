
export type MidiNoteNumber = number; // 0-127

export type DurationUnit = 'ms' | 'beat';

export type GlissandoMode = 'white' | 'black' | 'both';

export interface GlissandoConfig {
  attackEnabled: boolean;
  releaseEnabled: boolean;
  lowestNote: number;
  targetNote: number;
  speed: number; // ms per note step
  mode: GlissandoMode;
  lowestVelocity: number;
  targetVelocity: number;
}

export interface NoteItem {
  id: string;
  pitch: MidiNoteNumber;
  velocity: number; // 0-1
  channel: number; // 1-16
  preDelay: number; // ms
  duration: number | null; // value in durationUnit, null means play until release
  durationUnit: DurationUnit;
}

export interface NotePreset {
  id: string;
  name: string;
  notes: NoteItem[];
  glissando?: GlissandoConfig;
  folderId?: string | null;
}

export interface PresetFolder {
  id: string;
  name: string;
}

export type SequenceItemType = 'preset' | 'note' | 'sequence';

export interface SequenceItem {
  id: string;
  type: SequenceItemType;
  targetId?: string; // Preset ID or Sequence ID
  noteData?: Omit<NoteItem, 'id'>; // Direct note data
  beatPosition: number; // Position in beats from the start
  overrideDuration?: number | null;
  overrideDurationUnit?: DurationUnit;
  sustainUntilNext?: boolean;
}

export enum SequenceMode {
  AUTO = 'AUTO',
  STEP = 'STEP',
  GROUP = 'GROUP'
}

export interface Sequence {
  id: string;
  name: string;
  mode: SequenceMode;
  items: SequenceItem[];
  bpm?: number;
  gridSnap?: number;
}

export type TriggerType = 'midi' | 'keyboard';
export type MappingScope = 'global' | 'scene';

export interface InputMapping {
  id: string;
  // Keyboard settings
  keyboardValue: string; // comma separated keys, e.g. "j,k"
  
  // MIDI settings
  midiValue: string; // comma separated notes, e.g. "60,62"
  midiChannel: number; // 0 for Omni, 1-16
  isMidiRange: boolean;
  midiRangeStart: number;
  midiRangeEnd: number;

  actionType: 'preset' | 'sequence' | 'switch_scene' | 'toggle_preset';
  actionTargetId: string;
  isEnabled: boolean;
  scope: MappingScope;
}

export type GlobalActionType =
  | 'RESET_SEQUENCES' | 'PREV_SONG' | 'NEXT_SONG' | 'GOTO_SONG'
  // ── Game 모드(차트) 조작. 키보드/패드에 물려 실연주 중에 싱크를 잡는다 ──
  | 'CHART_SYNC_BAR'      // 탭 = 가장 가까운 마디 첫 박으로 위치를 맞춤(탭 템포처럼 템포도 추정)
  | 'CHART_SYNC_BEAT'     // 탭 = 가장 가까운 박으로 위치를 맞춤
  | 'CHART_NEXT_NOTE'     // 대기 중인 다음 노트를 건너뜀(놓친 것으로 처리하고 전진)
  | 'CHART_PREV_NOTE'     // 직전 노트로 되돌아감(다시 대기 상태로)
  | 'CHART_NEXT_BAR' | 'CHART_PREV_BAR'
  | 'CHART_NEXT_SECTION' | 'CHART_PREV_SECTION'
  | 'CHART_TOGGLE_RUN'    // 진행/정지
  | 'CHART_RESTART';      // 곡 처음으로

export interface GlobalMapping {
  id: string;
  keyboardValue: string;
  midiValue: string; // comma separated notes
  midiChannel: number; // 0 for Omni, 1-16
  actionType: GlobalActionType;
  actionValue?: number;
  isEnabled: boolean;
}

export interface Scene {
  id: string;
  name: string;
  mappingIds: string[]; // List of local mapping IDs active in this scene
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  presets: NotePreset[];
  presetFolders: PresetFolder[];
  sequences: Sequence[];
  mappings: InputMapping[];
  ccMappings: CCMapping[];
  scenes: Scene[];
  activeSceneId: string;
  // 박자표. 박자 LED 의 개수와 강박 위치를 정한다. 없으면 4/4로 본다.
  // 예) 콰지모도 = 6박(6/8) → beatsPerBar 6, beatUnit 8
  beatsPerBar?: number;
  beatUnit?: number;
  // Game 모드용 연주 차트(송폼·노트·가사·연습 음원). 없으면 Game 탭은 매핑만 보여준다.
  chart?: SongChart;
}

// ───────────────────────── Game 모드 차트 ─────────────────────────
// "beat" 는 곡의 박자표 한 박(6/8 이면 8분음표)이다. 곡 시작이 0.
// 마디 안 위치도 같은 단위라 6/8 의 2마디 3박째 = beat 6+2 = 8 (0-based).

/** 패턴 안의 한 타점. beat 는 패턴 시작 기준. */
export interface ChartHit {
  mappingId: string;       // 어느 매핑(=어느 키)을 눌러야 하는지
  beat: number;            // 패턴 내 위치
  durationBeats?: number;  // 누르고 있어야 하는 길이(표시용). 없으면 짧은 노트
}

/** 몇 마디짜리 반복 단위. 섹션이 이 패턴을 자기 길이만큼 반복한다. */
export interface ChartPattern {
  id: string;
  name: string;
  bars: number;
  hits: ChartHit[];
}

/** 송폼 한 구간. 순서대로 이어 붙인다(시작 마디는 누적으로 계산). */
export interface ChartSection {
  id: string;
  name: string;
  bars: number;
  patternId: string | null;  // null = 건반이 쉬는 구간(보컬만 등)
  color?: string;
}

/** 가사 한 줄. beat 는 곡 시작 기준 절대 위치(소수 허용 — 마디와 안 맞아도 됨). */
export interface LyricLine {
  id: string;
  beat: number;
  text: string;
}

/** 연습용 원곡 음원. 곡 0박이 음원의 offsetMs 에 있다고 본다. */
export interface ChartAudio {
  fileName?: string;   // projects/audio/ 안의 파일명 (dev 서버 API 로 올림)
  offsetMs: number;
  bpm?: number;        // 음원 템포가 곡 BPM 과 다를 때만
}

export interface ChartSettings {
  /** 이만큼 먼저 눌러도 그 노트로 인정(박 단위) */
  earlyWindowBeats: number;
  /** 음원 모드에서 이만큼 지나면 놓친 것으로 처리(박 단위) */
  lateWindowBeats: number;
  /** 연주 템포 추정을 얼마나 따라갈지 */
  tempoFollow: 'off' | 'gentle' | 'tight';
  /** 노트에 도달하면 누를 때까지 멈춰 기다림 (끄면 지나감) */
  holdForNotes: boolean;
  /** 화면에 미리 보여줄 길이(마디) */
  lookaheadBars: number;
  /** 레인 배치: 런치키 건반/패드 · 컴퓨터 키보드(QWERTY) · 매핑별 세로 레인 */
  layout: 'device' | 'keyboard' | 'lanes';
  /** 노트 안에 자동 연주되는 음(프리셋/스텝의 실제 음)을 같이 표시 */
  showInnerNotes: boolean;
  /** 차트가 시퀀스의 스텝 인덱스를 맞춘다(놓침/점프 후 복구). 끄면 엔진이 자기 순서대로만 진행 */
  driveSequenceSteps: boolean;
}

/** 녹화한 연주 한 테이크. t 는 녹화 시작 기준 ms. */
export interface ChartTakeEvent {
  t: number;
  mappingId: string;
  release: boolean;
  value: string | number;
}
export interface ChartTake {
  id: string;
  name: string;
  createdAt: number;
  startBeat: number;
  events: ChartTakeEvent[];
}

export interface SongChart {
  sections: ChartSection[];
  patterns: ChartPattern[];
  lyrics: LyricLine[];
  audio?: ChartAudio;
  settings?: Partial<ChartSettings>;
  takes?: ChartTake[];
}

export interface ProjectData {
  name: string;
  songs: Song[];
  selectedInputId: string;
  selectedOutputId: string;
  // DAW 가 보내는 MIDI 클럭을 듣고 현재 템포를 표시하기 위한 입력. 표시 전용이라 없어도 된다.
  selectedClockInputId?: string;
  globalMappings: GlobalMapping[];
  globalCCMappings: CCMapping[];
}

export interface ActiveNoteState {
  pitch: number;
  channel: number;
  startTime: number;
  durationMs: number | null;
}

// CC Mapping types
export interface CCMapping {
  id: string;
  name: string;
  inputChannel: number; // 0 for Omni, 1-16
  inputCC: number; // 0-127
  
  // Output settings
  outputChannel: number; // 1-16
  outputCC: number; // 0-127
  
  // Processors (each can be enabled/disabled)
  rangeEnabled: boolean;
  rangeMin: number; // 0-127
  rangeMax: number; // 0-127
  
  curveEnabled: boolean;
  curveValue: number; // 0-1, where 0.5 is linear
  
  outputRemapEnabled: boolean; // if false, use input channel/cc
  
  isEnabled: boolean;
  scope: MappingScope;
}

export interface CCState {
  channel: number;
  cc: number;
  value: number;
}
