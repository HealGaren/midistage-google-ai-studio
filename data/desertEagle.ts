import { Song, NotePreset, Sequence, SequenceMode, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function createDesertEagleSong(): Song {
  const songId = uuidv4();
  
  const presetFolders: PresetFolder[] = [];

  // ===== PRESETS =====
  
  // Intro(2)
  const intro2Preset: NotePreset = {
    id: uuidv4(),
    name: 'Intro(2)',
    notes: [
      { id: uuidv4(), pitch: 69, velocity: 0.5, channel: 1, preDelay: 0, duration: 200, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 72, velocity: 0.7, channel: 1, preDelay: 300, duration: 250, durationUnit: 'ms' }
    ]
  };

  // Intro Sample (empty notes)
  const introSamplePreset: NotePreset = {
    id: uuidv4(),
    name: 'Intro Sample',
    notes: []
  };

  // Verse Chords
  const verseChord1: NotePreset = {
    id: uuidv4(),
    name: 'Verse Chord 1',
    notes: [
      { id: uuidv4(), pitch: 69, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 74, velocity: 0.7, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseChord2: NotePreset = {
    id: uuidv4(),
    name: 'Verse Chord 2',
    notes: [
      { id: uuidv4(), pitch: 71, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 76, velocity: 0.7, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseChord3: NotePreset = {
    id: uuidv4(),
    name: 'Verse Chord 3',
    notes: [
      { id: uuidv4(), pitch: 69, velocity: 0.7, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 72, velocity: 0.7, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // Verse Synth Bass 1-4 and 3-2
  const verseSynthBass1: NotePreset = {
    id: uuidv4(),
    name: 'Verse Synth Bass 1',
    notes: [
      { id: uuidv4(), pitch: 46, velocity: 0.8, channel: 3, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 58, velocity: 0.4, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 65, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 69, velocity: 0.8, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseSynthBass2: NotePreset = {
    id: uuidv4(),
    name: 'Verse Synth Bass 2',
    notes: [
      { id: uuidv4(), pitch: 45, velocity: 0.8, channel: 3, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 57, velocity: 0.4, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 65, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 67, velocity: 0.8, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseSynthBass3: NotePreset = {
    id: uuidv4(),
    name: 'Verse Synth Bass 3',
    notes: [
      { id: uuidv4(), pitch: 51, velocity: 0.8, channel: 3, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 63, velocity: 0.4, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 67, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 70, velocity: 0.8, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseSynthBass4: NotePreset = {
    id: uuidv4(),
    name: 'Verse Synth Bass 4',
    notes: [
      { id: uuidv4(), pitch: 50, velocity: 0.8, channel: 3, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 62, velocity: 0.4, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 67, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 69, velocity: 0.8, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseSynthBass3_2: NotePreset = {
    id: uuidv4(),
    name: 'Verse Synth Bass 3-2',
    notes: [
      { id: uuidv4(), pitch: 48, velocity: 0.8, channel: 3, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 60, velocity: 0.4, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 70, velocity: 0.6, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 72, velocity: 0.8, channel: 2, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // Chorus intro sample
  const chorusIntroSample: NotePreset = {
    id: uuidv4(),
    name: 'Chorus intro sample',
    notes: [
      { id: uuidv4(), pitch: 57, velocity: 0.5, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // Chorus Chords
  const chorusChord1: NotePreset = {
    id: uuidv4(),
    name: 'Chorus Chord 1',
    notes: [
      { id: uuidv4(), pitch: 62, velocity: 0.5, channel: 4, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 69, velocity: 0.7, channel: 4, preDelay: 20, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 76, velocity: 0.8, channel: 4, preDelay: 40, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorusChord2: NotePreset = {
    id: uuidv4(),
    name: 'Chorus Chord 2',
    notes: [
      { id: uuidv4(), pitch: 64, velocity: 0.5, channel: 4, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 71, velocity: 0.7, channel: 4, preDelay: 20, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 74, velocity: 0.8, channel: 4, preDelay: 40, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorusChord3: NotePreset = {
    id: uuidv4(),
    name: 'Chorus Chord 3',
    notes: [
      { id: uuidv4(), pitch: 57, velocity: 0.5, channel: 4, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 64, velocity: 0.7, channel: 4, preDelay: 20, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 67, velocity: 0.8, channel: 4, preDelay: 40, duration: null, durationUnit: 'ms' }
    ]
  };

  // Sample presets
  const sampleIntro: NotePreset = {
    id: uuidv4(),
    name: 'Sample Intro',
    notes: [
      { id: uuidv4(), pitch: 48, velocity: 0.8, channel: 6, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const sampleEnd: NotePreset = {
    id: uuidv4(),
    name: 'Sample End',
    notes: [
      { id: uuidv4(), pitch: 49, velocity: 0.8, channel: 6, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const allPresets = [
    intro2Preset, introSamplePreset,
    verseChord1, verseChord2, verseChord3,
    verseSynthBass1, verseSynthBass2, verseSynthBass3, verseSynthBass4, verseSynthBass3_2,
    chorusIntroSample,
    chorusChord1, chorusChord2, chorusChord3,
    sampleIntro, sampleEnd
  ];

  // ===== SEQUENCES =====
  
  // Bridge Lead - 11 notes sequence
  const bridgeLeadNotes = [71, 72, 69, 71, 67, 69, 64, 67, 65, 64, 65];
  const bridgeLead: Sequence = {
    id: uuidv4(),
    name: 'Bridge Lead',
    mode: SequenceMode.STEP,
    items: bridgeLeadNotes.map((pitch, index) => ({
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: index,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: 5,
        preDelay: 0,
        duration: null,
        durationUnit: 'ms' as const
      }
    })),
    gridSnap: 1
  };

  // Bridge Lead end 1
  const bridgeLeadEnd1: Sequence = {
    id: uuidv4(),
    name: 'Bridge Lead end 1',
    mode: SequenceMode.STEP,
    items: [{
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: 0,
      noteData: { pitch: 64, velocity: 0.8, channel: 5, preDelay: 0, duration: null, durationUnit: 'ms' as const }
    }],
    gridSnap: 1
  };

  // Bridge Lead end 2
  const bridgeLeadEnd2: Sequence = {
    id: uuidv4(),
    name: 'Bridge Lead end 2',
    mode: SequenceMode.STEP,
    items: [{
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: 0,
      noteData: { pitch: 68, velocity: 0.8, channel: 5, preDelay: 0, duration: null, durationUnit: 'ms' as const }
    }],
    gridSnap: 1
  };

  // Solo Lead 1-1 (16 notes)
  const soloLead1_1Notes = [76, 72, 69, 64, 69, 72, 76, 72, 74, 71, 68, 64, 68, 71, 74, 71];
  const soloLead1_1: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 1-1',
    mode: SequenceMode.STEP,
    items: soloLead1_1Notes.map((pitch, index) => ({
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: index,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: 5,
        preDelay: 0,
        duration: null,
        durationUnit: index < 8 ? 'ms' as const : 'beat' as const
      }
    })),
    gridSnap: 1
  };

  // Solo Lead 1-2 (16 notes)
  const soloLead1_2Notes = [72, 71, 69, 64, 60, 59, 57, 52, 57, 59, 60, 64, 69, 71, 72, 74];
  const soloLead1_2: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 1-2',
    mode: SequenceMode.STEP,
    items: soloLead1_2Notes.map((pitch, index) => ({
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: index,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: 5,
        preDelay: 0,
        duration: null,
        durationUnit: index < 8 ? 'ms' as const : 'beat' as const
      }
    })),
    gridSnap: 1
  };

  // Solo Lead 2-1 (16 notes)
  const soloLead2_1Notes = [76, 72, 69, 64, 69, 72, 76, 72, 74, 71, 68, 71, 74, 77, 76, 74];
  const soloLead2_1: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 2-1',
    mode: SequenceMode.STEP,
    items: soloLead2_1Notes.map((pitch, index) => ({
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: index,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: 5,
        preDelay: 0,
        duration: null,
        durationUnit: index < 8 ? 'ms' as const : 'beat' as const
      }
    })),
    gridSnap: 1
  };

  // Solo Lead 2-2 (16 notes)
  const soloLead2_2Notes = [76, 72, 71, 69, 64, 60, 59, 57, 52, 57, 59, 60, 64, 69, 71, 72];
  const soloLead2_2: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 2-2',
    mode: SequenceMode.STEP,
    items: soloLead2_2Notes.map((pitch, index) => ({
      id: uuidv4(),
      type: 'note' as const,
      targetId: intro2Preset.id,
      beatPosition: index,
      noteData: {
        pitch,
        velocity: 0.8,
        channel: 5,
        preDelay: 0,
        duration: null,
        durationUnit: index < 8 ? 'ms' as const : 'beat' as const
      }
    })),
    gridSnap: 1
  };

  // Solo Lead 1 (GROUP - combines 1-1 and 1-2)
  const soloLead1: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 1',
    mode: SequenceMode.GROUP,
    items: [
      { id: uuidv4(), type: 'sequence' as const, targetId: soloLead1_1.id, beatPosition: 0 },
      { id: uuidv4(), type: 'sequence' as const, targetId: soloLead1_2.id, beatPosition: 1 }
    ],
    gridSnap: 1
  };

  // Solo Lead 2 (GROUP - combines 2-1 and 2-2)
  const soloLead2: Sequence = {
    id: uuidv4(),
    name: 'Solo Lead 2',
    mode: SequenceMode.GROUP,
    items: [
      { id: uuidv4(), type: 'sequence' as const, targetId: soloLead2_1.id, beatPosition: 0 },
      { id: uuidv4(), type: 'sequence' as const, targetId: soloLead2_2.id, beatPosition: 1 }
    ],
    gridSnap: 1
  };

  const sequences = [
    bridgeLead, bridgeLeadEnd1, bridgeLeadEnd2,
    soloLead1_1, soloLead1_2, soloLead2_1, soloLead2_2,
    soloLead1, soloLead2
  ];

  // ===== SCENES =====
  const introSceneId = uuidv4();
  const chorusSceneId = uuidv4();
  const bridgeSceneId = uuidv4();
  const soloSceneId = uuidv4();

  // ===== MAPPINGS =====
  
  // Intro scene mappings
  const introMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'a',
    midiValue: '48',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: intro2Preset.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'q',
    midiValue: '54',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseChord1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'w',
    midiValue: '56',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseChord2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping4: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'e',
    midiValue: '58',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseChord3.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping5: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'j',
    midiValue: '60',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseSynthBass1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping6: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'k',
    midiValue: '62',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseSynthBass2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping7: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'l',
    midiValue: '64',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseSynthBass3.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping8: InputMapping = {
    id: uuidv4(),
    keyboardValue: ';',
    midiValue: '65',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseSynthBass4.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping9: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'o',
    midiValue: '63',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseSynthBass3_2.id,
    isEnabled: true,
    scope: 'scene'
  };

  // Chorus scene mappings
  const chorusMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'q',
    midiValue: '49',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorusIntroSample.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'a',
    midiValue: '48',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorusChord1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 's',
    midiValue: '50',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorusChord2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping4: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'd',
    midiValue: '52',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorusChord3.id,
    isEnabled: true,
    scope: 'scene'
  };

  // Bridge scene mappings
  const bridgeMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'j,k',
    midiValue: '65, 67, 69, 71, 72',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: bridgeLead.id,
    isEnabled: true,
    scope: 'scene'
  };

  const bridgeMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'u',
    midiValue: '66',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: bridgeLeadEnd1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const bridgeMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'i',
    midiValue: '68',
    midiChannel: 0,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: bridgeLeadEnd2.id,
    isEnabled: true,
    scope: 'scene'
  };

  // Solo scene mappings
  const soloMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'l, ;, j, k',
    midiValue: '65, 67, 69, 71, 72',
    midiChannel: 0,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: soloLead1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const soloMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'o, p, u, i',
    midiValue: '66, 68, 70',
    midiChannel: 0,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: soloLead2.id,
    isEnabled: true,
    scope: 'scene'
  };

  // Global scene switch mappings
  const switchToIntro: InputMapping = {
    id: uuidv4(),
    keyboardValue: '1',
    midiValue: '36',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: introSceneId,
    isEnabled: true,
    scope: 'global'
  };

  const switchToChorus: InputMapping = {
    id: uuidv4(),
    keyboardValue: '2',
    midiValue: '37',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: chorusSceneId,
    isEnabled: true,
    scope: 'global'
  };

  const switchToBridge: InputMapping = {
    id: uuidv4(),
    keyboardValue: '3',
    midiValue: '38',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: bridgeSceneId,
    isEnabled: true,
    scope: 'global'
  };

  const switchToSolo: InputMapping = {
    id: uuidv4(),
    keyboardValue: '4',
    midiValue: '39',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: soloSceneId,
    isEnabled: true,
    scope: 'global'
  };

  // Global sample mappings
  const sampleIntroMapping: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'z',
    midiValue: '42',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: sampleIntro.id,
    isEnabled: true,
    scope: 'global'
  };

  const sampleEndMapping: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'x',
    midiValue: '43',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: sampleEnd.id,
    isEnabled: true,
    scope: 'global'
  };

  const mappings: InputMapping[] = [
    // Intro mappings
    introMapping1, introMapping2, introMapping3, introMapping4,
    introMapping5, introMapping6, introMapping7, introMapping8, introMapping9,
    // Chorus mappings
    chorusMapping1, chorusMapping2, chorusMapping3, chorusMapping4,
    // Bridge mappings
    bridgeMapping1, bridgeMapping2, bridgeMapping3,
    // Solo mappings
    soloMapping1, soloMapping2,
    // Global scene switches
    switchToIntro, switchToChorus, switchToBridge, switchToSolo,
    // Global sample mappings
    sampleIntroMapping, sampleEndMapping
  ];

  // ===== SCENES =====
  const introScene: Scene = {
    id: introSceneId,
    name: 'Intro',
    mappingIds: [
      introMapping1.id, introMapping2.id, introMapping3.id, introMapping4.id,
      introMapping5.id, introMapping6.id, introMapping7.id, introMapping8.id, introMapping9.id
    ]
  };

  const chorusScene: Scene = {
    id: chorusSceneId,
    name: 'Chorus',
    mappingIds: [chorusMapping1.id, chorusMapping2.id, chorusMapping3.id, chorusMapping4.id]
  };

  const bridgeScene: Scene = {
    id: bridgeSceneId,
    name: 'Bridge',
    mappingIds: [bridgeMapping1.id, bridgeMapping2.id, bridgeMapping3.id]
  };

  const soloScene: Scene = {
    id: soloSceneId,
    name: 'Solo',
    mappingIds: [soloMapping1.id, soloMapping2.id]
  };

  return {
    id: songId,
    name: 'Desert Eagle',
    bpm: 120,
    presets: allPresets,
    presetFolders,
    sequences,
    mappings,
    ccMappings: [],
    scenes: [introScene, chorusScene, bridgeScene, soloScene],
    activeSceneId: bridgeSceneId
  };
}
