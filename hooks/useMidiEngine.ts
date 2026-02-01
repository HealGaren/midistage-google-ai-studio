
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
  const [stepPositions, setStepPositions] = useState<Record<string, number>>({});
  
  const stepIndicesRef = useRef<Record<string, number>>({});
  const groupIndicesRef = useRef<Record<string, { groupIdx: number, subIdx: number }>>({});
  
  const noteTimersRef = useRef<Map<string, { onTimeout?: any, offTimeout?: any, isPlaying: boolean }>>(new Map());
  const activeMappingByTargetRef = useRef<Map<string, string>>(new Map());
  const sustainedNotesBySourceRef = useRef<Map<string, Set<string>>>(new Map());
  const lastTriggeredIndexByInstanceRef = useRef<Map<string, number>>(new Map());
  // 그룹 모드 전용 마지막 트리거 상태 추적
  const lastGroupTriggerByInstanceRef = useRef<Map<string, { groupIdx: number, subIdx: number }>>(new Map());
  const lastTriggerTimeByMappingRef = useRef<Map<string, number>>(new Map());
  
  // Toggle preset state tracking: key = presetId, value = isOn
  const togglePresetStateRef = useRef<Map<string, boolean>>(new Map());
  
  // Reference counting for overlapping notes (same channel+pitch from different sources)
  // Key: "channel-pitch", Value: count of active sources holding this note
  const noteRefCountRef = useRef<Map<string, number>>(new Map());

  const calculateMs = useCallback((value: number | null, unit: DurationUnit, bpm: number): number | null => {
    if (value === null || value === undefined) return null;
    if (unit === 'ms') return value;
    return (value * 60000) / (bpm || 120);
  }, []);

  const sendNoteOn = useCallback((pitch: number, velocity: number, channel: number, durationMs: number | null) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    
    const noteKey = `${channel}-${pitch}`;
    const currentCount = noteRefCountRef.current.get(noteKey) || 0;
    
    // If note is already playing, retrigger it (Note Off then Note On)
    // This ensures the new source's velocity/attack is applied
    if (currentCount > 0) {
      output.stopNote(pitch, { channels: [channel] as any });
    }
    
    // Always send Note On to retrigger with new velocity
    output.playNote(pitch, { attack: velocity, channels: [channel] as any });
    
    // Increment reference count
    noteRefCountRef.current.set(noteKey, currentCount + 1);
    
    setActiveMidiNotes(prev => {
        const filtered = prev.filter(n => !(n.pitch === pitch && n.channel === channel));
        return [...filtered, { pitch, channel, startTime: Date.now(), durationMs }];
    });
  }, [project.selectedOutputId]);

  const sendNoteOff = useCallback((pitch: number, channel: number) => {
    const output = midiService.getOutputById(project.selectedOutputId);
    if (!output) return;
    
    const noteKey = `${channel}-${pitch}`;
    const currentCount = noteRefCountRef.current.get(noteKey) || 0;
    
    if (currentCount <= 1) {
      // Last source released this note - actually send MIDI Note Off
      output.stopNote(pitch, { channels: [channel] as any });
      noteRefCountRef.current.delete(noteKey);
      setActiveMidiNotes(prev => prev.filter(n => !(n.pitch === pitch && n.channel === channel)));
    } else {
      // Other sources still holding this note - just decrement count
      noteRefCountRef.current.set(noteKey, currentCount - 1);
    }
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
    lastGroupTriggerByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
    noteRefCountRef.current.clear(); // Clear reference counts on panic
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
        const nextIndex = (currentIndex + 1) % seq.items.length;
        stepIndicesRef.current[seqId] = nextIndex;
        setStepPositions(prev => ({ ...prev, [seqId]: currentIndex }));
      }
    } else if (seq.mode === SequenceMode.AUTO) {
      if (!isRelease) {
        const msPerBeat = 60000 / (effectiveBpm || 120);
        seq.items.forEach(item => {
          setTimeout(() => triggerSequenceItem(item, effectiveBpm, mappingId, triggerValue, seqId), item.beatPosition * msPerBeat);
        });
      }
    } else if (seq.mode === SequenceMode.GROUP) {
      // GROUP 모드: 시퀀스 아이템들을 순서대로 스텝 실행
      // 아이템이 하위 시퀀스(type: 'sequence')일 경우 그 안의 아이템들을 순회
      // 아이템이 프리셋/노트(type: 'preset' | 'note')일 경우 직접 실행
      
      // 하위 시퀀스가 있는지 확인
      const hasSubSequences = seq.items.some(item => item.type === 'sequence');
      
      if (isRelease) {
        if (activeMappingByTargetRef.current.get(seqId) !== instanceId) return;
        
        if (hasSubSequences) {
          // 기존 하위 시퀀스 릴리즈 로직
          const lastGroupTrigger = lastGroupTriggerByInstanceRef.current.get(instanceId);
          if (lastGroupTrigger) {
            const groupItem = seq.items[lastGroupTrigger.groupIdx];
            if (groupItem && groupItem.type === 'sequence') {
              const subSeq = currentSong.sequences.find(s => s.id === groupItem.targetId);
              const triggeredItem = subSeq?.items[lastGroupTrigger.subIdx];
              
              if (triggeredItem && !triggeredItem.sustainUntilNext) {
                if (triggeredItem.type === 'preset' && triggeredItem.targetId) {
                  triggerPreset(triggeredItem.targetId, true, triggeredItem.overrideDuration, triggeredItem.overrideDurationUnit ?? 'ms', subSeq?.bpm || effectiveBpm, mappingId, triggerValue, false, seqId);
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
            }
          }
        } else {
          // 직접 아이템 릴리즈 로직 (프리셋/노트를 직접 포함하는 경우)
          const triggeredIdx = lastTriggeredIndexByInstanceRef.current.get(instanceId);
          if (triggeredIdx !== undefined) {
            const triggeredItem = seq.items[triggeredIdx];
            if (triggeredItem && !triggeredItem.sustainUntilNext) {
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
          }
        }
        clearSustainedNotes(seqId);
      } else {
        const now = Date.now();
        const lastTime = lastTriggerTimeByMappingRef.current.get(instanceId) || 0;
        if (now - lastTime < 30) return;
        lastTriggerTimeByMappingRef.current.set(instanceId, now);
        
        clearSustainedNotes(seqId);
        activeMappingByTargetRef.current.set(seqId, instanceId);
        
        if (hasSubSequences) {
          // 기존 하위 시퀀스 트리거 로직
          const groupState = groupIndicesRef.current[seqId] || { groupIdx: 0, subIdx: 0 };
          const groupItem = seq.items[groupState.groupIdx];
          
          if (groupItem && groupItem.type === 'sequence') {
            const subSeq = currentSong.sequences.find(s => s.id === groupItem.targetId);
            if (subSeq) {
              const item = subSeq.items[groupState.subIdx];
              if (item) {
                lastGroupTriggerByInstanceRef.current.set(instanceId, { ...groupState });
                triggerSequenceItem(item, subSeq.bpm || effectiveBpm, mappingId, triggerValue, seqId);
              }
              
              let absolutePos = 0;
              for (let i = 0; i < groupState.groupIdx; i++) {
                const prevItem = seq.items[i];
                const prevSeq = currentSong.sequences.find(s => s.id === prevItem.targetId);
                absolutePos += prevSeq?.items.length || 0;
              }
              absolutePos += groupState.subIdx;
              
              let nextSubIdx = groupState.subIdx + 1;
              let nextGroupIdx = groupState.groupIdx;
              
              if (nextSubIdx >= subSeq.items.length) {
                nextSubIdx = 0;
                nextGroupIdx = (groupState.groupIdx + 1) % seq.items.length;
              }
              
              groupIndicesRef.current[seqId] = { groupIdx: nextGroupIdx, subIdx: nextSubIdx };
              setStepPositions(prev => ({ ...prev, [seqId]: absolutePos }));
            }
          }
        } else {
          // 직접 아이템 트리거 로직 (프리셋/노트를 직접 포함하는 경우 - STEP 모드와 유사)
          const currentIndex = stepIndicesRef.current[seqId] || 0;
          const item = seq.items[currentIndex];
          if (item) {
            lastTriggeredIndexByInstanceRef.current.set(instanceId, currentIndex);
            triggerSequenceItem(item, effectiveBpm, mappingId, triggerValue, seqId);
          }
          const nextIndex = (currentIndex + 1) % seq.items.length;
          stepIndicesRef.current[seqId] = nextIndex;
          setStepPositions(prev => ({ ...prev, [seqId]: currentIndex }));
        }
      }
    }
  }, [currentSong, triggerPreset, triggerSequenceItem, sendNoteOff, clearSustainedNotes]);

  const resetAllSequences = useCallback(() => {
    stepIndicesRef.current = {};
    groupIndicesRef.current = {};
    setStepPositions(prev => {
        const reset: Record<string, number> = {};
        Object.keys(prev).forEach(key => reset[key] = -1);
        return reset;
    });
    sustainedNotesBySourceRef.current.forEach((_, id) => clearSustainedNotes(id));
    lastTriggeredIndexByInstanceRef.current.clear();
    lastGroupTriggerByInstanceRef.current.clear();
    activeMappingByTargetRef.current.clear();
    lastTriggerTimeByMappingRef.current.clear();
  }, [clearSustainedNotes]);

  const triggerTogglePreset = useCallback((presetId: string, mappingId: string = 'ui', triggerValue: string | number = 'direct') => {
    const preset = currentSong.presets.find(p => p.id === presetId);
    if (!preset) return;
    
    const isCurrentlyOn = togglePresetStateRef.current.get(presetId) || false;
    
    if (isCurrentlyOn) {
      // Turn OFF: send note off for all notes in preset
      preset.notes.forEach(note => {
        sendNoteOff(note.pitch, note.channel);
      });
      togglePresetStateRef.current.set(presetId, false);
    } else {
      // Turn ON: send note on for all notes in preset (sustained indefinitely)
      preset.notes.forEach(note => {
        sendNoteOn(note.pitch, note.velocity, note.channel, null);
      });
      togglePresetStateRef.current.set(presetId, true);
    }
    
    return !isCurrentlyOn; // Return new state
  }, [currentSong, sendNoteOn, sendNoteOff]);

  const getTogglePresetState = useCallback((presetId: string): boolean => {
    return togglePresetStateRef.current.get(presetId) || false;
  }, []);

  return { activeMidiNotes, stepPositions, sendNoteOn, sendNoteOff, stopAllNotes, triggerPreset, triggerSequence, resetAllSequences, triggerTogglePreset, getTogglePresetState };
};
