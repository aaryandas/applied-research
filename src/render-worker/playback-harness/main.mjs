import { app, BrowserWindow, session } from 'electron';
import { fileURLToPath } from 'node:url';
app.setPath('userData', process.env.AR_MANIM_HARNESS_DATA);
app.on('window-all-closed', () => app.quit());
await app.whenReady();
session.defaultSession.webRequest.onBeforeRequest(
  { urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] },
  (_, callback) => callback({ cancel: true }),
);
session.defaultSession.setPermissionRequestHandler((_, __, callback) =>
  callback(false),
);
const window = new BrowserWindow({
  width: 1340,
  height: 940,
  show: true,
  backgroundColor: '#0c0f12',
  webPreferences: {
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
  },
});
window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
window.webContents.on('will-navigate', (event) => event.preventDefault());
await window.loadFile(fileURLToPath(new URL('./player.html', import.meta.url)));
