const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const PORT = Number(process.env.PORT || 5173);
const ROOT = __dirname;
const STATE_PATH = path.join(ROOT, '.timer-control.json');

const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.otf': 'font/otf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

const defaultControl = () => ({
  status: 'running',
  elapsedMs: 0,
  startedAt: Date.now(),
});

const normalizeControl = (control) => {
  const status = control?.status === 'paused' ? 'paused' : 'running';
  const elapsedMs = Math.max(0, Number(control?.elapsedMs) || 0);
  const startedAt = status === 'running'
    ? Math.max(0, Number(control?.startedAt) || Date.now())
    : null;

  return { status, elapsedMs, startedAt };
};

const getElapsedMs = (control) => {
  const normalized = normalizeControl(control || defaultControl());
  if (normalized.status === 'paused') {
    return normalized.elapsedMs;
  }

  return normalized.elapsedMs + Math.max(0, Date.now() - normalized.startedAt);
};

const readState = () => {
  try {
    const parsed = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
    return normalizeControl(parsed);
  } catch {
    return defaultControl();
  }
};

const writeState = (control) => {
  const normalized = normalizeControl(control);
  fs.writeFileSync(STATE_PATH, JSON.stringify(normalized, null, 2));
  return normalized;
};

let timerControl = readState();

const json = (response, statusCode, data) => {
  response.writeHead(statusCode, {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(data));
};

const readBody = (request) => new Promise((resolve, reject) => {
  let body = '';
  request.on('data', (chunk) => {
    body += chunk;
    if (body.length > 1024 * 1024) {
      reject(new Error('Request body too large'));
      request.destroy();
    }
  });
  request.on('end', () => resolve(body));
  request.on('error', reject);
});

const applyAction = (action) => {
  const currentElapsed = getElapsedMs(timerControl);

  switch (action) {
    case 'pause':
      timerControl = writeState({
        status: 'paused',
        elapsedMs: currentElapsed,
        startedAt: null,
      });
      break;
    case 'resume':
      timerControl = writeState({
        status: 'running',
        elapsedMs: currentElapsed,
        startedAt: Date.now(),
      });
      break;
    case 'restart':
      timerControl = writeState(defaultControl());
      break;
    default:
      break;
  }

  return timerControl;
};

const serveFile = (requestPath, response) => {
  const pathname = requestPath === '/' ? '/index.html' : requestPath;
  const safePath = path.normalize(path.join(ROOT, pathname));

  if (!safePath.startsWith(ROOT)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }

  fs.stat(safePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      response.writeHead(404);
      response.end('Not found');
      return;
    }

    const extension = path.extname(safePath).toLowerCase();
    response.writeHead(200, {
      'Cache-Control': 'no-cache',
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
    });
    fs.createReadStream(safePath).pipe(response);
  });
};

const server = http.createServer(async (request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);

  if (request.method === 'OPTIONS' && url.pathname === '/api/timer-control') {
    json(response, 204, {});
    return;
  }

  if (url.pathname === '/api/timer-control') {
    if (request.method === 'GET') {
      timerControl = readState();
      json(response, 200, {
        ...timerControl,
        currentElapsedMs: getElapsedMs(timerControl),
        capturedAt: Date.now(),
      });
      return;
    }

    if (request.method === 'POST') {
      try {
        const body = await readBody(request);
        const parsed = body ? JSON.parse(body) : {};
        timerControl = applyAction(parsed.action);
        json(response, 200, {
          ...timerControl,
          currentElapsedMs: getElapsedMs(timerControl),
          capturedAt: Date.now(),
        });
      } catch (error) {
        json(response, 400, { error: error.message || 'Invalid request' });
      }
      return;
    }

    json(response, 405, { error: 'Method not allowed' });
    return;
  }

  serveFile(url.pathname, response);
});

server.listen(PORT, () => {
  console.log(`Stream Timer server running at http://localhost:${PORT}`);
});