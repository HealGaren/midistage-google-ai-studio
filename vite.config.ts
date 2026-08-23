/// <reference types="vitest/config" />
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

const PROJECTS_DIR = path.resolve(__dirname, 'projects');
const AUDIO_DIR = path.join(PROJECTS_DIR, 'audio');

// ─────────────────────────────────────────────────────────────────────────────
// Dev-only file APIs backed by the gitignored ./projects folder, so the app can
// load & save locally without the browser download/upload dialog.
//
//   /api/projects            JSON project files   (validated, pretty-printed)
//   /api/audio               practice audio files (streamed, Range requests for <audio> seeking)
//
// Both routes share one handler factory:
//   GET    <prefix>           -> [{ name, size, mtime }]
//   GET    <prefix>/<file>    -> file contents
//   PUT    <prefix>/<file>    -> write body to <file>
//   DELETE <prefix>/<file>
// Only plain `<name>.<ext>` basenames with an allowed extension are accepted
// (blocks path traversal; malformed percent-encoding is a 400, not a crash).
// ─────────────────────────────────────────────────────────────────────────────

interface FileApiOptions {
  name: string;
  prefix: string;
  dir: string;
  allowedExts: string[];
  /** JSON mode: buffer, parse, validate, pretty-print. Otherwise stream bytes as-is. */
  json?: { validate: (parsed: any) => string | null };
  mimeOf?: (ext: string) => string;
}

function localFileApi(o: FileApiOptions): Plugin {
  const ensureDir = () => { if (!fs.existsSync(o.dir)) fs.mkdirSync(o.dir, { recursive: true }); };

  const safeName = (raw: string): string | null => {
    let decoded: string;
    try { decoded = decodeURIComponent(raw); } catch { return null; }
    const base = path.basename(decoded);
    const ext = path.extname(base).toLowerCase();
    if (base !== decoded || base.startsWith('.') || !o.allowedExts.includes(ext)) return null;
    return base;
  };

  const sendJson = (res: any, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url || '';
    if (url !== o.prefix && !url.startsWith(o.prefix + '/') && !url.startsWith(o.prefix + '?')) return next();
    ensureDir();
    const rest = url.split('?')[0].slice(o.prefix.length).replace(/^\//, '');

    // Collection
    if (rest === '') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      fs.promises.readdir(o.dir)
        .then(async names => {
          const files = await Promise.all(names
            .filter(f => o.allowedExts.includes(path.extname(f).toLowerCase()))
            .map(async name => { const st = await fs.promises.stat(path.join(o.dir, name)); return { name, size: st.size, mtime: st.mtimeMs }; }));
          sendJson(res, 200, files.sort((a, b) => b.mtime - a.mtime));
        })
        .catch(err => sendJson(res, 500, { error: String(err) }));
      return;
    }

    const name = safeName(rest);
    if (!name) return sendJson(res, 400, { error: 'Invalid file name' });
    const filePath = path.join(o.dir, name);

    if (req.method === 'GET') {
      if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Not found' });
      if (o.json) {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        return res.end(fs.readFileSync(filePath, 'utf-8'));
      }
      const size = fs.statSync(filePath).size;
      const mime = o.mimeOf?.(path.extname(name).toLowerCase()) || 'application/octet-stream';
      res.setHeader('Accept-Ranges', 'bytes');
      res.setHeader('Content-Type', mime);
      const range = typeof req.headers.range === 'string' ? req.headers.range : undefined;
      if (range && size > 0) {
        // bytes=a-b | bytes=a- | bytes=-n  (RFC 7233); anything unsatisfiable → 416
        const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
        let start: number, end: number;
        if (!m || (m[1] === '' && m[2] === '')) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
        if (m[1] === '') { const n = Math.min(parseInt(m[2], 10), size); start = size - n; end = size - 1; }
        else { start = parseInt(m[1], 10); end = m[2] === '' ? size - 1 : Math.min(parseInt(m[2], 10), size - 1); }
        if (start > end || start >= size) { res.statusCode = 416; res.setHeader('Content-Range', `bytes */${size}`); return res.end(); }
        res.statusCode = 206;
        res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
        res.setHeader('Content-Length', String(end - start + 1));
        fs.createReadStream(filePath, { start, end }).on('error', () => res.end()).pipe(res);
      } else {
        res.statusCode = 200;
        res.setHeader('Content-Length', String(size));
        fs.createReadStream(filePath).on('error', () => res.end()).pipe(res);
      }
      return;
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      if (o.json) {
        const chunks: Buffer[] = [];
        req.on('data', c => chunks.push(c as Buffer));
        req.on('end', () => {
          try {
            const parsed = JSON.parse(Buffer.concat(chunks).toString('utf-8'));
            const problem = o.json!.validate(parsed);
            if (problem) return sendJson(res, 400, { error: problem });
            fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
            return sendJson(res, 200, { ok: true, name });
          } catch {
            return sendJson(res, 400, { error: 'Invalid JSON' });
          }
        });
        return;
      }
      // Binary: stream straight to disk (a WAV can be tens of MB — don't hold it in memory)
      const tmp = filePath + '.uploading';
      const out = fs.createWriteStream(tmp);
      req.pipe(out);
      out.on('finish', () => { fs.renameSync(tmp, filePath); sendJson(res, 200, { ok: true, name }); });
      out.on('error', err => { try { fs.unlinkSync(tmp); } catch { /* noop */ } sendJson(res, 500, { error: String(err) }); });
      return;
    }

    if (req.method === 'DELETE') {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  };

  return {
    name: o.name,
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

const localProjectsApi = () => localFileApi({
  name: 'local-projects-api',
  prefix: '/api/projects',
  dir: PROJECTS_DIR,
  allowedExts: ['.json'],
  json: { validate: parsed => (!parsed || !Array.isArray(parsed.songs)) ? 'Not a valid project (missing songs array)' : null },
});

const AUDIO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.m4a': 'audio/mp4', '.aac': 'audio/aac', '.ogg': 'audio/ogg', '.flac': 'audio/flac',
};
const localAudioApi = () => localFileApi({
  name: 'local-audio-api',
  prefix: '/api/audio',
  dir: AUDIO_DIR,
  allowedExts: Object.keys(AUDIO_MIME),
  mimeOf: ext => AUDIO_MIME[ext],
});

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), localProjectsApi(), localAudioApi()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      },
      // vitest: 순수 로직(지휘자 코어, 차트, 기기 배치, 임포트)만 node 환경에서 돈다
      test: { environment: 'node', include: ['**/*.test.ts'], exclude: ['node_modules', 'dist'] },
    };
});
