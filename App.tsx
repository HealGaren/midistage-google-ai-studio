
import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { midiService } from './webMidiService';
import { Song, ProjectData, GlobalMapping, GlobalActionType, CCState, CCMapping, ChartTakeEvent } from './types';
import { useMidiEngine } from './hooks/useMidiEngine';
import { useLiveTriggers } from './hooks/useLiveTriggers';
import { useDawClock } from './hooks/useDawClock';
import { useConductor } from './hooks/useConductor';
import { useTakeRecorder } from './hooks/useTakeRecorder';
import { buildChartEvents, chartSettings, activeMappingsFor, beatMs as beatMsOf } from './utils/chart';
import { isInputCaptured, isTypingTarget, normalizeKey } from './utils/inputCapture';
import { getLastProjectName, loadSavedProject, audioUrl } from './utils/projectStorage';
import { usePrefs } from './utils/prefs';
import Navigation from './components/Navigation';
import Editor from './components/Editor';
import Performance from './components/Performance';
import GameMode from './components/GameMode';
import Settings from './components/Settings';
import { v4 as uuidv4 } from 'uuid';

const createDefaultSong = (name: string): Song => {
  const sceneId = uuidv4();
  return {
    id: uuidv4(),
    name,
    bpm: 120,
    presets: [],
    presetFolders: [],
    sequences: [],
    mappings: [],
    ccMappings: [],
    scenes: [{ id: sceneId, name: "Default Scene", mappingIds: [] }],
    activeSceneId: sceneId
  };
};

const DEFAULT_PROJECT: ProjectData = {
  name: "New Performance Set",
  songs: [createDefaultSong("Opening Track")],
  selectedInputId: '',
  selectedOutputId: '',
  globalMappings: [],
  globalCCMappings: []
};

interface MidiLogEntry {
  id: string;
  timestamp: Date;
  type: 'noteon' | 'noteoff' | 'cc';
  channel: number;
  note?: number;
  velocity?: number;
  cc?: number;
  value?: number;
}

// CC value processing with curve
const applyCurve = (value: number, curveValue: number): number => {
  // curveValue: 0 = exponential down, 0.5 = linear, 1 = exponential up
  const normalized = value / 127;
  let curved: number;
  if (curveValue === 0.5) {
    curved = normalized;
  } else if (curveValue < 0.5) {
    // Exponential curve (starts slow, ends fast)
    const exp = 1 + (0.5 - curveValue) * 4; // 1 to 3
    curved = Math.pow(normalized, exp);
  } else {
    // Logarithmic curve (starts fast, ends slow)
    const exp = 1 / (1 + (curveValue - 0.5) * 4); // 1 to 0.33
    curved = Math.pow(normalized, exp);
  }
  return Math.round(curved * 127);
};

const processCCValue = (inputValue: number, mapping: CCMapping): number => {
  let value = inputValue;
  
  // Apply curve first
  if (mapping.curveEnabled) {
    value = applyCurve(value, mapping.curveValue);
  }
  
  // Apply range mapping
  if (mapping.rangeEnabled) {
    const normalized = value / 127;
    value = Math.round(mapping.rangeMin + normalized * (mapping.rangeMax - mapping.rangeMin));
  }
  
  return Math.max(0, Math.min(127, value));
};

