import { Song, NotePreset, Sequence, SequenceItem, SequenceMode, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Helper to convert note name to MIDI number
function noteNameToMidi(noteName: string): number {
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11, 'B#': 0
  };

  const match = noteName.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) return 60;

  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteValue = noteMap[note.charAt(0).toUpperCase() + note.slice(1)];
  if (noteValue === undefined) return 60;

  return (octave + 1) * 12 + noteValue;
}

// Zeitgeist song data from old project
// Original groups:
// - zeitgeistPiano: channel [1,1,1,1,1], 4 chord progressions
// - zeitgeistAh: channel [2,2], single chord
// - zeitInterlude: channel [3,3,3], 4 chord progressions  
// - zeitBreak: channel [4,4,4], 2 chord progressions

interface OldNoteSet {
  notes: string[];
  channels: number[];
  velocity: number;
}

// Convert old format note sets to presets
function createPresetsFromNotes(
  baseName: string,
  noteSets: OldNoteSet[],
  folderId: string
): NotePreset[] {
  return noteSets.map((noteSet, index) => ({
    id: uuidv4(),
    name: noteSets.length > 1 ? `${baseName} ${index + 1}` : baseName,
    folderId,
    notes: noteSet.notes.map((noteName, noteIndex) => ({
      id: uuidv4(),
      pitch: noteNameToMidi(noteName),
      velocity: noteSet.velocity,
      channel: noteSet.channels[noteIndex] || noteSet.channels[0] || 1,
      preDelay: 0,
      duration: null,
      durationUnit: 'ms' as const
    }))
  }));
}

// Create sequence from presets (STEP mode - step through on each trigger)
function createSequenceFromPresets(
  name: string,
  presets: NotePreset[],
  bpm: number = 120
): Sequence {
  return {
    id: uuidv4(),
    name,
    mode: SequenceMode.STEP,
    items: presets.map((preset, index) => ({
      id: uuidv4(),
      type: 'preset' as const,
      targetId: preset.id,
      beatPosition: index,
      sustainUntilNext: false
    })),
    bpm
  };
}

