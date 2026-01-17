
import { useState, useCallback, useRef, useEffect } from 'react';
import { midiService } from '../webMidiService';
import { ProjectData, Song, ActiveNoteState, NoteItem, SequenceItem, SequenceMode, DurationUnit, GlissandoConfig, GlissandoMode } from '../types';

const getGlissandoSteps = (start: number, end: number, mode: GlissandoMode) => {
  const steps: number[] = [];
  const dir = start < end ? 1 : -1;
  let curr = start;
  while (dir === 1 ? curr <= end : curr >= end) {
    const pc = curr % 12;
    const isBlack = [1, 3, 6, 8, 10].includes(pc);
    if (mode === 'both' || (mode === 'white' && !isBlack) || (mode === 'black' && isBlack)) {
      steps.push(curr);
    }
    curr += dir;
  }
  return steps;
};

export const useMidiEngine = (project: ProjectData, currentSong: Song) => {
  const [activeMidiNotes, setActiveMidiNotes] = useState<ActiveNoteState[]>([]);
  const stepIndicesRef = useRef<Record<string, number>>({});
  const lastActivePresetForTriggerRef = useRef<Map<string, string>>(new Map());
  const noteTimersRef = useRef<Map<string, { onTimeout?: any, offTimeout?: any, isPlaying: boolean }>>(new Map());

  const calculateMs = useCallback((value: number, unit: DurationUnit, bpm: number) => {
    if (unit === 'ms') return value;
    return (value * 60000) / bpm;
  }, []);

  const sendNoteOn = useCallback((pitch: number, velocity: number, channel: number, durationMs: number | null) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.playNote(pitch, { attack: velocity, channels: [channel] as any });
    setActiveMidiNotes(prev => [...prev, { pitch, channel, startTime: Date.now(), durationMs }]);
  }, [project.selectedOutputId]);

  const sendNoteOff = useCallback((pitch: number, channel: number) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.stopNote(pitch, { channels: [channel] as any });
    setActiveMidiNotes(prev => prev.filter(n => !(n.pitch === pitch && n.channel === channel)));
  }, [project.selectedOutputId]);

  const stopAllNotes = useCallback(() => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (output) {
      for (let i = 1; i <= 16; i++) {
        output.sendControlChange(123, 0, { channels: [i] as any });
      }
    }
    setActiveMidiNotes([]);
    noteTimersRef.current.forEach(timer => {
      if (timer.onTimeout) clearTimeout(timer.onTimeout);
      if (timer.offTimeout) clearTimeout(timer.offTimeout);
    });
    noteTimersRef.current.clear();
  }, [project.selectedOutputId]);

  const runGlissandoInternal = useCallback(async (start: number, end: number, config: GlissandoConfig, channel: number) => {
    const steps = getGlissandoSteps(start, end, config.mode);
    if (steps.length === 0) return;

    for (let i = 0; i < steps.length; i++) {
      const pitch = steps[i];
      const t = i / (steps.length - 1 || 1);
      const vel = start < end 
        ? config.lowestVelocity + t * (config.targetVelocity - config.lowestVelocity)
        : config.targetVelocity + t * (config.lowestVelocity - config.targetVelocity);
      
      sendNoteOn(pitch, vel, channel, config.speed);
      setTimeout(() => sendNoteOff(pitch, channel), config.speed);
      await new Promise(r => setTimeout(r, config.speed));
    }
  }, [sendNoteOn, sendNoteOff]);

  const triggerDirectNote = useCallback((note: Omit<NoteItem, 'id'>, idSuffix: string = '', bpm: number) => {
    const timerKey = `direct_${idSuffix}_${note.pitch}_${Date.now()}`;
    const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
    const durationMs = note.duration !== null ? calculateMs(note.duration, note.durationUnit, bpm) : null;

    state.onTimeout = setTimeout(() => {
      state.isPlaying = true;
      sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
      if (durationMs !== null) {
        state.offTimeout = setTimeout(() => {
          sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }, durationMs);
      }
    }, note.preDelay);
    noteTimersRef.current.set(timerKey, state);
  }, [sendNoteOn, sendNoteOff, calculateMs]);

  const triggerPreset = useCallback(async (presetId: string, isRelease: boolean = false, overrideDuration: number | null = null, overrideUnit: DurationUnit = 'ms', bpm: number) => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;

    const gliss = preset.glissando;

    if (isRelease) {
      preset.notes.forEach(note => {
        const timerKey = `${presetId}_${note.id}`;
        const existing = noteTimersRef.current.get(timerKey);
        if (existing && (overrideDuration === null && note.duration === null)) {
          if (existing.onTimeout) clearTimeout(existing.onTimeout);
          if (existing.isPlaying) sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }
      });
      if (gliss?.releaseEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        await runGlissandoInternal(gliss.targetNote, gliss.lowestNote, gliss, mainChannel);
      }
    } else {
      if (gliss?.attackEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        await runGlissandoInternal(gliss.lowestNote, gliss.targetNote, gliss, mainChannel);
      }
      preset.notes.forEach(note => {
        const timerKey = `${presetId}_${note.id}`;
        const durationMs = overrideDuration !== null 
          ? calculateMs(overrideDuration, overrideUnit, bpm) 
          : (note.duration !== null ? calculateMs(note.duration, note.durationUnit, bpm) : null);

        const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
        state.onTimeout = setTimeout(() => {
          state.isPlaying = true;
          sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
          if (durationMs !== null) {
            state.offTimeout = setTimeout(() => {
              sendNoteOff(note.pitch, note.channel);
              noteTimersRef.current.delete(timerKey);
            }, durationMs);
          }
        }, note.preDelay);
        noteTimersRef.current.set(timerKey, state);
      });
    }
  }, [currentSong, sendNoteOn, sendNoteOff, calculateMs, runGlissandoInternal]);

  const triggerSequenceItem = useCallback((item: SequenceItem, bpm: number) => {
    if (item.type === 'preset' && item.targetId) {
      triggerPreset(item.targetId, false, item.overrideDuration ?? null, item.overrideDurationUnit ?? 'ms', bpm);
    } else if (item.type === 'note' && item.noteData) {
      triggerDirectNote(item.noteData, item.id, bpm);
    }
  }, [triggerPreset, triggerDirectNote]);

  const triggerSequence = useCallback((seqId: string, mappingId: string, isRelease: boolean = false) => {
    const seq = currentSong.sequences.find(s => s.id === seqId);
    if (!seq) return;
    const effectiveBpm = seq.bpm || currentSong.bpm;

    if (seq.mode === SequenceMode.STEP) {
      if (isRelease) {
        const lastPresetId = lastActivePresetForTriggerRef.current.get(mappingId);
        if (lastPresetId) triggerPreset(lastPresetId, true, null, 'ms', effectiveBpm);
      } else {
        const currentIndex = stepIndicesRef.current[seqId] || 0;
        const item = seq.items[currentIndex];
        if (item) {
          if (item.type === 'preset') lastActivePresetForTriggerRef.current.set(mappingId, item.targetId!);
          triggerSequenceItem(item, effectiveBpm);
        }
        stepIndicesRef.current[seqId] = (currentIndex + 1) % seq.items.length;
      }
    } else if (seq.mode === SequenceMode.AUTO) {
      if (!isRelease) {
        const msPerBeat = 60000 / effectiveBpm;
        seq.items.forEach(item => {
          setTimeout(() => triggerSequenceItem(item, effectiveBpm), item.beatPosition * msPerBeat);
        });
      }
    }
  }, [currentSong, triggerPreset, triggerSequenceItem]);

  const resetAllSequences = useCallback(() => {
    stepIndicesRef.current = {};
    lastActivePresetForTriggerRef.current.clear();
  }, []);

  return {
    activeMidiNotes,
    sendNoteOn,
    sendNoteOff,
    stopAllNotes,
    triggerPreset,
    triggerSequence,
    resetAllSequences
  };
};
