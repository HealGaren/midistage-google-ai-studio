
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
  const noteTimersRef = useRef<Map<string, { onTimeout?: any, offTimeout?: any, isPlaying: boolean }>>(new Map());
  
  // 트리거 소유권: 특정 Target(Preset/Sequence)을 마지막으로 장악한 인스턴스(mappingId_triggerValue)
  const activeMappingByTargetRef = useRef<Map<string, string>>(new Map());
  
  // 시퀀스별로 현재 'Sustain' 중인 노트들을 추적 (Pitch-Channel 조합)
  const sustainedNotesBySequenceRef = useRef<Map<string, Set<string>>>(new Map());
  
  // 개별 물리적 트리거별로 연주했던 인덱스 기억
  const lastTriggeredIndexByInstanceRef = useRef<Map<string, number>>(new Map());

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
    sustainedNotesBySequenceRef.current.clear();
    lastTriggeredIndexByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
  }, [project.selectedOutputId]);

  // 특정 소스(시퀀스 등)가 유지하던 노트를 모두 종료
  const clearSustainedNotes = useCallback((sourceId: string) => {
    const set = sustainedNotesBySequenceRef.current.get(sourceId);
    if (set) {
      set.forEach(noteKey => {
        const [p, c] = noteKey.split('-').map(Number);
        sendNoteOff(p, c);
      });
      set.clear();
    }
  }, [sendNoteOff]);

  const recordSustainedNote = useCallback((sourceId: string, pitch: number, channel: number) => {
    let set = sustainedNotesBySequenceRef.current.get(sourceId);
    if (!set) {
      set = new Set();
      sustainedNotesBySequenceRef.current.set(sourceId, set);
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

  const triggerDirectNote = useCallback((note: Omit<NoteItem, 'id'>, idSuffix: string = '', bpm: number, sourceId?: string) => {
    const timerKey = `direct_${idSuffix}_${note.pitch}_${Date.now()}`;
    const state: { onTimeout?: any, offTimeout?: any, isPlaying: boolean } = { isPlaying: false };
    const durationMs = note.duration !== null ? calculateMs(note.duration, note.durationUnit, bpm) : null;

    state.onTimeout = setTimeout(() => {
      state.isPlaying = true;
      sendNoteOn(note.pitch, note.velocity, note.channel, durationMs);
      
      if (sourceId && !durationMs) {
        recordSustainedNote(sourceId, note.pitch, note.channel);
      }

      if (durationMs !== null) {
        state.offTimeout = setTimeout(() => {
          sendNoteOff(note.pitch, note.channel);
          noteTimersRef.current.delete(timerKey);
        }, durationMs);
      }
    }, note.preDelay);
    noteTimersRef.current.set(timerKey, state);
  }, [sendNoteOn, sendNoteOff, calculateMs, recordSustainedNote]);

  const triggerPreset = useCallback(async (presetId: string, isRelease: boolean = false, overrideDuration: number | null = null, overrideUnit: DurationUnit = 'ms', bpm: number, mappingId?: string, isSustainedMode: boolean = false, triggerValue: string | number = 'direct', sourceId?: string) => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;

    const instanceId = `${mappingId || 'ui'}_${triggerValue}`;
    const gliss = preset.glissando;

    if (isRelease) {
      if (activeMappingByTargetRef.current.get(presetId) !== instanceId) return;
      if (isSustainedMode) return; 

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
      activeMappingByTargetRef.current.set(presetId, instanceId);

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
          
          if (sourceId && !durationMs) {
            recordSustainedNote(sourceId, note.pitch, note.channel);
          }

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
  }, [currentSong, sendNoteOn, sendNoteOff, calculateMs, runGlissandoInternal, recordSustainedNote]);

  const triggerSequenceItem = useCallback((item: SequenceItem, bpm: number, instanceId?: string, sourceId?: string) => {
    if (item.type === 'preset' && item.targetId) {
      const mappingId = instanceId?.split('_')[0];
      const triggerVal = instanceId?.split('_')[1] || 'direct';
      triggerPreset(item.targetId, false, item.overrideDuration ?? null, item.overrideDurationUnit ?? 'ms', bpm, mappingId, item.sustainUntilNext, triggerVal, sourceId);
    } else if (item.type === 'note' && item.noteData) {
      triggerDirectNote(item.noteData, item.id, bpm, sourceId);
    }
  }, [triggerPreset, triggerDirectNote]);

  const triggerSequence = useCallback((seqId: string, mappingId: string, isRelease: boolean = false, triggerValue: string | number = 'direct') => {
    const seq = currentSong.sequences.find(s => s.id === seqId);
    if (!seq) return;
    const effectiveBpm = seq.bpm || currentSong.bpm;
    const instanceId = `${mappingId}_${triggerValue}`;

    if (seq.mode === SequenceMode.STEP) {
      if (isRelease) {
        // 소유권 확인: 마지막 주체만 Release 처리
        if (activeMappingByTargetRef.current.get(seqId) !== instanceId) return;

        const triggeredIdx = lastTriggeredIndexByInstanceRef.current.get(instanceId);
        if (triggeredIdx === undefined) return;
        
        const triggeredItem = seq.items[triggeredIdx];
        // SustainUntilNext 설정된 아이템은 뗄 때 끄지 않음 (다음 스텝에서 꺼짐)
        if (!triggeredItem?.sustainUntilNext) {
          if (triggeredItem.type === 'preset' && triggeredItem.targetId) {
            triggerPreset(triggeredItem.targetId, true, triggeredItem.overrideDuration ?? null, triggeredItem.overrideDurationUnit ?? 'ms', effectiveBpm, mappingId, false, triggerValue, seqId);
          } else if (triggeredItem.type === 'note' && triggeredItem.noteData) {
            if (triggeredItem.overrideDuration === null && triggeredItem.noteData.duration === null) {
              sendNoteOff(triggeredItem.noteData.pitch, triggeredItem.noteData.channel);
            }
          }
        }
      } else {
        // [핵심] 새로운 스텝 시작 시, 이 시퀀스가 이전에 서스테인하고 있던 모든 노트를 무조건 종료
        clearSustainedNotes(seqId);

        // 소유권 업데이트
        activeMappingByTargetRef.current.set(seqId, instanceId);

        const currentIndex = stepIndicesRef.current[seqId] || 0;
        const item = seq.items[currentIndex];
        
        if (item) {
          lastTriggeredIndexByInstanceRef.current.set(instanceId, currentIndex);
          triggerSequenceItem(item, effectiveBpm, instanceId, seqId);
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
  }, [currentSong, triggerPreset, triggerSequenceItem, sendNoteOff, clearSustainedNotes]);

  const resetAllSequences = useCallback(() => {
    stepIndicesRef.current = {};
    sustainedNotesBySequenceRef.current.forEach((_, id) => clearSustainedNotes(id));
    lastTriggeredIndexByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
  }, [clearSustainedNotes]);

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
