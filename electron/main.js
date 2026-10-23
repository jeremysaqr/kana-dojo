// Kana Dojo as a desktop app: the same server and front end as the browser version, in its own window.
//   npm run app        run from source (fast iteration stays in the browser: npm start)
//   npm run dist       build the Windows installer into dist/
//   npm run release    build and publish a GitHub Release (installed copies update from it)
//
// The installed app keeps its data in %APPDATA%\Kana Dojo\data (not the project's data/ folder), so the
// browser version you develop with and the installed app never share or overwrite each other's progress.
import { app, BrowserWindow, shell, dialog, Menu } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { createServer } from '../server.js';

if (!app.requestSingleInstanceLock()) app.quit();   // a second launch focuses the first window instead

let win = null;
let server = null;

function listen(srv) {
  return new Promise((resolve, reject) => {
    srv.once('error', reject);
    srv.listen(0, '127.0.0.1', () => resolve(srv.address().port));
  });
}

async function createWindow() {
  const dataDir = path.join(app.getPath('userData'), 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  server = createServer({ dataDir });
  await server.store.ready().catch(() => {});
  await server.profiles.load();
  const port = await listen(server);

  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 360,
    minHeight: 560,
    title: 'Kana Dojo',
    backgroundColor: '#e8e8e2',
    autoHideMenuBar: true,
    webPreferences: { contextIsolation: true, sandbox: true },
  });
  // Links that leave the app (e.g. nodejs.org in a help note) open in the normal browser.
  win.webContents.setWindowOpenHandler(({ url }) => { shell.openExternal(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(`http://127.0.0.1:${port}/`)) { e.preventDefault(); shell.openExternal(url); }
  });
  await win.loadURL(`http://127.0.0.1:${port}/`);
}

async function checkForUpdates() {
  if (!app.isPackaged) return;
  try {
    const { default: updater } = await import('electron-updater');
    const { autoUpdater } = updater;
    autoUpdater.autoDownload = true;
    autoUpdater.on('update-downloaded', async (info) => {
      const { response } = await dialog.showMessageBox(win, {
        type: 'info',
        buttons: ['Restart now', 'Later'],
        defaultId: 0,
        cancelId: 1,
        title: 'Update ready',
        message: `Kana Dojo ${info.version} is ready.`,
        detail: 'Restart to use it now, or it will be installed the next time you close Kana Dojo.',
      });
      if (response === 0) autoUpdater.quitAndInstall();
    });
    await autoUpdater.checkForUpdates();
  } catch (err) {
    console.warn(`[kana-dojo] update check skipped: ${err.message}`);   // offline is normal
  }
}

app.on('second-instance', () => {
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.focus();
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  try {
    await createWindow();
  } catch (err) {
    dialog.showErrorBox('Kana Dojo could not start', err.stack || String(err));
    app.quit();
    return;
  }
  checkForUpdates();
});

// Save everything before quitting.
let quitting = false;
app.on('before-quit', async (e) => {
  if (quitting || !server) return;
  e.preventDefault();
  quitting = true;
  try {
    await server.store.flush();
    for (const s of server.profiles.allStores()) await s.flush();
  } catch { /* already logged */ }
  server.close();
  app.quit();
});

app.on('window-all-closed', () => app.quit());
