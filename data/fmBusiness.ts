import { Song, NotePreset, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function createFMBusinessSong(): Song {
  const songId = uuidv4();
  const defaultSceneId = uuidv4();
  
  const presetFolders: PresetFolder[] = [];

  // ===== PRESETS =====
  
  const intro1: NotePreset = {
    id: uuidv4(),
    name: 'Intro(1)',
    notes: [
      { id: uuidv4(), pitch: 44, velocity: 0.8, channel: 11, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const intro2: NotePreset = {
    id: uuidv4(),
    name: 'Intro(2)',
    notes: [
      { id: uuidv4(), pitch: 45, velocity: 0.8, channel: 11, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const noise: NotePreset = {
    id: uuidv4(),
    name: 'Noise',
    notes: [
      { id: uuidv4(), pitch: 46, velocity: 0.8, channel: 11, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const allPresets = [intro1, intro2, noise];

  // ===== MAPPINGS =====
  
  const mapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'q',
    midiValue: '40',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: intro1.id,
    isEnabled: true,
    scope: 'global'
  };

  const mapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'w',
    midiValue: '41',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: intro2.id,
    isEnabled: true,
    scope: 'global'
  };

  const mapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'e',
    midiValue: '42',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: noise.id,
    isEnabled: true,
    scope: 'global'
  };

  const mappings: InputMapping[] = [mapping1, mapping2, mapping3];

  // ===== SCENES =====
  const defaultScene: Scene = {
    id: defaultSceneId,
    name: 'Default Scene',
    mappingIds: []
  };

  return {
    id: songId,
    name: 'FM Business',
    bpm: 120,
    presets: allPresets,
    presetFolders,
    sequences: [],
    mappings,
    ccMappings: [],
    scenes: [defaultScene],
    activeSceneId: defaultSceneId
  };
}
