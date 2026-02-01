import { Song, NotePreset, Sequence, SequenceMode, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

export function createVolcanoSong(): Song {
  const songId = uuidv4();
  
  // Create folder
  const introSlideDownFolderId = uuidv4();
  
  const presetFolders: PresetFolder[] = [
    { id: introSlideDownFolderId, name: 'Intro slide down' }
  ];

  // ===== PRESETS =====
  
  // G#5 Glissando - with release glissando
  const gSharp5GlissandoPreset: NotePreset = {
    id: uuidv4(),
    name: 'G#5 Glissando',
    notes: [
      { id: uuidv4(), pitch: 68, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 75, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 80, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ],
    glissando: {
      attackEnabled: false,
      releaseEnabled: true,
      lowestNote: 48,
      targetNote: 68,
      speed: 30,
      mode: 'black',
      lowestVelocity: 0.2,
      targetVelocity: 0.2
    }
  };

  // B5
  const b5Preset: NotePreset = {
    id: uuidv4(),
    name: 'B5',
    notes: [
      { id: uuidv4(), pitch: 71, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 78, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 83, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // IntroSlideDown 1-7
  const introSlideDown1: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown1',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 64, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 76, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown2: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown2',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 63, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 75, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown3: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown3',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 62, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 74, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown4: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown4',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 61, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 73, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // F#5
  const fSharp5Preset: NotePreset = {
    id: uuidv4(),
    name: 'F#5',
    notes: [
      { id: uuidv4(), pitch: 66, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 73, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 78, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown5: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown5',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 60, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 72, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown6: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown6',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 71, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const introSlideDown7: NotePreset = {
    id: uuidv4(),
    name: 'IntroSlideDown7',
    folderId: introSlideDownFolderId,
    notes: [
      { id: uuidv4(), pitch: 58, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 70, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // Verse Notes
  const verseNote1_1: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 1-1',
    notes: [{ id: uuidv4(), pitch: 54, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  const verseNote1_2: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 1-2',
    notes: [{ id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  const verseNote2_1: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 2-1',
    notes: [{ id: uuidv4(), pitch: 51, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  const verseNote2_2: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 2-2',
    notes: [{ id: uuidv4(), pitch: 49, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  const verseNote2_3: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 2-3',
    notes: [{ id: uuidv4(), pitch: 47, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  // Verse Note 1-1 Gli (with glissando)
  const verseNote1_1Gli: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 1-1 Gli',
    notes: [{ id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }],
    glissando: {
      attackEnabled: false,
      releaseEnabled: true,
      lowestNote: 48,
      targetNote: 56,
      speed: 50,
      mode: 'black',
      lowestVelocity: 0.39,
      targetVelocity: 0.44
    }
  };

  // Chorus presets
  const chorus1: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-1',
    notes: [
      { id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 63, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 68, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorus2: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-2',
    notes: [
      { id: uuidv4(), pitch: 54, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 63, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 66, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 58, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorus3: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-3',
    notes: [
      { id: uuidv4(), pitch: 52, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 64, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorus4Sharp: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-4#',
    notes: [
      { id: uuidv4(), pitch: 49, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 65, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const chorus4: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-4',
    notes: [
      { id: uuidv4(), pitch: 49, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 61, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  // Verse2 presets
  const verse2_1: NotePreset = {
    id: uuidv4(),
    name: 'Verse2-1',
    notes: [
      { id: uuidv4(), pitch: 61, velocity: 0.8, channel: 1, preDelay: 0, duration: 200, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 63, velocity: 0.8, channel: 1, preDelay: 60, duration: null, durationUnit: 'ms' }
    ]
  };

  const verse2_2: NotePreset = {
    id: uuidv4(),
    name: 'Verse2-2',
    notes: [
      { id: uuidv4(), pitch: 62, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 66, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ]
  };

  const verse2_3: NotePreset = {
    id: uuidv4(),
    name: 'Verse2-3',
    notes: [
      { id: uuidv4(), pitch: 61, velocity: 0.8, channel: 1, preDelay: 0, duration: 110, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 110, duration: 110, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 220, duration: null, durationUnit: 'ms' }
    ]
  };

  const verseNote1Plus1: NotePreset = {
    id: uuidv4(),
    name: 'Verse Note 1+1',
    notes: [{ id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }]
  };

  // Chorus-1 Gli (with attack glissando)
  const chorus1Gli: NotePreset = {
    id: uuidv4(),
    name: 'Chorus-1 Gli',
    notes: [
      { id: uuidv4(), pitch: 56, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 63, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 68, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' },
      { id: uuidv4(), pitch: 59, velocity: 0.8, channel: 1, preDelay: 0, duration: null, durationUnit: 'ms' }
    ],
    glissando: {
      attackEnabled: true,
      releaseEnabled: false,
      lowestNote: 44,
      targetNote: 56,
      speed: 40,
      mode: 'black',
      lowestVelocity: 0.17,
      targetVelocity: 0.25
    }
  };

  const allPresets = [
    gSharp5GlissandoPreset, b5Preset,
    introSlideDown1, introSlideDown2, introSlideDown3, introSlideDown4,
    fSharp5Preset,
    introSlideDown5, introSlideDown6, introSlideDown7,
    verseNote1_1, verseNote1_2, verseNote2_1, verseNote2_2, verseNote2_3,
    verseNote1_1Gli,
    chorus1, chorus2, chorus3, chorus4Sharp, chorus4,
    verse2_1, verse2_2, verse2_3, verseNote1Plus1,
    chorus1Gli
  ];

  // ===== SEQUENCES =====
  
  // Intro SlideDownSeq1234
  const introSlideDownSeq1234: Sequence = {
    id: uuidv4(),
    name: 'Intro SlideDownSeq1234',
    mode: SequenceMode.STEP,
    items: [
      { id: uuidv4(), type: 'preset', targetId: introSlideDown1.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown2.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown3.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown4.id, beatPosition: 0, sustainUntilNext: false }
    ]
  };

  // Intro SlideDownSeq4567
  const introSlideDownSeq4567: Sequence = {
    id: uuidv4(),
    name: 'Intro SlideDownSeq4567',
    mode: SequenceMode.STEP,
    items: [
      { id: uuidv4(), type: 'preset', targetId: introSlideDown4.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown5.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown6.id, beatPosition: 0, sustainUntilNext: false },
      { id: uuidv4(), type: 'preset', targetId: introSlideDown7.id, beatPosition: 0, sustainUntilNext: false }
    ]
  };

  const sequences = [introSlideDownSeq1234, introSlideDownSeq4567];

  // ===== SCENES =====
  const introSceneId = uuidv4();
  const verseSceneId = uuidv4();
  const chorusSceneId = uuidv4();

  // ===== MAPPINGS =====
  
  // Intro scene mappings
  const introMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 's',
    midiValue: '50',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: gSharp5GlissandoPreset.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'd',
    midiValue: '52',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: b5Preset.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'a',
    midiValue: '48',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: fSharp5Preset.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping4: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'j, k',
    midiValue: '71, 72',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: introSlideDownSeq1234.id,
    isEnabled: true,
    scope: 'scene'
  };

  const introMapping5: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'u, i',
    midiValue: '68, 70',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'sequence',
    actionTargetId: introSlideDownSeq4567.id,
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

  const switchToVerse: InputMapping = {
    id: uuidv4(),
    keyboardValue: '2',
    midiValue: '37',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: verseSceneId,
    isEnabled: true,
    scope: 'global'
  };

  const switchToChorus: InputMapping = {
    id: uuidv4(),
    keyboardValue: '3',
    midiValue: '38',
    midiChannel: 10,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'switch_scene',
    actionTargetId: chorusSceneId,
    isEnabled: true,
    scope: 'global'
  };

  // Verse scene mappings
  const verseMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'j, p',
    midiValue: '71',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote1_1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'k',
    midiValue: '72',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote1_2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'o',
    midiValue: '70',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote2_1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping4: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'i',
    midiValue: '68',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote2_2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping5: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'u',
    midiValue: '66',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote2_3.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping6: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'a, s',
    midiValue: '48, 52',
    midiChannel: 1,
    isMidiRange: true,
    midiRangeStart: 48,
    midiRangeEnd: 50,
    actionType: 'preset',
    actionTargetId: verseNote1_1Gli.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping7: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'n',
    midiValue: '61',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verse2_1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping8: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'm',
    midiValue: '63',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verse2_2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping9: InputMapping = {
    id: uuidv4(),
    keyboardValue: ',',
    midiValue: '62',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verse2_3.id,
    isEnabled: true,
    scope: 'scene'
  };

  const verseMapping10: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'd',
    midiValue: '52',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: verseNote1Plus1.id,
    isEnabled: true,
    scope: 'scene'
  };

  // Chorus scene mappings
  const chorusMapping1: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'a',
    midiValue: '48',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus1.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping2: InputMapping = {
    id: uuidv4(),
    keyboardValue: 's',
    midiValue: '50',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus2.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping3: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'd',
    midiValue: '52',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus3.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping4: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'r',
    midiValue: '54',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus4Sharp.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping5: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'f',
    midiValue: '53',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus4.id,
    isEnabled: true,
    scope: 'scene'
  };

  const chorusMapping6: InputMapping = {
    id: uuidv4(),
    keyboardValue: 'q',
    midiValue: '49',
    midiChannel: 1,
    isMidiRange: false,
    midiRangeStart: 60,
    midiRangeEnd: 72,
    actionType: 'preset',
    actionTargetId: chorus1Gli.id,
    isEnabled: true,
    scope: 'scene'
  };

  const mappings: InputMapping[] = [
    // Intro mappings
    introMapping1, introMapping2, introMapping3, introMapping4, introMapping5,
    // Global scene switches
    switchToIntro, switchToVerse, switchToChorus,
    // Verse mappings
    verseMapping1, verseMapping2, verseMapping3, verseMapping4, verseMapping5,
    verseMapping6, verseMapping7, verseMapping8, verseMapping9, verseMapping10,
    // Chorus mappings
    chorusMapping1, chorusMapping2, chorusMapping3, chorusMapping4, chorusMapping5, chorusMapping6
  ];

  // ===== SCENES =====
  const introScene: Scene = {
    id: introSceneId,
    name: 'Intro',
    mappingIds: [introMapping1.id, introMapping2.id, introMapping3.id, introMapping4.id, introMapping5.id]
  };

  const verseScene: Scene = {
    id: verseSceneId,
    name: 'Verse',
    mappingIds: [
      verseMapping1.id, verseMapping2.id, verseMapping3.id, verseMapping4.id, verseMapping5.id,
      verseMapping6.id, verseMapping7.id, verseMapping8.id, verseMapping9.id, verseMapping10.id
    ]
  };

  const chorusScene: Scene = {
    id: chorusSceneId,
    name: 'Chorus',
    mappingIds: [
      chorusMapping1.id, chorusMapping2.id, chorusMapping3.id, chorusMapping4.id, chorusMapping5.id, chorusMapping6.id
    ]
  };

  return {
    id: songId,
    name: 'Volcano',
    bpm: 120,
    presets: allPresets,
    presetFolders,
    sequences,
    mappings,
    ccMappings: [],
    scenes: [introScene, verseScene, chorusScene],
    activeSceneId: introSceneId
  };
}
