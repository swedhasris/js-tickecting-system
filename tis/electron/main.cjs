/**
 * Electron Main Process
 * Wraps the Connect IT web app as a desktop application.
 * Provides silent full-screen capture via desktopCapturer (no browser dialog).
 */

const { app, BrowserWindow, ipcMain, desktopCapturer, screen } = require('electron');
const path = require('path');
const http = require('http');

let mainWindow = null;
const SERVER_URL = 'http://localhost:3000';

/* ── Wait for the server to be ready ── */
function waitForServer(url, timeout = 30000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    function check() {
      http.get(url, (res) => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) {
          reject(new Error('Server did not start in time'));
        } else {
          setTimeout(check, 500);
        }
      });
    }
    check();
  });
}

/* ── Create the main browser window ── */
function createWindow() {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;

  mainWindow = new BrowserWindow({
    width: Math.min(width, 1600),
    height: Math.min(height, 1000),
    minWidth: 1024,
    minHeight: 700,
    title: 'Connect IT',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: false, // allow localhost resources
    },
    show: false,
    backgroundColor: '#0f172a',
  });

  // Grant all permissions dynamically for localhost, WebRTC, and media
  const allowAllPermissions = (webContents, permission, callback) => {
    callback(true);
  };
  
  mainWindow.webContents.session.setPermissionRequestHandler(allowAllPermissions);
  mainWindow.webContents.session.setPermissionCheckHandler((webContents, permission) => {
    return true;
  });

  // Set on default session as well for fallback / subframes / overlays
  const { session } = require('electron');
  session.defaultSession.setPermissionRequestHandler(allowAllPermissions);
  session.defaultSession.setPermissionCheckHandler(() => true);

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

/* ── IPC: capture entire screen silently ── */
ipcMain.handle('capture-screen', async () => {
  try {
    // Get all available screen sources
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 1920, height: 1080 },
    });

    if (!sources || sources.length === 0) {
      return { error: 'No screen sources available' };
    }

    // Use the primary screen (first source)
    const primarySource = sources[0];
    const thumbnail = primarySource.thumbnail;

    // Convert NativeImage to JPEG buffer
    const jpegBuffer = thumbnail.toJPEG(85);
    const base64 = jpegBuffer.toString('base64');
    const dataUrl = `data:image/jpeg;base64,${base64}`;

    return {
      dataUrl,
      width: thumbnail.getSize().width,
      height: thumbnail.getSize().height,
      sourceName: primarySource.name,
    };
  } catch (err) {
    console.error('[Electron] Screen capture failed:', err);
    return { error: err.message };
  }
});

/* ── IPC: get all screens (for multi-monitor) ── */
ipcMain.handle('get-screens', async () => {
  try {
    const sources = await desktopCapturer.getSources({
      types: ['screen'],
      thumbnailSize: { width: 320, height: 180 },
    });
    return sources.map(s => ({
      id: s.id,
      name: s.name,
      thumbnail: s.thumbnail.toDataURL(),
    }));
  } catch (err) {
    return { error: err.message };
  }
});

/* ── App lifecycle ── */
app.whenReady().then(async () => {
  console.log('[Electron] Waiting for server at', SERVER_URL);
  try {
    await waitForServer(SERVER_URL);
    console.log('[Electron] Server ready — opening window');
  } catch (e) {
    console.warn('[Electron] Server wait timed out, opening anyway');
  }
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});
