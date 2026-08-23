import { useCallback, useEffect, useState } from 'react';

// ─────────────────────────────────────────────────────────────────────────────
// 앱 전역 UI 취향. 프로젝트 데이터가 아니라 이 브라우저의 설정이라 localStorage 에 둔다.
// (곡/차트 데이터는 여전히 명시적으로 Save 해야 한다)
// ─────────────────────────────────────────────────────────────────────────────
export interface UiPrefs {
  liveView: 'device' | 'grid';
  liveShowLegend: boolean;     // Launchkey 뷰 아래 매핑 목록
  liveShowNoteNames: boolean;  // 건반의 음이름(C3…)
  showBeatLeds: boolean;       // Live 탭의 Song/DAW 박 LED
  showControllers: boolean;    // Live 탭 노브/모듈레이션 패널
  showLiveMonitor: boolean;    // Live 탭 울리는 노트 목록
}

const KEY = 'midistage.prefs';
export const DEFAULT_PREFS: UiPrefs = {
  liveView: 'device', liveShowLegend: true, liveShowNoteNames: true,
  showBeatLeds: true, showControllers: true, showLiveMonitor: true,
};

export function loadPrefs(): UiPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    const legacyView = localStorage.getItem('midistage.liveView') as UiPrefs['liveView'] | null;
    return { ...DEFAULT_PREFS, ...(legacyView ? { liveView: legacyView } : {}), ...(raw ? JSON.parse(raw) : {}) };
  } catch { return DEFAULT_PREFS; }
}

export function usePrefs(): [UiPrefs, (patch: Partial<UiPrefs>) => void] {
  const [prefs, setPrefs] = useState<UiPrefs>(loadPrefs);
  useEffect(() => { try { localStorage.setItem(KEY, JSON.stringify(prefs)); } catch { /* noop */ } }, [prefs]);
  const update = useCallback((patch: Partial<UiPrefs>) => setPrefs(p => ({ ...p, ...patch })), []);
  return [prefs, update];
}
