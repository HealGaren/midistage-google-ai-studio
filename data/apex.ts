import { Song, NotePreset, NoteItem, Sequence, SequenceMode, InputMapping, Scene, PresetFolder } from '../types';
import { v4 as uuidv4 } from 'uuid';

// APEX — 실리카겔 (Silica Gel), 184 BPM
//
// 2025-03-22 공연에서 구 프로젝트(webmidi-example-vanilla banks[1])로 연주했던 곡을
// MidiStage로 이식한 것. 노트 데이터는 apex-port-kit/data/apex-notesets.json 그대로다.
//
// 구 엔진과의 차이 2가지 (이식하면서 조정한 부분):
//
// 1) 출력 채널 — 구 세팅은 Studio One에서 `MIDI ch 2`와 `MIDI ch 2(2)` 두 플레이어가
//    같은 loopMIDI ch2를 물어 리드 신스 2개를 레이어로 울렸다. 현재 show
//    (2026-01-17 Yechan Choi)는 플레이어 1개 = 채널 1개 구조라, 리드를
//    ch2 + ch5 두 채널로 같은 노트를 중복 송출해 같은 결과를 만든다.
//    드럼은 현재 세트리스트 관례(FM Business·Boulevard)에 맞춰 ch4가 아닌 ch11.
//
//      ch1  → 플레이어 1 → APEX 1. Main Riff Chord  (Mai Tai)
//      ch2  → 플레이어 2 → APEX 2. Main Riff Lead 1 (Mai Tai)
//      ch5  → 플레이어 5 → APEX 3. Main Riff Lead 2 (Mai Tai)  ← 구 ch2 레이어
//      ch3  → 플레이어 3 → APEX 4. Interlude Lead   (Mai Tai + SerumFX)
//      ch11 → 플레이어 9 → APEX 5. drum             (Impact + SerumFX)
//      ch16 → 플레이어 8 → Noise Sweep Free         (곡 공용)
//
// 2) 벨로시티 — 구 엔진은 연주자가 친 세기를 그대로 흘려보냈다(rawAttack 미지정).
//    MidiStage의 triggerPreset은 프리셋에 적힌 고정 벨로시티만 쓰고 연주 벨로시티를
//    반영하지 않으므로, 멜로디는 0.8 / 드럼(Impact 원샷·토글)은 100/127로 고정했다.

const MELODIC_VELOCITY = 0.8;
const DRUM_VELOCITY = 100 / 127;

// 리드가 나가는 채널. 구 세팅의 ch2 2중 레이어를 채널 2개로 편 것.
const LEAD_CHANNELS = [2, 5];

function makeNote(pitch: number, channel: number, velocity: number, duration: number | null = null): NoteItem {
  return {
    id: uuidv4(),
    pitch,
    velocity,
    channel,
    preDelay: 0,
    duration,
    durationUnit: 'ms'
  };
}

// pitch 배열 → 프리셋 1개
function createPreset(
  name: string,
  notes: NoteItem[],
  folderId: string
): NotePreset {
  return { id: uuidv4(), name, folderId, notes };
}

