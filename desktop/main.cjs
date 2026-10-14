// @ts-check
const { app, BrowserWindow, ipcMain, globalShortcut, safeStorage, powerMonitor } = require("electron");
const path = require("path");
const fs = require("fs");

/** @type {BrowserWindow | null} */
let mainWindow = null;

/** @type {BrowserWindow | null} */
let quickAddWindow = null;

let isMainLogicWindowActive = true;

const APP_URL = process.env.PRIORITASK_APP_URL || "http://localhost:5173";
const DIST_INDEX = path.join(__dirname, "../prioritask-frontend/dist/index.html");

function getPreloadPath() {
  return path.join(__dirname, "preload.cjs");
}

function loadWindowContent(win, queryParam = "") {
  if (process.env.NODE_ENV !== "development" && fs.existsSync(DIST_INDEX)) {
    win.loadFile(DIST_INDEX, {
      hash: queryParam.startsWith("#") ? queryParam.slice(1) : undefined,
      query: queryParam.startsWith("?") ? Object.fromEntries(new URLSearchParams(queryParam)) : undefined,
    });
  } else {
    const fullUrl = queryParam ? `${APP_URL}${queryParam.startsWith("?") || queryParam.startsWith("#") ? queryParam : `?${queryParam}`}` : APP_URL;
    win.loadURL(fullUrl).catch((err) => {
      console.warn(`[PrioritaskDesktop] Error loading URL: ${fullUrl}`, err.message);
    });
  }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: "Prioritask",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
      sandbox: false,
    },
  });

  loadWindowContent(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
    if (quickAddWindow && !quickAddWindow.isDestroyed()) {
      quickAddWindow.close();
    }
  });
}

function createQuickAddWindow() {
  quickAddWindow = new BrowserWindow({
    width: 680,
    height: 440,
    show: false,
    frame: false,
    center: true,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: getPreloadPath(),
      sandbox: false,
    },
  });

  loadWindowContent(quickAddWindow, "?view=quick_add");

  quickAddWindow.on("blur", () => {
    if (quickAddWindow && !quickAddWindow.isDestroyed() && quickAddWindow.isVisible()) {
      quickAddWindow.hide();
    }
  });

  quickAddWindow.on("close", (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      quickAddWindow?.hide();
    }
  });
}

function toggleQuickAddWindow() {
  if (!quickAddWindow || quickAddWindow.isDestroyed()) {
    createQuickAddWindow();
  }
  if (!quickAddWindow) return;

  if (quickAddWindow.isVisible()) {
    quickAddWindow.hide();
  } else {
    quickAddWindow.show();
    quickAddWindow.focus();
  }
}

function registerGlobalShortcuts() {
  const shortcuts = [
    "Alt+Space",
    "CommandOrControl+Alt+A",
    "CommandOrControl+Shift+A",
  ];

  for (const shortcut of shortcuts) {
    try {
      const registered = globalShortcut.register(shortcut, () => {
        toggleQuickAddWindow();
      });
      if (!registered) {
        console.warn(`[PrioritaskDesktop] Warning: Shortcut ${shortcut} could not be registered.`);
      }
    } catch (err) {
      console.warn(`[PrioritaskDesktop] Failed to register shortcut ${shortcut}:`, err);
    }
  }
}

function setupIpcHandlers() {
  // safeStorage handlers
  ipcMain.handle("safestorage:is-available", () => {
    try {
      return safeStorage.isEncryptionAvailable();
    } catch {
      return false;
    }
  });

  ipcMain.handle("safestorage:encrypt", (_event, plaintext) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage encryption is not available on this platform.");
    }
    const buffer = safeStorage.encryptString(plaintext);
    return buffer.toString("base64");
  });

  ipcMain.handle("safestorage:decrypt", (_event, ciphertext) => {
    if (!safeStorage.isEncryptionAvailable()) {
      throw new Error("safeStorage decryption is not available on this platform.");
    }
    const buffer = Buffer.from(ciphertext, "base64");
    return safeStorage.decryptString(buffer);
  });

  // QuickAdd & Sync bridge handlers
  ipcMain.on("desktop:quickAddAddTask", (_event, taskData) => {
    if (quickAddWindow && !quickAddWindow.isDestroyed() && quickAddWindow.isVisible()) {
      quickAddWindow.hide();
    }
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:onAddTask", taskData);
    }
  });

  ipcMain.on("desktop:sendRequestSync", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send("desktop:onWakeup");
    }
  });

  ipcMain.on("desktop:setMainLogicWindow", (_event, isMain) => {
    isMainLogicWindowActive = Boolean(isMain);
  });
}

function setupPowerMonitor() {
  // Escucha reanudación tras suspensión con 500 ms de estabilización
  powerMonitor.on("resume", () => {
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send("desktop:onWakeup");
      }
    }, 500);
  });
}

// Single instance lock
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    setupIpcHandlers();
    setupPowerMonitor();
    createMainWindow();
    createQuickAddWindow();
    registerGlobalShortcuts();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });

  app.on("before-quit", () => {
    app.isQuitting = true;
  });

  app.on("will-quit", () => {
    globalShortcut.unregisterAll();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });
}
