
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
  folderId?: string | null; // 폴더 소속 ID
}

export interface PresetFolder {
  id: string;
  name: string;
}

export type SequenceItemType = 'preset' | 'note';

export interface SequenceItem {
  id: string;
  type: SequenceItemType;
  targetId?: string; // Preset ID
  noteData?: Omit<NoteItem, 'id'>; // Direct note data
  beatPosition: number; // Position in beats from the start (0, 0.5, 1, 1.25 etc)
  overrideDuration?: number | null; // value in overrideDurationUnit
  overrideDurationUnit?: DurationUnit;
}

export enum SequenceMode {
  AUTO = 'AUTO',
  STEP = 'STEP'
}

export interface Sequence {
  id: string;
  name: string;
  mode: SequenceMode;
  items: SequenceItem[]; // Unified items for both modes
  bpm?: number; // Sequence specific BPM override
  gridSnap?: number; // Snap division (0.25 = 16th note, 0.5 = 8th note, etc)
}

export type TriggerType = 'midi' | 'keyboard';

export interface InputMapping {
  id: string;
  triggerType: TriggerType;
  isRange: boolean;
  triggerValue: string | number;
  triggerChannel: number; // 0 for Omni, 1-16 for specific
  triggerStart?: string | number;
  triggerEnd?: string | number;
  actionType: 'preset' | 'sequence';
  actionTargetId: string;
  isEnabled: boolean;
}

export type GlobalActionType = 'RESET_SEQUENCES' | 'PREV_SONG' | 'NEXT_SONG' | 'GOTO_SONG';

export interface GlobalMapping {
  id: string;
  triggerType: TriggerType;
  triggerValue: string | number;
  triggerChannel: number; // 0 for Omni, 1-16 for specific
  actionType: GlobalActionType;
  actionValue?: number; // Index for GOTO_SONG
  isEnabled: boolean;
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  presets: NotePreset[];
  presetFolders: PresetFolder[];
  sequences: Sequence[];
  mappings: InputMapping[];
}

export interface ProjectData {
  name: string;
  songs: Song[];
  selectedInputId: string;
  selectedOutputId: string;
  globalMappings: GlobalMapping[];
}

export interface ActiveNoteState {
  pitch: number;
  channel: number;
  startTime: number;
  durationMs: number | null;
}
