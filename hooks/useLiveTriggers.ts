import { useCallback, useEffect, useMemo, useState } from 'react';
import { Song, InputMapping } from '../types';
import { midiService } from '../webMidiService';
import { isInputCaptured, isTypingTarget, normalizeKey } from '../utils/inputCapture';

export type TriggerFn = (
  mappingId: string,
  type: 'preset' | 'sequence' | 'switch_scene' | 'toggle_preset',
  targetId: string,
  isRelease: boolean,
  triggerValue: string | number
) => void;

/**
 * 현재 곡의 매핑을 키보드/MIDI 입력에 물려 주는 훅.
 *
 * 원래 이 로직은 Performance.tsx(Live 탭) 안에 있어서 **Live 탭을 보고 있을 때만**
 * 연주가 됐다. Editor 나 Settings 로 넘어가면 건반이 죽었다. 무대에서 곡을 손보다가
 * 그대로 연주로 넘어가는 흐름이 끊기므로 App 레벨로 올려서 항상 살아 있게 한다.
 *
 * 대신 입력을 직접 받아야 하는 상황에서는 비켜 준다:
 *  - 매핑 러닝 모드 (Settings / MappingEditor) → `isInputCaptured()`
 *  - 글자 입력 중 (input/textarea/select/contenteditable) → 키보드만 무시
 *
 * 반환하는 pressed 집합은 Live 탭의 하이라이트 표시에 쓰인다.
 */
export function useLiveTriggers(song: Song, selectedInputId: string, onTrigger: TriggerFn) {
  const [pressedKeys, setPressedKeys] = useState<Set<string>>(new Set());
  // "channel-pitch" 형태로 저장해 채널 정보를 함께 들고 간다
  const [pressedMidiNotes, setPressedMidiNotes] = useState<Set<string>>(new Set());

  const activeScene = useMemo(
    () => song.scenes.find(s => s.id === song.activeSceneId),
    [song.scenes, song.activeSceneId]
  );

  const activeMappings = useMemo(
    () =>
      song.mappings.filter(
        m => m.isEnabled && (m.scope === 'global' || (activeScene && activeScene.mappingIds.includes(m.id)))
      ),
    [song.mappings, activeScene]
  );

  const findMappings = useCallback(
    (type: 'keyboard' | 'midi', value: string | number, channel?: number): InputMapping[] => {
      return activeMappings.filter(m => {
        if (type === 'keyboard') {
          const allowedValues = String(m.keyboardValue).toLowerCase().split(',').map(v => v.trim());
          return allowedValues.includes(String(value).toLowerCase());
        }

        if (channel !== undefined) {
          const channelMatch = m.midiChannel === 0 || m.midiChannel === channel;
          if (!channelMatch) return false;
        }

        if (m.isMidiRange) {
          const numValue = Number(value);
          return numValue >= m.midiRangeStart && numValue <= m.midiRangeEnd;
        }

        const allowedValues = String(m.midiValue).toLowerCase().split(',').map(v => v.trim());
        return allowedValues.includes(String(value).toLowerCase());
      });
    },
    [activeMappings]
  );

  // ── 컴퓨터 키보드 ────────────────────────────────────────────────────
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isInputCaptured() || isTypingTarget(e.target)) return;
      const key = normalizeKey(e.key);
      const mappings = findMappings('keyboard', key);
      if (mappings.length === 0) return;
      setPressedKeys(prev => new Set(prev).add(key));
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false, key));
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      // 릴리즈는 조건 없이 흘려보낸다. 눌린 상태였는지 setState 업데이터로 판별하려 들면 안 된다 —
      // React 는 그 함수를 나중에 실행하므로 결과를 여기서 읽을 수 없고, 그러면 duration: null 인
      // 노트가 노트오프를 못 받아 계속 울린다. 중복 릴리즈는 엔진이 activeMappingByTarget 으로 거른다.
      const keyLower = normalizeKey(e.key);
      const mappings = findMappings('keyboard', keyLower);
      if (mappings.length === 0) return;
      setPressedKeys(prev => {
        if (!prev.has(keyLower)) return prev;
        const next = new Set(prev);
        next.delete(keyLower);
        return next;
      });
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true, keyLower));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [findMappings, onTrigger]);

  // ── MIDI ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const input = midiService.getInputById(selectedInputId);
    if (!input) return;

    const onNoteOn = (e: any) => {
      if (isInputCaptured()) return;
      const pitch = e.note.number;
      const channel = e.message.channel;
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length === 0) return;
      setPressedMidiNotes(prev => new Set(prev).add(`${channel}-${pitch}`));
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, false, pitch));
    };

    const onNoteOff = (e: any) => {
      const pitch = e.note.number;
      const channel = e.message.channel;
      const noteKey = `${channel}-${pitch}`;
      const mappings = findMappings('midi', pitch, channel);
      if (mappings.length === 0) return;
      // 위 keyup 과 같은 이유로 조건 없이 릴리즈를 보낸다
      setPressedMidiNotes(prev => {
        if (!prev.has(noteKey)) return prev;
        const next = new Set(prev);
        next.delete(noteKey);
        return next;
      });
      mappings.forEach(m => onTrigger(m.id, m.actionType, m.actionTargetId, true, pitch));
    };

    input.addListener('noteon', onNoteOn);
    input.addListener('noteoff', onNoteOff);
    return () => {
      input.removeListener('noteon', onNoteOn);
      input.removeListener('noteoff', onNoteOff);
    };
  }, [selectedInputId, findMappings, onTrigger]);

  return { pressedKeys, pressedMidiNotes };
}
