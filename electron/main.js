import { app, BrowserWindow } from 'electron';
import path from 'path';
import fs from 'fs';

// Set AppUserModelID for Windows (notifications, taskbar)
if (process.platform === 'win32') {
  app.setAppUserModelId && app.setAppUserModelId('com.example.unitcopilot');
}

// Prevent multiple instances
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  // Load the production build (dist) when packaged, otherwise use Vite dev server
  if (app.isPackaged) {
    const indexPath = path.join(__dirname, '..', 'dist', 'index.html');
    if (fs.existsSync(indexPath)) {
      mainWindow.loadFile(indexPath);
    } else {
      mainWindow.loadURL('http://localhost:5173');
    }
  } else {
    mainWindow.loadURL('http://localhost:5173');
  }

  // Optional: open devtools when running in dev mode
  // mainWindow.webContents.openDevTools();

  return mainWindow;
}

app.on('second-instance', () => {
  // Someone tried to run a second instance, focus the main window
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
