import { Song, NotePreset, NoteItem, Sequence, SequenceItem, SequenceMode, InputMapping, Scene } from '../types';
import { v4 as uuidv4 } from 'uuid';

// Helper to convert note name (e.g., "C#4") to MIDI number
function noteNameToMidi(noteName: string): number {
  const noteMap: Record<string, number> = {
    'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'D#': 3, 'Eb': 3,
    'E': 4, 'Fb': 4, 'E#': 5, 'F': 5, 'F#': 6, 'Gb': 6,
    'G': 7, 'G#': 8, 'Ab': 8, 'A': 9, 'A#': 10, 'Bb': 10,
    'B': 11, 'Cb': 11, 'B#': 0
  };

  const match = noteName.match(/^([A-Ga-g][#b]?)(-?\d+)$/);
  if (!match) {
    console.warn(`Invalid note name: ${noteName}`);
    return 60; // Default to middle C
  }

  const [, note, octaveStr] = match;
  const octave = parseInt(octaveStr, 10);
  const noteValue = noteMap[note.charAt(0).toUpperCase() + note.slice(1)];

  if (noteValue === undefined) {
    console.warn(`Unknown note: ${note}`);
    return 60;
  }

  return (octave + 1) * 12 + noteValue;
}

// Helper to convert MIDI number to note name
function midiToNoteName(midi: number): string {
  const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  const octave = Math.floor(midi / 12) - 1;
  const note = noteNames[midi % 12];
  return `${note}${octave}`;
}

// Old project types for conversion
interface OldGroup {
  channel: number[];
  notes: (string | null)[][];
  rawAttack?: number;
  noteAttacks?: number[];
}

interface OldBankGroup {
  cond?: {
    noteEq?: number;
    noteLt?: number;
    noteGt?: number;
  };
  group: OldGroup;
}

interface OldBank {
  name: string;
  keyGroups?: OldBankGroup[];
  padGroups?: OldBankGroup[];
}

// Convert old Group to NotePreset array (one preset per note set in the sequence)
function convertGroupToPresets(
  groupName: string,
  group: OldGroup,
  folderName?: string,
  folderId?: string
): NotePreset[] {
  const presets: NotePreset[] = [];

  group.notes.forEach((noteSet, index) => {
    const notes: NoteItem[] = [];

    noteSet.forEach((noteName, noteIndex) => {
      if (noteName === null || typeof noteName !== 'string') return;

      const channel = group.channel[noteIndex] || group.channel[0] || 1;
      const velocity = (() => {
        if (group.noteAttacks && group.noteAttacks[noteIndex] !== undefined) {
          return group.noteAttacks[noteIndex] / 127;
        }
        if (group.rawAttack !== undefined) {
          return group.rawAttack / 127;
        }
        return 0.8; // Default velocity
      })();

      notes.push({
        id: uuidv4(),
        pitch: noteNameToMidi(noteName),
        velocity,
        channel,
        preDelay: 0,
        duration: null, // Play until release
        durationUnit: 'ms'
      });
    });

    if (notes.length > 0) {
      presets.push({
        id: uuidv4(),
        name: group.notes.length > 1 ? `${groupName} ${index + 1}` : groupName,
        notes,
        folderId
      });
    }
  });

  return presets;
}

// Convert old BankGroup array to Sequence (GROUP mode for step-through behavior)
function convertBankGroupToSequence(
  name: string,
  presets: NotePreset[],
  bpm: number = 120
): Sequence {
  const items: SequenceItem[] = presets.map((preset, index) => ({
    id: uuidv4(),
    type: 'preset' as const,
    targetId: preset.id,
    beatPosition: index, // Each item at sequential beat positions
    sustainUntilNext: true
  }));

  return {
    id: uuidv4(),
    name,
    mode: SequenceMode.GROUP,
    items,
    bpm
  };
}

// Convert condition to MIDI range for mapping
function conditionToMidiRange(cond?: { noteEq?: number; noteLt?: number; noteGt?: number }): {
  isMidiRange: boolean;
  midiRangeStart: number;
  midiRangeEnd: number;
  midiValue: string;
} {
  if (!cond) {
    return { isMidiRange: false, midiRangeStart: 0, midiRangeEnd: 127, midiValue: '' };
  }

  if (cond.noteEq !== undefined) {
    return {
      isMidiRange: false,
      midiRangeStart: cond.noteEq,
      midiRangeEnd: cond.noteEq,
      midiValue: String(cond.noteEq)
    };
  }

  if (cond.noteLt !== undefined) {
    return {
      isMidiRange: true,
      midiRangeStart: 0,
      midiRangeEnd: cond.noteLt - 1,
      midiValue: ''
    };
  }

  if (cond.noteGt !== undefined) {
    return {
      isMidiRange: true,
      midiRangeStart: cond.noteGt + 1,
      midiRangeEnd: 127,
      midiValue: ''
    };
  }

  return { isMidiRange: false, midiRangeStart: 0, midiRangeEnd: 127, midiValue: '' };
}

// Main conversion function: Convert old Bank to new Song format
export function convertOldBankToSong(bank: OldBank, bpm: number = 120): Song {
  const songId = uuidv4();
  const sceneId = uuidv4();
  const presets: NotePreset[] = [];
  const sequences: Sequence[] = [];
  const mappings: InputMapping[] = [];
  const presetFolders: { id: string; name: string }[] = [];

  // Process keyGroups
  if (bank.keyGroups) {
    const keyFolderId = uuidv4();
    presetFolders.push({ id: keyFolderId, name: 'Key Groups' });

    bank.keyGroups.forEach((bankGroup, groupIndex) => {
      const groupName = `Key Group ${groupIndex + 1}`;
      const groupPresets = convertGroupToPresets(
        groupName,
        bankGroup.group,
        'Key Groups',
        keyFolderId
      );
      presets.push(...groupPresets);

      // Create sequence for this group
      if (groupPresets.length > 0) {
        const sequence = convertBankGroupToSequence(groupName, groupPresets, bpm);
        sequences.push(sequence);

        // Create mapping for this sequence
        const midiRange = conditionToMidiRange(bankGroup.cond);
        const mapping: InputMapping = {
          id: uuidv4(),
          keyboardValue: '',
          midiValue: midiRange.midiValue,
          midiChannel: 0, // Omni
          isMidiRange: midiRange.isMidiRange,
          midiRangeStart: midiRange.midiRangeStart,
          midiRangeEnd: midiRange.midiRangeEnd,
          actionType: 'sequence',
          actionTargetId: sequence.id,
          isEnabled: true,
          scope: 'scene'
        };
        mappings.push(mapping);
      }
    });
  }

  // Process padGroups
  if (bank.padGroups) {
    const padFolderId = uuidv4();
    presetFolders.push({ id: padFolderId, name: 'Pad Groups' });

    bank.padGroups.forEach((bankGroup, groupIndex) => {
      const groupName = `Pad Group ${groupIndex + 1}`;
      const groupPresets = convertGroupToPresets(
        groupName,
        bankGroup.group,
        'Pad Groups',
        padFolderId
      );
      presets.push(...groupPresets);

      if (groupPresets.length > 0) {
        const sequence = convertBankGroupToSequence(groupName, groupPresets, bpm);
        sequences.push(sequence);

        const midiRange = conditionToMidiRange(bankGroup.cond);
        const mapping: InputMapping = {
          id: uuidv4(),
          keyboardValue: '',
          midiValue: midiRange.midiValue,
          midiChannel: 10, // Drum channel
          isMidiRange: midiRange.isMidiRange,
          midiRangeStart: midiRange.midiRangeStart,
          midiRangeEnd: midiRange.midiRangeEnd,
          actionType: 'sequence',
          actionTargetId: sequence.id,
          isEnabled: true,
          scope: 'scene'
        };
        mappings.push(mapping);
      }
    });
  }

  const scene: Scene = {
    id: sceneId,
    name: 'Main',
    mappingIds: mappings.map(m => m.id)
  };

  return {
    id: songId,
    name: bank.name,
    bpm,
    presets,
    presetFolders,
    sequences,
    mappings,
    scenes: [scene],
    activeSceneId: sceneId
  };
}

// Export a single song to JSON
export function exportSongToJson(song: Song): string {
  return JSON.stringify(song, null, 2);
}

// Import a song from JSON
export function importSongFromJson(jsonString: string): Song {
  const parsed = JSON.parse(jsonString);
  
  // Regenerate all IDs to avoid conflicts
  const idMap = new Map<string, string>();
  
  const getNewId = (oldId: string): string => {
    if (!idMap.has(oldId)) {
      idMap.set(oldId, uuidv4());
    }
    return idMap.get(oldId)!;
  };

  const newSong: Song = {
    id: getNewId(parsed.id),
    name: parsed.name,
    bpm: parsed.bpm || 120,
    presets: (parsed.presets || []).map((p: NotePreset) => ({
      ...p,
      id: getNewId(p.id),
      folderId: p.folderId ? getNewId(p.folderId) : null,
      notes: p.notes.map((n: NoteItem) => ({
        ...n,
        id: getNewId(n.id)
      }))
    })),
    presetFolders: (parsed.presetFolders || []).map((f: { id: string; name: string }) => ({
      id: getNewId(f.id),
      name: f.name
    })),
    sequences: (parsed.sequences || []).map((s: Sequence) => ({
      ...s,
      id: getNewId(s.id),
      items: s.items.map((i: SequenceItem) => ({
        ...i,
        id: getNewId(i.id),
        targetId: i.targetId ? getNewId(i.targetId) : undefined
      }))
    })),
    mappings: (parsed.mappings || []).map((m: InputMapping) => ({
      ...m,
      id: getNewId(m.id),
      actionTargetId: m.actionTargetId ? getNewId(m.actionTargetId) : ''
    })),
    scenes: (parsed.scenes || []).map((s: Scene) => ({
      id: getNewId(s.id),
      name: s.name,
      mappingIds: (s.mappingIds || []).map((mid: string) => getNewId(mid))
    })),
    activeSceneId: getNewId(parsed.activeSceneId)
  };

  return newSong;
}

// Download song as JSON file
export function downloadSongAsJson(song: Song): void {
  const jsonStr = exportSongToJson(song);
  const dataUri = 'data:application/json;charset=utf-8,' + encodeURIComponent(jsonStr);
  const fileName = `${song.name.replace(/\s+/g, '_')}_song.json`;
  
  const link = document.createElement('a');
  link.setAttribute('href', dataUri);
  link.setAttribute('download', fileName);
  link.click();
}