export function createZeitgeistSong(): Song {
  const songId = uuidv4();
  const sceneId = uuidv4();
  
  // Create folders
  const pianoFolderId = uuidv4();
  const ahFolderId = uuidv4();
  const interludeFolderId = uuidv4();
  const breakFolderId = uuidv4();
  const noiseFolderId = uuidv4();

  const presetFolders: PresetFolder[] = [
    { id: pianoFolderId, name: 'Piano (Main)' },
    { id: ahFolderId, name: 'Ah Pad' },
    { id: interludeFolderId, name: 'Interlude' },
    { id: breakFolderId, name: 'Break' },
    { id: noiseFolderId, name: 'Noise' }
  ];

  // Zeitgeist Piano - 4 chord progressions, 5 notes each, channel 1
  const pianoNoteSets: OldNoteSet[] = [
    { notes: ['E2', 'E3', 'G#3', 'E4', 'G#4'], channels: [1, 1, 1, 1, 1], velocity: 100 / 127 },
    { notes: ['D2', 'D3', 'G3', 'D4', 'G4'], channels: [1, 1, 1, 1, 1], velocity: 100 / 127 },
    { notes: ['Bb1', 'Bb2', 'E3', 'C#4', 'E4'], channels: [1, 1, 1, 1, 1], velocity: 100 / 127 },
    { notes: ['A1', 'A2', 'E3', 'C#4', 'E4'], channels: [1, 1, 1, 1, 1], velocity: 100 / 127 },
  ];

  // Zeitgeist Ah - single chord, channel 2
  const ahNoteSets: OldNoteSet[] = [
    { notes: ['E4', 'E5'], channels: [2, 2], velocity: 100 / 127 },
  ];

  // Zeitgeist Interlude - 4 chord progressions, channel 3
  const interludeNoteSets: OldNoteSet[] = [
    { notes: ['E3', 'G#3'], channels: [3, 3], velocity: 0.8 },
    { notes: ['D3', 'G3'], channels: [3, 3], velocity: 0.8 },
    { notes: ['Bb2', 'C#3', 'G3'], channels: [3, 3, 3], velocity: 0.8 },
    { notes: ['A2', 'C#3', 'G3'], channels: [3, 3, 3], velocity: 0.8 },
  ];

  // Zeitgeist Break - 2 chord progressions, channel 4
  const breakNoteSets: OldNoteSet[] = [
    { notes: ['C#4', 'E5', 'G5'], channels: [4, 4, 4], velocity: 0.8 },
    { notes: ['D4', 'D5', 'F#5'], channels: [4, 4, 4], velocity: 0.8 },
  ];

  // Create presets
  const pianoPresets = createPresetsFromNotes('Piano', pianoNoteSets, pianoFolderId);
  const ahPresets = createPresetsFromNotes('Ah', ahNoteSets, ahFolderId);
  const interludePresets = createPresetsFromNotes('Interlude', interludeNoteSets, interludeFolderId);
  const breakPresets = createPresetsFromNotes('Break', breakNoteSets, breakFolderId);

  // Global Noise Toggle - Channel 16, C2 (MIDI note 36)
  const globalNoisePreset: NotePreset = {
    id: uuidv4(),
    name: 'Global Noise Toggle',
    folderId: noiseFolderId,
    notes: [{
      id: uuidv4(),
      pitch: 36, // C2
      velocity: 100 / 127,
      channel: 16,
      preDelay: 0,
      duration: null, // sustained until released
      durationUnit: 'ms'
    }]
  };

  // Simple Noise - Channel 15, C3 (MIDI note 48), 200ms duration
  const simpleNoisePreset: NotePreset = {
    id: uuidv4(),
    name: 'Simple Noise',
    folderId: noiseFolderId,
    notes: [{
      id: uuidv4(),
      pitch: 48, // C3
      velocity: 100 / 127,
      channel: 15,
      preDelay: 0,
      duration: 200,
      durationUnit: 'ms'
    }]
  };

  const allPresets = [...pianoPresets, ...ahPresets, ...interludePresets, ...breakPresets, globalNoisePreset, simpleNoisePreset];

  // Create sequences
  const pianoSequence = createSequenceFromPresets('Piano Progression', pianoPresets);
  const ahSequence = createSequenceFromPresets('Ah Pad', ahPresets);
  const interludeSequence = createSequenceFromPresets('Interlude Progression', interludePresets);
  const breakSequence = createSequenceFromPresets('Break Progression', breakPresets);

  const sequences = [pianoSequence, ahSequence, interludeSequence, breakSequence];

  // Create mappings based on original conditions:
  // - Piano: noteLt: 55 (notes below 55)
  // - Break: noteLt: 60 (notes 55-59)
  // - Ah: noteGt: 70 (notes above 70)
  // - Interlude: default (notes 60-70)
  
  const pianoMappingId = uuidv4();
  const breakMappingId = uuidv4();
  const interludeMappingId = uuidv4();
  const ahMappingId = uuidv4();
  const noiseMappingId = uuidv4();
  const simpleNoiseMappingId = uuidv4();
  
  const mappings: InputMapping[] = [
    // Piano presets - individual keys instead of sequence
    {
      id: uuidv4(),
      keyboardValue: 'a', // Keyboard 'a' -> MIDI 48
      midiValue: '48',
      midiChannel: 1,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: pianoPresets[0].id, // First piano preset
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: uuidv4(),
      keyboardValue: 's', // Keyboard 's' -> MIDI 50
      midiValue: '50',
      midiChannel: 1,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: pianoPresets[1].id, // Second piano preset
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: uuidv4(),
      keyboardValue: 'd', // Keyboard 'd' -> MIDI 52
      midiValue: '52',
      midiChannel: 1,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: pianoPresets[2].id, // Third piano preset
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: uuidv4(),
      keyboardValue: 'f', // Keyboard 'f' -> MIDI 53
      midiValue: '53',
      midiChannel: 1,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: pianoPresets[3].id, // Fourth piano preset
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: breakMappingId,
      keyboardValue: 'g,h', // Keyboard shortcuts for break
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 55,
      midiRangeEnd: 59, // noteLt: 60
      actionType: 'sequence',
      actionTargetId: breakSequence.id,
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: interludeMappingId,
      keyboardValue: 'j,k,l,;', // Keyboard shortcuts for interlude
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 60,
      midiRangeEnd: 70, // default range
      actionType: 'sequence',
      actionTargetId: interludeSequence.id,
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: ahMappingId,
      keyboardValue: 'p', // Keyboard shortcut for Ah
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 71,
      midiRangeEnd: 127, // noteGt: 70
      actionType: 'sequence',
      actionTargetId: ahSequence.id,
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: noiseMappingId,
      keyboardValue: 'n', // Keyboard shortcut for noise toggle
      midiValue: '50,51', // Original pad notes for noise toggle (drum pad)
      midiChannel: 10, // Drum pad channel
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: globalNoisePreset.id,
      isEnabled: true,
      scope: 'scene'
    },
    {
      id: simpleNoiseMappingId,
      keyboardValue: 'm', // Keyboard shortcut for simple noise
      midiValue: '49', // Original pad note for simple noise (drum pad)
      midiChannel: 10, // Drum pad channel
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: simpleNoisePreset.id,
      isEnabled: true,
      scope: 'scene'
    }
  ];

  const scene: Scene = {
    id: sceneId,
    name: 'Main',
    mappingIds: mappings.map(m => m.id)
  };

  return {
    id: songId,
    name: 'Zeitgeist',
    bpm: 120,
    presets: allPresets,
    presetFolders,
    sequences,
    mappings,
    ccMappings: [],
    scenes: [scene],
    activeSceneId: sceneId
  };
}
