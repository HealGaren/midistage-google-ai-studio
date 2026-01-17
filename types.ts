
export type MidiNoteNumber = number; // 0-127

export interface NoteItem {
  id: string;
  pitch: MidiNoteNumber;
  velocity: number; // 0-1
  channel: number; // 1-16
  preDelay: number; // ms
  duration: number | null; // ms, null means play until release
}

export interface NotePreset {
  id: string;
  name: string;
  notes: NoteItem[];
}

export type SequenceItemType = 'note' | 'preset' | 'sequence';

export interface SequenceItem {
  id: string;
  type: SequenceItemType;
  targetId: string; // Refers to NoteItem, Preset ID, or Sequence ID
  delay: number; // ms
}

export enum SequenceMode {
  AUTO = 'AUTO',
  STEP = 'STEP'
}

export interface Sequence {
  id: string;
  name: string;
  mode: SequenceMode;
  items: SequenceItem[];
  bpm?: number;
}

export type TriggerType = 'midi' | 'keyboard';

export interface InputMapping {
  id: string;
  triggerType: TriggerType;
  isRange: boolean;
  triggerValue: string | number; // Single value
  triggerStart?: string | number; // Range start
  triggerEnd?: string | number;   // Range end
  actionType: 'preset' | 'sequence';
  actionTargetId: string;
  isEnabled: boolean; // Toggle mapping on/off
}

export interface Song {
  id: string;
  name: string;
  bpm: number;
  presets: NotePreset[];
  sequences: Sequence[];
  mappings: InputMapping[];
}

export interface ProjectData {
  name: string;
  songs: Song[];
  selectedInputId: string;
  selectedOutputId: string;
}

export interface ActiveNoteState {
  pitch: number;
  channel: number;
  startTime: number;
  duration: number | null;
}
