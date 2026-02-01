
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

  actionType: 'preset' | 'sequence' | 'switch_scene';
  actionTargetId: string;
  isEnabled: boolean;
  scope: MappingScope;
}

export type GlobalActionType = 'RESET_SEQUENCES' | 'PREV_SONG' | 'NEXT_SONG' | 'GOTO_SONG';

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
}

export interface ProjectData {
  name: string;
  songs: Song[];
  selectedInputId: string;
  selectedOutputId: string;
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
