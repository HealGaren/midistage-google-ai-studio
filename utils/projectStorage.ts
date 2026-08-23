import { ProjectData } from '../types';

// Client for the dev-server's /api/projects endpoint (see vite.config.ts).
// Lets the app list / load / save / delete project files in the local
// gitignored ./projects folder instead of using browser download/upload.

const BASE = '/api/projects';

export interface SavedProjectMeta {
  name: string;   // file name, e.g. "My_Set.json"
  size: number;   // bytes
  mtime: number;  // last-modified epoch ms
}

// Ensure a user-typed name becomes a clean "<name>.json" file name.
export function toFileName(name: string): string {
  const trimmed = (name || 'project').trim().replace(/[\\/:*?"<>|]/g, '_');
  return trimmed.toLowerCase().endsWith('.json') ? trimmed : `${trimmed}.json`;
}

export async function listSavedProjects(): Promise<SavedProjectMeta[]> {
  const res = await fetch(BASE);
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return res.json();
}

export async function loadSavedProject(name: string): Promise<ProjectData> {
  const res = await fetch(`${BASE}/${encodeURIComponent(name)}`);
  if (!res.ok) throw new Error(`Load failed (${res.status})`);
  return res.json();
}

export async function saveProjectToFolder(name: string, project: ProjectData): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(toFileName(name))}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(project, null, 2),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `Save failed (${res.status})`);
  }
}

export async function deleteSavedProject(name: string): Promise<void> {
  const res = await fetch(`${BASE}/${encodeURIComponent(name)}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}

// ── 마지막으로 폴더에서 연 프로젝트 기억 ──
// 새로고침하면 프로젝트가 통째로 날아가는 게 무대에서 제일 위험해서, 마지막에 Load/Save 한
// 파일 이름만 기억했다가 앱이 뜰 때 dev 서버에서 다시 읽어온다. 저장은 여전히 명시적.
const LAST_KEY = 'midistage.lastProjectFile';

export function rememberLastProject(name: string): void {
  try { localStorage.setItem(LAST_KEY, name); } catch { /* private mode 등 */ }
}

export function getLastProjectName(): string | null {
  try { return localStorage.getItem(LAST_KEY); } catch { return null; }
}

export function forgetLastProject(): void {
  try { localStorage.removeItem(LAST_KEY); } catch { /* noop */ }
}

// ── 연습용 음원 (Game 모드). 서버는 vite.config.ts 의 localAudioApi ──
const AUDIO_BASE = '/api/audio';

export interface SavedAudioMeta { name: string; size: number; }

export function audioUrl(fileName: string): string {
  return `${AUDIO_BASE}/${encodeURIComponent(fileName)}`;
}

export async function listAudioFiles(): Promise<SavedAudioMeta[]> {
  const res = await fetch(AUDIO_BASE);
  if (!res.ok) throw new Error(`List failed (${res.status})`);
  return res.json();
}

export async function uploadAudioFile(file: File): Promise<string> {
  const name = file.name.replace(/[\\/:*?"<>|]/g, '_');
  const res = await fetch(audioUrl(name), { method: 'PUT', body: file });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({}));
    throw new Error(msg.error || `Upload failed (${res.status})`);
  }
  return name;
}

export async function deleteAudioFile(name: string): Promise<void> {
  const res = await fetch(audioUrl(name), { method: 'DELETE' });
  if (!res.ok) throw new Error(`Delete failed (${res.status})`);
}
