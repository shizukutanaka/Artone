'use strict';
/*
 * Artone desktop shell. Serves the unmodified Vite build (dist/) from a
 * privileged app://artone/ origin in a locked-down window: contextIsolation
 * on, nodeIntegration off, sandbox on, no preload. New windows and
 * navigation away from the app origin are blocked; http(s) links are handed
 * to the OS default browser.
 */
const { app, BrowserWindow, net, protocol, shell } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const SCHEME = 'app';
const HOST = 'artone';
const APP_URL = `${SCHEME}://${HOST}/`;
const WEB_ROOT = app.isPackaged
  ? path.join(__dirname, 'web')
  : path.join(__dirname, '..', 'dist');

// Same headers the web deployment sets (vercel.json / wrangler.toml):
// COOP/COEP make the page crossOriginIsolated so SharedArrayBuffer works.
const RESPONSE_HEADERS = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
  'Cross-Origin-Resource-Policy': 'cross-origin',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin'
};

protocol.registerSchemesAsPrivileged([{
  scheme: SCHEME,
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true }
}]);

function isAppUrl(url) {
  try {
    const u = new URL(url);
    return u.protocol === `${SCHEME}:` && u.host === HOST;
  } catch (e) {
    return false;
  }
}

function openExternalIfWeb(url) {
  try {
    const { protocol: p } = new URL(url);
    if (p === 'http:' || p === 'https:') shell.openExternal(url);
  } catch (e) { /* not a URL: ignore */ }
}

/** Maps an app:// request path to a file under WEB_ROOT (SPA fallback to index.html). */
function resolveFile(pathname) {
  let rel;
  try {
    rel = decodeURIComponent(pathname);
  } catch (e) {
    return null;
  }
  const file = path.resolve(WEB_ROOT, '.' + path.posix.normalize('/' + rel));
  if (file !== WEB_ROOT && !file.startsWith(WEB_ROOT + path.sep)) return null;
  try {
    if (fs.statSync(file).isFile()) return file;
  } catch (e) { /* missing: fall through */ }
  if (path.extname(file) === '') return path.join(WEB_ROOT, 'index.html');
  return null;
}

async function handleAppRequest(request) {
  const u = new URL(request.url);
  const file = u.host === HOST ? resolveFile(u.pathname) : null;
  if (!file) return new Response('Not Found', { status: 404, headers: RESPONSE_HEADERS });
  const res = await net.fetch(pathToFileURL(file).href);
  const headers = new Headers(res.headers);
  for (const [k, v] of Object.entries(RESPONSE_HEADERS)) headers.set(k, v);
  return new Response(res.body, { status: res.status, headers });
}

app.on('web-contents-created', (event, contents) => {
  contents.setWindowOpenHandler(({ url }) => {
    openExternalIfWeb(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (e, url) => {
    if (isAppUrl(url)) return;
    e.preventDefault();
    openExternalIfWeb(url);
  });
  contents.on('will-redirect', (e, url) => {
    if (!isAppUrl(url)) e.preventDefault();
  });
  contents.on('will-attach-webview', e => e.preventDefault());
});

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: 'Artone',
    backgroundColor: '#0a0a0a',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
  mainWindow.loadURL(APP_URL);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, handleAppRequest);
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}
