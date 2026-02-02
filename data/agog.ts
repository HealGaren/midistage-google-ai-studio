import { Song, NotePreset, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function createAgogSong(): Song {
  const songId = uuidv4();
  const defaultSceneId = uuidv4();
  
  const presetFolders: PresetFolder[] = [];

  // ===== PRESETS =====
  
  const wahPreset: NotePreset = {
    id: uuidv4(),
    name: 'WAH',
    notes: [
      { id: uuidv4(), pitch: 40, velocity: 0.8, channel: 11, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const allPresets = [wahPreset];

  // ===== MAPPINGS =====
  
  const wahMapping: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'z',
    midiValue: '40',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: wahPreset.id,
    isEnabled: true,
    scope: 'global'
  };

  const mappings: InputMapping[] = [wahMapping];

  // ===== SCENES =====
  const defaultScene: Scene = {
    id: defaultSceneId,
    name: 'Default Scene',
    mappingIds: []
  };

  return {
    id: songId,
    name: 'Agog',
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