const App: React.FC = () => {
  const [project, setProject] = useState<ProjectData>(DEFAULT_PROJECT);
  const [currentSongId, setCurrentSongId] = useState<string>(DEFAULT_PROJECT.songs[0].id);
  const [activeTab, setActiveTab] = useState<'editor' | 'performance' | 'game' | 'settings'>('performance');
  const [prefs, updatePrefs] = usePrefs();
  // 포커스 모드: 무대용. 사이드바를 숨기고 브라우저 전체화면. (브라우저 전체화면을 빠져나오면 같이 풀린다)
  const [focus, setFocus] = useState(false);
  // 단일 진실 = document.fullscreenElement. 버튼/전역 액션은 요청만 하고 상태는 change 이벤트로 따라온다.
  const toggleFocus = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    else document.documentElement.requestFullscreen?.().catch(() => {});
  }, []);
  useEffect(() => {
    const onChange = () => setFocus(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);
  const [isMidiReady, setIsMidiReady] = useState(false);
  const [showMidiMonitor, setShowMidiMonitor] = useState(false);
  const [midiLogs, setMidiLogs] = useState<MidiLogEntry[]>([]);
  const [ccStates, setCCStates] = useState<Record<string, number>>({}); // key: "channel-cc", value: 0-127

  // 주의: currentSongId 는 프로젝트를 갈아끼운 직후 존재하지 않는 곡을 가리킬 수 있다.
  // 표시는 아래 폴백 덕에 멀쩡하지만, 곡을 "수정"할 때 currentSongId 로 찾으면
  // 아무 곡과도 매칭되지 않아 조용히 실패한다. 그럴 땐 currentSong.id 를 쓸 것.
  const currentSong = project.songs.find(s => s.id === currentSongId) || project.songs[0];
  const { activeMidiNotes, stepPositions, sendNoteOn, sendNoteOff, stopAllNotes, triggerPreset, triggerSequence, resetAllSequences, triggerTogglePreset, getTogglePresetState, setSequenceStep } = useMidiEngine(project, currentSong);
  const currentSongRef = useRef(currentSong);
  currentSongRef.current = currentSong;

  useEffect(() => {
    midiService.init().then(() => setIsMidiReady(true)).catch(() => setIsMidiReady(false));
  }, []);

  // 마지막으로 폴더에서 열었던 프로젝트를 자동 복구 (dev 서버가 있을 때만 동작).
  // 새로고침/재시작으로 세트가 통째로 사라지는 사고를 막는다. 저장은 여전히 명시적.
  // 응답이 오기 전에 사용자가 이미 뭔가 바꿨으면(임포트, 장치 선택) 덮어쓰지 않는다.
  const projectRef = useRef(project);
  projectRef.current = project;
  useEffect(() => {
    const last = getLastProjectName();
    if (!last) return;
    loadSavedProject(last)
      .then(loaded => {
        if (projectRef.current !== DEFAULT_PROJECT) return;
        if (!Array.isArray(loaded.songs) || loaded.songs.length === 0) return;
        // 손으로 고친 파일이 필드를 빠뜨려도 렌더가 터지지 않게 배열들을 채워 준다
        const songs = loaded.songs.map((s: Song) => ({
          ...s, presets: s.presets || [], presetFolders: s.presetFolders || [], sequences: s.sequences || [],
          mappings: s.mappings || [], ccMappings: s.ccMappings || [], scenes: s.scenes?.length ? s.scenes : [{ id: uuidv4(), name: 'Default Scene', mappingIds: [] }],
        }));
        setProject({ ...loaded, songs, globalMappings: loaded.globalMappings || [], globalCCMappings: loaded.globalCCMappings || [] });
        setCurrentSongId(songs[0].id);
      })
      .catch(() => { /* 정적 빌드 등 API 가 없으면 조용히 무시 */ });
  }, []);

  const handleUpdateProject = useCallback((updater: (prev: ProjectData) => ProjectData) => setProject(updater), []);

  const handleUpdateSong = useCallback((updated: Song) => {
    setProject(prev => ({
      ...prev,
      songs: prev.songs.map(s => s.id === updated.id ? updated : s)
    }));
  }, []);

  // ── Game 모드: 차트 → 이벤트, 지휘자(실시간 싱크 시계), 녹화기, 연습 음원 ──
  // App 레벨에 두어 어느 탭에 있든 시계가 흐르고 녹화/재생이 유지된다.
  // 이벤트는 차트·매핑·시퀀스·박자표에서만 파생된다 — 씬 전환이나 테이크 저장으로는 다시 만들지 않는다.
  const chartEvents = useMemo(() => buildChartEvents(currentSong),
    [currentSong.chart?.sections, currentSong.chart?.patterns, currentSong.mappings, currentSong.sequences, currentSong.beatsPerBar]); // eslint-disable-line react-hooks/exhaustive-deps
  const chartSetting = useMemo(() => chartSettings(currentSong), [currentSong.chart?.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const { conductor, snapshot: chartSnapshot } = useConductor({ song: currentSong, events: chartEvents, settings: chartSetting, setSequenceStep });
  const recorder = useTakeRecorder(currentSong, handleUpdateSong);
  const recorderRef = useRef(recorder);
  recorderRef.current = recorder;
  // 멈춘 상태에서 "첫 노트로 자동 시작"은 Game 탭을 보고 있을 때만
  useEffect(() => { conductor.setAutoStart(activeTab === 'game'); }, [conductor, activeTab]);
  useEffect(() => { if (import.meta.env.DEV) (window as any).__conductor = conductor; }, [conductor]);

  // 연습 음원 <audio> — 탭을 옮겨도 끊기지 않게 App 이 렌더한다
  const audioRef = useRef<HTMLAudioElement>(null);
  const [localAudioUrl, setLocalAudioUrl] = useState<string | null>(null);
  useEffect(() => { setLocalAudioUrl(null); }, [currentSong.id]);
  const audioFile = currentSong.chart?.audio?.fileName;
  const audioSrc = localAudioUrl || (audioFile ? audioUrl(audioFile) : undefined);
  useEffect(() => { conductor.attachAudioElement(audioRef.current); }, [conductor, audioSrc]);
  const handleAudioSeeked = useCallback(() => {
    const a = audioRef.current;
    if (!a || conductor.getMode() !== 'audio') return;
    const s = currentSongRef.current;
    const offset = s.chart?.audio?.offsetMs || 0;
    conductor.seekBeat((a.currentTime * 1000 - offset) / beatMsOf(s.chart?.audio?.bpm || s.bpm, s.beatUnit || 4));
  }, [conductor]);

  const dispatchTrigger = useCallback((mappingId: string, actionType: 'preset' | 'sequence' | 'switch_scene' | 'toggle_preset', targetId: string, isRelease: boolean, triggerValue: string | number, fromReplay = false) => {
    if (!fromReplay) recorderRef.current.capture({ mappingId, release: isRelease, value: triggerValue });
    // 차트와 대조: 누르는 순간 "이게 차트의 어느 노트인지" 정해 싱크를 맞추고, 시퀀스면
    // 엔진 스텝을 그 노트로 맞춘 뒤 친다(놓친 노트가 있어도 맞는 음이 나오도록).
    if (!isRelease) conductor.onPress(mappingId);

    // toggle_preset은 릴리즈 무시, 누를 때만 토글
    if (actionType === 'toggle_preset') {
      if (!isRelease) {
        triggerTogglePreset(targetId, mappingId, triggerValue);
      }
      return;
    }

    if (isRelease && actionType !== 'switch_scene') {
      if (actionType === 'preset') triggerPreset(targetId, true, undefined, 'ms', currentSong.bpm, mappingId, triggerValue, false);
      else if (actionType === 'sequence') triggerSequence(targetId, mappingId, true, triggerValue);
      return;
    }

    if (!isRelease) {
      if (actionType === 'preset') {
        triggerPreset(targetId, false, undefined, 'ms', currentSong.bpm, mappingId, triggerValue, false);
      } else if (actionType === 'sequence') {
        triggerSequence(targetId, mappingId, false, triggerValue);
      } else if (actionType === 'switch_scene') {
        handleUpdateSong({ ...currentSong, activeSceneId: targetId });
      }
    }
  }, [triggerPreset, triggerSequence, triggerTogglePreset, currentSong, handleUpdateSong, conductor]);
  // 키보드/MIDI/마우스가 쓰는 5-인자 형태 (fromReplay 기본값 false)
  const handleActionTrigger = dispatchTrigger;

  // 테이크 재생: 녹화된 입력을 같은 파이프라인으로 흘려보낸다(엔진·지휘자가 그때처럼 반응)
  const dispatchRef = useRef(dispatchTrigger);
  dispatchRef.current = dispatchTrigger;
  const handleReplayTake = useCallback((takeId: string) => {
    recorderRef.current.replay(takeId, (ev: ChartTakeEvent) => {
      const m = currentSongRef.current.mappings.find(x => x.id === ev.mappingId);
      if (m) dispatchRef.current(m.id, m.actionType, m.actionTargetId, ev.release, ev.value, true);
    }, startBeat => { conductor.seekBeat(startBeat); conductor.setRunning(true); });
  }, [conductor]);

  // 곡 매핑 → 키보드/MIDI 연결. App 레벨에 두었기 때문에 Editor·Settings 탭에서도
  // 연주가 그대로 살아 있다. (매핑 러닝 중이거나 글자를 입력 중일 때만 비켜난다)
  const { pressedKeys, pressedMidiNotes } = useLiveTriggers(currentSong, project.selectedInputId, handleActionTrigger);

  // Game 탭의 폴백 레인(차트가 없을 때): 지금 씬에서 살아 있는 매핑
  const activeMappings = useMemo(() => activeMappingsFor(currentSong), [currentSong.mappings, currentSong.scenes, currentSong.activeSceneId]); // eslint-disable-line react-hooks/exhaustive-deps

  // DAW 가 흘려보내는 MIDI 클럭에서 읽은 템포와 박 (표시 전용).
  // MIDI 클럭은 4분음표당 24틱이므로, 8분음표를 한 박으로 세는 6/8 같은 곡은 12틱이 한 박이다.
  const beatUnit = currentSong?.beatUnit || 4;
  const { bpm: dawBpm, beat: dawBeat } = useDawClock(project.selectedClockInputId, (24 * 4) / beatUnit);

  const handleGlobalActionTrigger = useCallback((action: GlobalMapping) => {
    if (!action.isEnabled) return;
    const currentIndex = project.songs.findIndex(s => s.id === currentSongId);
    switch (action.actionType) {
      case 'PREV_SONG': if (currentIndex > 0) setCurrentSongId(project.songs[currentIndex - 1].id); break;
      case 'NEXT_SONG': if (currentIndex < project.songs.length - 1) setCurrentSongId(project.songs[currentIndex + 1].id); break;
      case 'GOTO_SONG': const targetIdx = (action.actionValue || 1) - 1; if (project.songs[targetIdx]) setCurrentSongId(project.songs[targetIdx].id); break;
      case 'RESET_SEQUENCES': resetAllSequences(); break;
      // Game 모드 차트 조작
      case 'CHART_SYNC_BAR': conductor.syncBar(); break;
      case 'CHART_SYNC_BEAT': conductor.syncBeat(); break;
      case 'CHART_NEXT_NOTE': conductor.nextNote(); break;
      case 'CHART_PREV_NOTE': conductor.prevNote(); break;
      case 'CHART_NEXT_BAR': conductor.nextBar(); break;
      case 'CHART_PREV_BAR': conductor.prevBar(); break;
      case 'CHART_NEXT_SECTION': conductor.nextSection(); break;
      case 'CHART_PREV_SECTION': conductor.prevSection(); break;
      case 'CHART_TOGGLE_RUN': conductor.toggleRun(); break;
      case 'CHART_RESTART': conductor.restart(); break;
      case 'TOGGLE_FOCUS': toggleFocus(); break;
    }
  }, [project.songs, currentSongId, resetAllSequences, conductor, toggleFocus]);

  // Global Keyboard Triggers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.repeat) return;
      if (isInputCaptured() || isTypingTarget(e.target)) return;
      const key = normalizeKey(e.key);
      let handled = false;
      project.globalMappings.forEach(gm => {
        const allowedKeys = gm.keyboardValue.toLowerCase().split(',').map(v => v.trim());
        if (allowedKeys.includes(key)) {
          handleGlobalActionTrigger(gm);
          handled = true;
        }
      });
      // Space/화살표 등이 페이지를 스크롤하거나 버튼을 누르지 않게
      if (handled) e.preventDefault();
    };
    // Space 는 포커스된 버튼을 keyup 에서 클릭한다(방금 마우스로 누른 Run/Stop 같은 것).
    // 전역 키로 쓰는 동안은 그 기본 동작도 막는다.
    const handleKeyUp = (e: KeyboardEvent) => {
      if (isInputCaptured() || isTypingTarget(e.target)) return;
      const key = normalizeKey(e.key);
      const mapped = project.globalMappings.some(gm => gm.keyboardValue.toLowerCase().split(',').map(v => v.trim()).includes(key));
      if (mapped) e.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [project.globalMappings, handleGlobalActionTrigger]);

  // Live 탭의 Launchkey 그림에 "차트상 다음에 누를 키"를 비춰 주기 위한 매핑 id 들
  const expectedMappingIds = useMemo(() => chartSnapshot.running ? new Set(chartSnapshot.nextMappingIds) : undefined, [chartSnapshot.nextMappingIds, chartSnapshot.running]);

  // Global MIDI Triggers + MIDI Monitor Logging
  useEffect(() => {
    const input = midiService.getInputById(project.selectedInputId);
    if (!input) return;

    const addMidiLog = (entry: Omit<MidiLogEntry, 'id' | 'timestamp'>) => {
      setMidiLogs(prev => {
        const newEntry: MidiLogEntry = { ...entry, id: uuidv4(), timestamp: new Date() };
        const updated = [newEntry, ...prev];
        return updated.slice(0, 20); // Keep only last 20 entries
      });
    };

    const onNoteOn = (e: any) => {
      const pitch = String(e.note.number);
      const channel = e.message.channel;

      // Log to MIDI monitor
      addMidiLog({ type: 'noteon', channel, note: e.note.number, velocity: e.note.rawAttack });

      // 매핑 러닝 중에는 그 노트가 러닝 대상이므로 액션으로 흘려보내지 않는다
      // (모니터 로그는 남긴다 — 무엇이 들어왔는지 보여야 러닝이 편하다)
      if (isInputCaptured()) return;

      project.globalMappings.forEach(gm => {
        const channelMatch = gm.midiChannel === 0 || gm.midiChannel === channel;
        if (!channelMatch) return;

        const allowedNotes = gm.midiValue.toLowerCase().split(',').map(v => v.trim());
        if (allowedNotes.includes(pitch)) {
          handleGlobalActionTrigger(gm);
        }
      });
    };

    const onNoteOff = (e: any) => {
      addMidiLog({ type: 'noteoff', channel: e.message.channel, note: e.note.number, velocity: 0 });
    };

    const onCC = (e: any) => {
      const channel = e.message.channel;
      const cc = e.controller.number;
      const value = e.rawValue;
      
      addMidiLog({ type: 'cc', channel, cc, value });
      
      // Update CC state for visual display
      setCCStates(prev => ({ ...prev, [`${channel}-${cc}`]: value }));
      
      // Process CC mappings and send to output
      const output = midiService.getOutputById(project.selectedOutputId);
      if (!output) return;
      
      // Combine global and song CC mappings
      const allCCMappings = [...(project.globalCCMappings || []), ...(currentSong.ccMappings || [])];
      
      allCCMappings.forEach(mapping => {
        if (!mapping.isEnabled) return;
        const channelMatch = mapping.inputChannel === 0 || mapping.inputChannel === channel;
        if (!channelMatch || mapping.inputCC !== cc) return;
        
        const processedValue = processCCValue(value, mapping);
        const outChannel = mapping.outputRemapEnabled ? mapping.outputChannel : channel;
        const outCC = mapping.outputRemapEnabled ? mapping.outputCC : cc;
        
        output.sendControlChange(outCC, processedValue, { channels: [outChannel] as any });
      });
    };

    input.addListener('noteon', onNoteOn);
    input.addListener('noteoff', onNoteOff);
    input.addListener('controlchange', onCC);
    return () => {
      input.removeListener('noteon', onNoteOn);
      input.removeListener('noteoff', onNoteOff);
      input.removeListener('controlchange', onCC);
    };
  }, [project.selectedInputId, project.selectedOutputId, project.globalMappings, project.globalCCMappings, currentSong.ccMappings, handleGlobalActionTrigger]);

  return (
    <div className="flex flex-col h-screen overflow-hidden bg-slate-950 text-slate-100 font-sans">
      <header className={`flex items-center justify-between bg-slate-900 border-b border-slate-800 shadow-xl z-20 ${focus ? 'px-4 py-1.5' : 'px-6 py-4'}`}>
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-indigo-600 rounded-lg flex items-center justify-center font-bold text-xl shadow-[0_0_20px_rgba(79,70,229,0.5)]">M</div>
          <div><h1 className="text-lg font-bold tracking-tight">MidiStage</h1><p className="text-xs text-slate-400 font-medium">{focus ? `${project.name} · ${currentSong.name}` : project.name}</p></div>
        </div>
        <div className="flex gap-2">
          {(['performance', 'game', 'editor', 'settings'] as const).map(tab => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-indigo-600 text-white shadow-lg' : 'hover:bg-slate-800 text-slate-500'}`}>{tab === 'performance' ? 'Live' : tab === 'game' ? 'Game' : tab === 'editor' ? 'Editor' : 'Settings'}</button>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => setShowMidiMonitor(true)} className="px-5 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">MIDI Test</button>
          <button onClick={toggleFocus} title="포커스 모드: 사이드바 숨김 + 전체화면 (무대용)" className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95 ${focus ? 'bg-amber-500 text-slate-900' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}>{focus ? '⛶ Exit' : '⛶ Focus'}</button>
          <button onClick={stopAllNotes} className="px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-xl text-[10px] font-black uppercase tracking-[0.2em] shadow-lg transition-all active:scale-95">Panic</button>
        </div>
      </header>

      {/* MIDI Monitor Modal */}
      {showMidiMonitor && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center" onClick={() => setShowMidiMonitor(false)}>
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-6 w-[500px] max-h-[600px] shadow-2xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-black text-white">MIDI Monitor</h2>
              <div className="flex gap-2">
                <button onClick={() => setMidiLogs([])} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-bold rounded-lg">Clear</button>
                <button onClick={() => setShowMidiMonitor(false)} className="px-3 py-1 bg-slate-700 hover:bg-slate-600 text-xs font-bold rounded-lg">Close</button>
              </div>
            </div>
            <p className="text-xs text-slate-500 mb-4">Press any MIDI key to see input data. Last 20 entries shown.</p>
            <div className="space-y-1 max-h-[400px] overflow-y-auto custom-scrollbar">
              {midiLogs.length === 0 ? (
                <div className="text-center text-slate-600 py-8 text-sm">No MIDI input yet...</div>
              ) : (
                midiLogs.map(log => (
                  <div key={log.id} className={`flex items-center gap-3 px-3 py-2 rounded-lg text-xs font-mono ${
                    log.type === 'noteon' ? 'bg-green-900/30 text-green-300' : 
                    log.type === 'noteoff' ? 'bg-slate-800/50 text-slate-400' : 
                    'bg-blue-900/30 text-blue-300'
                  }`}>
                    <span className="text-slate-500 w-16">{log.timestamp.toLocaleTimeString()}</span>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-black uppercase ${
                      log.type === 'noteon' ? 'bg-green-600' : 
                      log.type === 'noteoff' ? 'bg-slate-600' : 
                      'bg-blue-600'
                    }`}>{log.type}</span>
                    <span className="text-slate-300">CH <span className="text-white font-bold">{log.channel}</span></span>
                    {log.note !== undefined && <span className="text-slate-300">Note <span className="text-white font-bold">{log.note}</span></span>}
                    {log.velocity !== undefined && log.type === 'noteon' && <span className="text-slate-300">Vel <span className="text-white font-bold">{log.velocity}</span></span>}
                    {log.cc !== undefined && <span className="text-slate-300">CC <span className="text-white font-bold">{log.cc}</span></span>}
                    {log.value !== undefined && log.type === 'cc' && <span className="text-slate-300">Val <span className="text-white font-bold">{log.value}</span></span>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
      <div className="flex flex-1 overflow-hidden">
        {!focus && <Navigation songs={project.songs} currentSongId={currentSongId} onSelectSong={setCurrentSongId} onUpdateProject={handleUpdateProject} />}
        <main className="flex-1 relative overflow-auto p-8 bg-slate-950 custom-scrollbar">
          {activeTab === 'editor' && <Editor song={currentSong} onUpdateSong={handleUpdateSong} sendNoteOn={sendNoteOn} sendNoteOff={sendNoteOff} selectedInputId={project.selectedInputId} />}
          {activeTab === 'performance' && <Performance song={currentSong} activeNotes={activeMidiNotes} stepPositions={stepPositions} onTrigger={handleActionTrigger} selectedInputId={project.selectedInputId} onUpdateSong={handleUpdateSong} ccStates={ccStates} getTogglePresetState={getTogglePresetState} globalCCMappings={project.globalCCMappings} pressedKeys={pressedKeys} pressedMidiNotes={pressedMidiNotes} dawBpm={dawBpm} dawBeat={dawBeat} expectedMappingIds={expectedMappingIds} prefs={prefs} onUpdatePrefs={updatePrefs} />}
          {activeTab === 'game' && <GameMode song={currentSong} conductor={conductor} snapshot={chartSnapshot} settings={chartSetting} events={chartEvents} pressedKeys={pressedKeys} pressedMidiNotes={pressedMidiNotes} onUpdateSong={handleUpdateSong} recorder={recorder} onReplayTake={handleReplayTake} activeMappings={activeMappings} audioRef={audioRef} audioSrc={audioSrc} audioFile={audioFile} onPickLocalAudio={f => setLocalAudioUrl(URL.createObjectURL(f))} />}
          {/* 연습 음원. Game 탭 밖에서도 재생이 이어지도록 여기 둔다 */}
          <audio ref={audioRef} src={audioSrc} preload="auto" onSeeked={handleAudioSeeked} className="hidden" />
          {activeTab === 'settings' && <Settings project={project} onUpdateProject={handleUpdateProject} prefs={prefs} onUpdatePrefs={updatePrefs} />}
        </main>
      </div>
    </div>
  );
};

export default App;
