import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv, type Plugin, type Connect } from 'vite';
import react from '@vitejs/plugin-react';

const PROJECTS_DIR = path.resolve(__dirname, 'projects');

// Dev-only API that lists/reads/writes/deletes project JSON files in the
// gitignored ./projects folder, so the app can load & save locally without
// going through the browser download/upload dialog.
//   GET    /api/projects            -> [{ name, size, mtime }]
//   GET    /api/projects/<file>     -> file contents (the saved ProjectData)
//   PUT    /api/projects/<file>     -> write body to <file>
//   DELETE /api/projects/<file>     -> remove <file>
function localProjectsApi(): Plugin {
  const ensureDir = () => { if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true }); };

  // Reject anything that isn't a plain `<name>.json` basename (blocks path traversal).
  const safeName = (raw: string): string | null => {
    const decoded = decodeURIComponent(raw);
    const base = path.basename(decoded);
    if (base !== decoded || !base.toLowerCase().endsWith('.json') || base.startsWith('.')) return null;
    return base;
  };

  const sendJson = (res: any, status: number, body: unknown) => {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(body));
  };

  const handler: Connect.NextHandleFunction = (req, res, next) => {
    const url = req.url || '';
    if (!url.startsWith('/api/projects')) return next();

    ensureDir();
    const rest = url.split('?')[0].slice('/api/projects'.length).replace(/^\//, '');

    // Collection: list saved projects
    if (rest === '') {
      if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
      const files = fs.readdirSync(PROJECTS_DIR)
        .filter(f => f.toLowerCase().endsWith('.json'))
        .map(name => {
          const stat = fs.statSync(path.join(PROJECTS_DIR, name));
          return { name, size: stat.size, mtime: stat.mtimeMs };
        })
        .sort((a, b) => b.mtime - a.mtime);
      return sendJson(res, 200, files);
    }

    // Item: read / write / delete a single project file
    const name = safeName(rest);
    if (!name) return sendJson(res, 400, { error: 'Invalid file name' });
    const filePath = path.join(PROJECTS_DIR, name);

    if (req.method === 'GET') {
      if (!fs.existsSync(filePath)) return sendJson(res, 404, { error: 'Not found' });
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      return res.end(fs.readFileSync(filePath, 'utf-8'));
    }

    if (req.method === 'PUT' || req.method === 'POST') {
      const chunks: Buffer[] = [];
      req.on('data', c => chunks.push(c as Buffer));
      req.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf-8');
        try {
          const parsed = JSON.parse(body);
          if (!parsed || !Array.isArray(parsed.songs)) {
            return sendJson(res, 400, { error: 'Not a valid project (missing songs array)' });
          }
          fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), 'utf-8');
          return sendJson(res, 200, { ok: true, name });
        } catch {
          return sendJson(res, 400, { error: 'Invalid JSON' });
        }
      });
      return;
    }

    if (req.method === 'DELETE') {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      return sendJson(res, 200, { ok: true });
    }

    return sendJson(res, 405, { error: 'Method not allowed' });
  };

  return {
    name: 'local-projects-api',
    configureServer(server) { server.middlewares.use(handler); },
    configurePreviewServer(server) { server.middlewares.use(handler); },
  };
}

export default defineConfig(({ mode }) => {
    const env = loadEnv(mode, '.', '');
    return {
      server: {
        port: 3000,
        host: '0.0.0.0',
      },
      plugins: [react(), localProjectsApi()],
      define: {
        'process.env.API_KEY': JSON.stringify(env.GEMINI_API_KEY),
        'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY)
      },
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