// 프리셋 배열 → STEP 시퀀스 (트리거할 때마다 한 스텝씩 진행)
function createStepSequence(name: string, presets: NotePreset[], bpm: number): Sequence {
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

export function createApexSong(): Song {
  const songId = uuidv4();
  const sceneId = uuidv4();

  const mainRiffFolderId = uuidv4();
  const interludeFolderId = uuidv4();
  const drumFolderId = uuidv4();
  const noiseFolderId = uuidv4();

  const presetFolders: PresetFolder[] = [
    { id: mainRiffFolderId, name: 'Main Riff' },
    { id: interludeFolderId, name: 'Interlude' },
    { id: drumFolderId, name: 'Drum & Sample' },
    { id: noiseFolderId, name: 'Noise' }
  ];

  // ── Main Riff — 9스텝 ────────────────────────────────────────────────
  // [ch1 코드 2음, 리드 2음(옥타브 더블링)]
  // 8·9스텝의 ch1이 Bb5 유니즌으로 겹치는 건 원본 그대로다 (오타 아님).
  const mainRiffSteps: { chord: number[]; lead: number[] }[] = [
    { chord: [77, 81], lead: [84, 60] }, // F5 A5 / C6  C4
    { chord: [77, 81], lead: [88, 64] }, // F5 A5 / E6  E4
    { chord: [77, 81], lead: [88, 64] }, // F5 A5 / E6  E4
    { chord: [77, 81], lead: [86, 62] }, // F5 A5 / D6  D4
    { chord: [80, 82], lead: [87, 63] }, // Ab5 Bb5 / Eb6 Eb4
    { chord: [80, 82], lead: [91, 67] }, // Ab5 Bb5 / G6  G4
    { chord: [80, 82], lead: [91, 67] }, // Ab5 Bb5 / G6  G4
    { chord: [82, 82], lead: [91, 67] }, // Bb5 Bb5 / G6  G4
    { chord: [82, 82], lead: [89, 65] }  // Bb5 Bb5 / F6  F4
  ];

  const mainRiffPresets = mainRiffSteps.map((step, index) =>
    createPreset(
      `Main Riff ${index + 1}`,
      [
        ...step.chord.map(pitch => makeNote(pitch, 1, MELODIC_VELOCITY)),
        // 리드는 ch2/ch5 두 채널에 같은 노트를 중복 송출 (구 ch2 레이어 재현)
        ...LEAD_CHANNELS.flatMap(channel =>
          step.lead.map(pitch => makeNote(pitch, channel, MELODIC_VELOCITY))
        )
      ],
      mainRiffFolderId
    )
  );

  // ── Interlude — 11스텝, ch3 단음 ─────────────────────────────────────
  // F5 Ab5 Bb5 F5 Ab5 G5 F5 Ab5 Bb5 F5 C6
  const interludePitches = [77, 80, 82, 77, 80, 79, 77, 80, 82, 77, 84];
  const interludePresets = interludePitches.map((pitch, index) =>
    createPreset(`Interlude ${index + 1}`, [makeNote(pitch, 3, MELODIC_VELOCITY)], interludeFolderId)
  );

  // 간주 베이스 페달 — C3(48) 한 건반에만 걸리는 고정음 Eb5
  const interludeBassPreset = createPreset(
    'Interlude Bass',
    [makeNote(75, 3, MELODIC_VELOCITY)],
    interludeFolderId
  );

  // ── 드럼 / 샘플 (전부 ch11 → Impact) ─────────────────────────────────
  // Intro 시퀀스: 실리카겔 MV 0.28s~ 루프 ↔ 15.4s~ 루프 (Impact chokeGroup 3 토글)
  const introPresets = [
    createPreset('Intro A (MV 0.28s~)', [makeNote(44, 11, DRUM_VELOCITY)], drumFolderId),
    createPreset('Intro B (MV 15.4s~)', [makeNote(40, 11, DRUM_VELOCITY)], drumFolderId)
  ];

  const bridgeNoisePreset = createPreset(
    'Bridge Noise (MV 136.5s~)',
    [makeNote(45, 11, DRUM_VELOCITY)],
    drumFolderId
  );
  const bridgeOutPreset = createPreset(
    'Bridge Out (MV 162.4s~)',
    [makeNote(46, 11, DRUM_VELOCITY)],
    drumFolderId
  );

  // 하이햇 카운트인 — 184BPM 4분음표 4방을 AUTO 시퀀스로.
  // duration을 100ms로 둔 건 의도적이다: AUTO가 같은 프리셋을 4번 부르면 타이머 키가
  // 겹치는데, 노트 길이가 스텝 간격(326ms)보다 짧아야 앞 노트가 정리된 뒤 다음이 울린다.
  const drumIntroHitPreset = createPreset(
    'Drum Intro Hit (Hat)',
    [makeNote(42, 11, DRUM_VELOCITY, 100)],
    drumFolderId
  );

  // bpm을 184로 못박아 둔다. 이 카운트인은 Studio One 쪽 Impact 킷의
  // noisebeat-184 슬라이스(timeStretchMode=1, 즉 Studio One 템포를 따라감)와
  // 맞물려야 하는데, 그 샘플들의 기준이 184다. 여기가 곡 BPM을 상속하게 두면
  // 앱 BPM이 흔들릴 때 카운트인만 혼자 어긋난다.
  const drumIntroSequence: Sequence = {
    id: uuidv4(),
    name: 'Drum Intro (Count-in)',
    mode: SequenceMode.AUTO,
    bpm: 184,
    items: [0, 1, 2, 3].map(beat => ({
      id: uuidv4(),
      type: 'preset' as const,
      targetId: drumIntroHitPreset.id,
      beatPosition: beat,
      sustainUntilNext: false
    }))
  };

  // noisebeat-184.wav 슬라이스 3종
  const beatPresets = [
    createPreset('Beat 1', [makeNote(36, 11, DRUM_VELOCITY)], drumFolderId),
    createPreset('Beat 2', [makeNote(37, 11, DRUM_VELOCITY)], drumFolderId),
    createPreset('Beat 3', [makeNote(38, 11, DRUM_VELOCITY)], drumFolderId)
  ];

  // ── 곡 공용 노이즈 (다른 곡들과 동일한 관례) ─────────────────────────
  const globalNoisePreset = createPreset(
    'Global Noise Toggle',
    [makeNote(36, 16, MELODIC_VELOCITY)],
    noiseFolderId
  );

  const presets: NotePreset[] = [
    ...mainRiffPresets,
    ...interludePresets,
    interludeBassPreset,
    ...introPresets,
    bridgeNoisePreset,
    bridgeOutPreset,
    drumIntroHitPreset,
    ...beatPresets,
    globalNoisePreset
  ];

  // ── 시퀀스 ───────────────────────────────────────────────────────────
  const mainRiffSequence = createStepSequence('Main Riff', mainRiffPresets, 184);
  const interludeSequence = createStepSequence('Interlude', interludePresets, 184);
  const introSequence = createStepSequence('Intro', introPresets, 184);

  const sequences: Sequence[] = [
    mainRiffSequence,
    interludeSequence,
    introSequence,
    drumIntroSequence
  ];

  // ── 입력 매핑 ────────────────────────────────────────────────────────
  // 구 엔진은 조건 배열의 첫 매치만 실행했지만 MidiStage는 매칭된 매핑을 전부
  // 실행한다. 그래서 구 noteLt 조건을 그대로 옮기지 않고, 서로 겹치지 않게
  // 재계산한 범위를 쓴다. (48만 비워 두고 그 양옆을 Interlude로 나눈 것)
  const mappings: InputMapping[] = [
    // 건반 (입력 ch1)
    {
      id: uuidv4(),
      keyboardValue: 'a',
      midiValue: '48',
      midiChannel: 1,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: interludeBassPreset.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'z,x',
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 0,
      midiRangeEnd: 47,
      actionType: 'sequence',
      actionTargetId: interludeSequence.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'c,v,b',
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 49,
      midiRangeEnd: 59,
      actionType: 'sequence',
      actionTargetId: interludeSequence.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'j,k,l,;',
      midiValue: '',
      midiChannel: 1,
      isMidiRange: true,
      midiRangeStart: 60,
      midiRangeEnd: 127,
      actionType: 'sequence',
      actionTargetId: mainRiffSequence.id,
      isEnabled: true,
      scope: 'global'
    },

    // 패드 (입력 ch10)
    {
      id: uuidv4(),
      keyboardValue: 'q',
      midiValue: '36',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'sequence',
      actionTargetId: introSequence.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'w',
      midiValue: '37',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: bridgeNoisePreset.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'e',
      midiValue: '38',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: bridgeOutPreset.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'r',
      midiValue: '39',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'sequence',
      actionTargetId: drumIntroSequence.id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 't',
      midiValue: '40',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: beatPresets[0].id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'y',
      midiValue: '41',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: beatPresets[1].id,
      isEnabled: true,
      scope: 'global'
    },
    {
      id: uuidv4(),
      keyboardValue: 'u',
      midiValue: '42',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'preset',
      actionTargetId: beatPresets[2].id,
      isEnabled: true,
      scope: 'global'
    },

    // 곡 공용 노이즈 토글 — 다른 곡과 같은 패드(50,51)
    {
      id: uuidv4(),
      keyboardValue: 'n',
      midiValue: '50,51',
      midiChannel: 10,
      isMidiRange: false,
      midiRangeStart: 0,
      midiRangeEnd: 127,
      actionType: 'toggle_preset',
      actionTargetId: globalNoisePreset.id,
      isEnabled: true,
      scope: 'global'
    }
  ];

  // APEX는 원래 씬 개념이 없다. 다른 곡들과 마찬가지로 Default Scene 하나만 두고
  // 매핑은 전부 scope: 'global'로 항상 살아 있게 한다.
  const scene: Scene = {
    id: sceneId,
    name: 'Default Scene',
    mappingIds: []
  };

  return {
    id: songId,
    name: 'APEX',
    bpm: 184,
    presets,
    presetFolders,
    sequences,
    mappings,
    // 곡 단위 ccMappings는 비워 둔다 — importSongFromJson이 복사하지 않아 임포트 시 유실된다.
    // APEX에 필요한 CC24는 프로젝트의 globalCCMappings에 이미 있다.
    ccMappings: [],
    scenes: [scene],
    activeSceneId: sceneId
  };
}
