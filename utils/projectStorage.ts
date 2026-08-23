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
