
import { useState, useCallback, useRef } from 'react';
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
  const noteTimersRef = useRef<Map<string, { onTimeout?: any, offTimeout?: any, isPlaying: boolean }>>(new Map());
  const activeMappingByTargetRef = useRef<Map<string, string>>(new Map());
  const sustainedNotesBySourceRef = useRef<Map<string, Set<string>>>(new Map());
  const lastTriggeredIndexByInstanceRef = useRef<Map<string, number>>(new Map());
  const lastTriggerTimeByMappingRef = useRef<Map<string, number>>(new Map());

  const calculateMs = useCallback((value: number | null, unit: DurationUnit, bpm: number): number | null => {
    if (value === null || value === undefined) return null;
    if (unit === 'ms') return value;
    return (value * 60000) / (bpm || 120);
  }, []);

  const sendNoteOn = useCallback((pitch: number, velocity: number, channel: number, durationMs: number | null) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    output.playNote(pitch, { attack: velocity, channels: [channel] as any });
    setActiveMidiNotes(prev => {
        const filtered = prev.filter(n => !(n.pitch === pitch && n.channel === channel));
        return [...filtered, { pitch, channel, startTime: Date.now(), durationMs }];
    });
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
    sustainedNotesBySourceRef.current.clear();
    lastTriggeredIndexByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
  }, [project.selectedOutputId]);

  const clearSustainedNotes = useCallback((sourceId: string) => {
    const set = sustainedNotesBySourceRef.current.get(sourceId);
    if (set) {
      set.forEach(noteKey => {
        const [p, c] = noteKey.split('-').map(Number);
        sendNoteOff(p, c);
      });
      set.clear();
    }
  }, [sendNoteOff]);

  const recordSustainedNote = useCallback((sourceId: string, pitch: number, channel: number) => {
    let set = sustainedNotesBySourceRef.current.get(sourceId);
    if (!set) {
      set = new Set();
      sustainedNotesBySourceRef.current.set(sourceId, set);
    }
    set.add(`${pitch}-${channel}`);
  }, []);

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

  const triggerDirectNote = useCallback((note: Omit<NoteItem, 'id'>, mappingId: string, triggerValue: string | number, sourceId: string, bpm: number, overrideDuration: number | null | undefined = undefined, overrideUnit: DurationUnit = 'ms') => {
    const timerKey = `${sourceId}_${mappingId}_${triggerValue}_${note.pitch}`;
    const existing = noteTimersRef.current.get(timerKey);
    if (existing?.onTimeout) clearTimeout(existing.onTimeout);
    if (existing?.offTimeout) clearTimeout(existing.offTimeout);

    // FIX: undefined일 때만 note.duration을 사용하고, null(무한 유지)일 때는 null을 그대로 유지함
    const durVal = overrideDuration !== undefined ? overrideDuration : note.duration;
    const durUnit = overrideDuration !== undefined ? overrideUnit : note.durationUnit;
    const durationMs = calculateMs(durVal, durUnit, bpm);

    const state = { isPlaying: false, onTimeout: null as any, offTimeout: null as any };
    state.onTimeout = setTimeout(() => {
      state.isPlaying = true;
      sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
      if (durationMs === null) {
        recordSustainedNote(sourceId, note.pitch, note.channel);
      } else {
        state.offTimeout = setTimeout(() => {
          sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }, durationMs);
      }
    }, note.preDelay || 0);
    noteTimersRef.current.set(timerKey, state);
  }, [sendNoteOn, sendNoteOff, calculateMs, recordSustainedNote]);

  const triggerPreset = useCallback(async (presetId: string, isRelease: boolean = false, overrideDuration: number | null | undefined = undefined, overrideUnit: DurationUnit = 'ms', bpm: number, mappingId: string = 'ui', triggerValue: string | number = 'direct', isSustainedMode: boolean = false, sourceId?: string) => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;
    const instanceId = `${mappingId}_${triggerValue}`;
    const effectiveSourceId = sourceId || presetId;
    const gliss = preset.glissando;

    if (isRelease) {
      if (activeMappingByTargetRef.current.get(effectiveSourceId) !== instanceId) return;
      if (isSustainedMode) return; 
      preset.notes.forEach(note => {
        const timerKey = `${effectiveSourceId}_${mappingId}_${triggerValue}_${note.id}`;
        const existing = noteTimersRef.current.get(timerKey);
        if (existing) {
          if (existing.onTimeout) clearTimeout(existing.onTimeout);
          if (existing.isPlaying) sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }
      });
      if (gliss?.releaseEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        runGlissandoInternal(gliss.targetNote, gliss.lowestNote, gliss, mainChannel);
      }
    } else {
      activeMappingByTargetRef.current.set(effectiveSourceId, instanceId);
      if (gliss?.attackEnabled) {
        const mainChannel = preset.notes[0]?.channel || 1;
        await runGlissandoInternal(gliss.lowestNote, gliss.targetNote, gliss, mainChannel);
      }
      preset.notes.forEach(note => {
        const timerKey = `${effectiveSourceId}_${mappingId}_${triggerValue}_${note.id}`;
        const old = noteTimersRef.current.get(timerKey);
        if (old?.onTimeout) clearTimeout(old.onTimeout);
        if (old?.offTimeout) clearTimeout(old.offTimeout);

        // FIX: 여기서도 null(무한 유지)을 유효한 오버라이드로 인식하게 함
        const durVal = overrideDuration !== undefined ? overrideDuration : note.duration;
        const durUnit = overrideDuration !== undefined ? overrideUnit : note.durationUnit;
        const durationMs = calculateMs(durVal, durUnit, bpm);
        
        const state = { isPlaying: false, onTimeout: null as any, offTimeout: null as any };
        state.onTimeout = setTimeout(() => {
          state.isPlaying = true;
          sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
          if (durationMs === null) {
            recordSustainedNote(effectiveSourceId, note.pitch, note.channel);
          } else {
            state.offTimeout = setTimeout(() => {
              sendNoteOff(note.pitch, note.channel);
              noteTimersRef.current.delete(timerKey);
            }, durationMs);
          }
        }, note.preDelay || 0);
        noteTimersRef.current.set(timerKey, state);
      });
    }
  }, [currentSong, sendNoteOn, sendNoteOff, calculateMs, runGlissandoInternal, recordSustainedNote]);

  const triggerSequenceItem = useCallback((item: SequenceItem, bpm: number, mappingId: string, triggerValue: string | number, sourceId: string) => {
    if (item.type === 'preset' && item.targetId) {
      triggerPreset(item.targetId, false, item.overrideDuration, item.overrideDurationUnit ?? 'ms', bpm, mappingId, triggerValue, item.sustainUntilNext, sourceId);
    } else if (item.type === 'note' && item.noteData) {
      triggerDirectNote(item.noteData, mappingId, triggerValue, sourceId, bpm, item.overrideDuration, item.overrideDurationUnit ?? 'ms');
    }
  }, [triggerPreset, triggerDirectNote]);

  const triggerSequence = useCallback((seqId: string, mappingId: string, isRelease: boolean = false, triggerValue: string | number = 'direct') => {
    const seq = currentSong.sequences.find(s => s.id === seqId);
    if (!seq) return;
    const effectiveBpm = seq.bpm || currentSong.bpm;
    const instanceId = `${mappingId}_${triggerValue}`;
    if (seq.mode === SequenceMode.STEP) {
      if (isRelease) {
        if (activeMappingByTargetRef.current.get(seqId) !== instanceId) return;
        const triggeredIdx = lastTriggeredIndexByInstanceRef.current.get(instanceId);
        if (triggeredIdx === undefined) return;
        const triggeredItem = seq.items[triggeredIdx];
        if (!triggeredItem?.sustainUntilNext) {
          if (triggeredItem.type === 'preset' && triggeredItem.targetId) {
            triggerPreset(triggeredItem.targetId, true, triggeredItem.overrideDuration, triggeredItem.overrideDurationUnit ?? 'ms', effectiveBpm, mappingId, triggerValue, false, seqId);
          } else if (triggeredItem.type === 'note' && triggeredItem.noteData) {
            const timerKey = `${seqId}_${mappingId}_${triggerValue}_${triggeredItem.noteData.pitch}`;
            const existing = noteTimersRef.current.get(timerKey);
            if (existing) {
                if (existing.onTimeout) clearTimeout(existing.onTimeout);
                if (existing.isPlaying) sendNoteOff(triggeredItem.noteData.pitch, triggeredItem.noteData.channel);
                noteTimersRef.current.delete(timerKey);
            }
          }
        }
      } else {
        const now = Date.now();
        const lastTime = lastTriggerTimeByMappingRef.current.get(instanceId) || 0;
        if (now - lastTime < 30) return;
        lastTriggerTimeByMappingRef.current.set(instanceId, now);
        clearSustainedNotes(seqId);
        activeMappingByTargetRef.current.set(seqId, instanceId);
        const currentIndex = stepIndicesRef.current[seqId] || 0;
        const item = seq.items[currentIndex];
        if (item) {
          lastTriggeredIndexByInstanceRef.current.set(instanceId, currentIndex);
          triggerSequenceItem(item, effectiveBpm, mappingId, triggerValue, seqId);
        }
        stepIndicesRef.current[seqId] = (currentIndex + 1) % seq.items.length;
      }
    } else if (seq.mode === SequenceMode.AUTO) {
      if (!isRelease) {
        const msPerBeat = 60000 / (effectiveBpm || 120);
        seq.items.forEach(item => {
          setTimeout(() => triggerSequenceItem(item, effectiveBpm, mappingId, triggerValue, seqId), item.beatPosition * msPerBeat);
        });
      }
    }
  }, [currentSong, triggerPreset, triggerSequenceItem, sendNoteOff, clearSustainedNotes]);

  const resetAllSequences = useCallback(() => {
    stepIndicesRef.current = {};
    sustainedNotesBySourceRef.current.forEach((_, id) => clearSustainedNotes(id));
    lastTriggeredIndexByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
    lastTriggerTimeByMappingRef.current.clear();
  }, [clearSustainedNotes]);

  return { activeMidiNotes, sendNoteOn, sendNoteOff, stopAllNotes, triggerPreset, triggerSequence, resetAllSequences };
};
