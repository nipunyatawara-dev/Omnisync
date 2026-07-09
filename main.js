/* eslint-disable */
const { app, BrowserWindow, shell, ipcMain, dialog, nativeImage, session, safeStorage, utilityProcess } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const { augmentProcessEnv } = require("./shellEnv");

// Generate a cryptographically secure random token on startup
const apiToken = crypto.randomBytes(32).toString("hex");

// Load or create a strong, per-install encryption secret used by the Next.js
// server to encrypt profile credentials at rest. The secret is a random 256-bit
// value persisted to disk, protected by the OS keychain via safeStorage when
// available (falling back to a plaintext file only if encryption is unavailable).
function getOrCreateEncryptionSecret() {
  const userDataDir = getUserDataDir();
  const secretFile = path.join(userDataDir, "secret.bin");
  const ENC_PREFIX = "v1:enc:";
  const PLAIN_PREFIX = "v1:plain:";

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
  } catch {}

  try {
    if (fs.existsSync(secretFile)) {
      const stored = fs.readFileSync(secretFile, "utf-8").trim();
      if (stored.startsWith(ENC_PREFIX) && safeStorage.isEncryptionAvailable()) {
        const encrypted = Buffer.from(stored.slice(ENC_PREFIX.length), "base64");
        return safeStorage.decryptString(encrypted);
      }
      if (stored.startsWith(PLAIN_PREFIX)) {
        return stored.slice(PLAIN_PREFIX.length);
      }
    }
  } catch (err) {
    console.error("Failed to read encryption secret, regenerating:", err);
  }

  const secret = crypto.randomBytes(32).toString("hex");
  try {
    if (safeStorage.isEncryptionAvailable()) {
      const encrypted = safeStorage.encryptString(secret).toString("base64");
      fs.writeFileSync(secretFile, ENC_PREFIX + encrypted, { encoding: "utf-8", mode: 0o600 });
    } else {
      console.warn("OS keychain unavailable; storing encryption secret without keychain protection.");
      fs.writeFileSync(secretFile, PLAIN_PREFIX + secret, { encoding: "utf-8", mode: 0o600 });
    }
  } catch (err) {
    console.error("Failed to persist encryption secret:", err);
  }
  return secret;
}

const { OMNISYNC_APP_PORT } = require("./appPort");

let nextProcess = null;
let mainWindow = null;
let ipcHandlersRegistered = false;
let isLaunchingWindow = false;
const PORT = OMNISYNC_APP_PORT;
const SERVER_URL = `http://localhost:${PORT}`;

function getAppRoot() {
  return app.isPackaged ? app.getAppPath() : process.cwd();
}

function getUserDataDir() {
  return app.getPath("userData");
}

function getStandaloneDir() {
  if (!app.isPackaged) {
    return path.join(getAppRoot(), ".next", "standalone");
  }
  return path.join(process.resourcesPath, "app.asar.unpacked", ".next", "standalone");
}

function getAppIconPath() {
  const candidates = [
    path.join(__dirname, "public", "icon.png"),
    path.join(process.resourcesPath || "", "icon.png"),
  ];
  for (const candidate of candidates) {
    if (candidate && fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

// Function to poll the server until it is ready
function waitForServer(callback) {
  const req = http.get(SERVER_URL, () => {
    // If we get any response, the server is up
    callback();
  });

  req.on("error", () => {
    // Retry in 500ms if not ready
    setTimeout(() => waitForServer(callback), 500);
  });
}

function startNextServer() {
  if (nextProcess) return;

  const isDev = !app.isPackaged;
  const appRoot = getAppRoot();
  const userDataDir = getUserDataDir();
  const encryptionSecret = getOrCreateEncryptionSecret();

  console.log(`Starting Next.js server in ${isDev ? "development" : "production"} mode...`);

  const sharedEnv = augmentProcessEnv({
    ...process.env,
    HOSTNAME: "127.0.0.1",
    NEXT_PUBLIC_OMNISYNC_PORT: PORT.toString(),
    OMNISYNC_API_TOKEN: apiToken,
    OMNISYNC_ENCRYPTION_SECRET: encryptionSecret,
    OMNISYNC_USER_DATA_DIR: userDataDir,
  });

  if (isDev) {
    delete sharedEnv.PORT;
    const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
    // Dev: bind via -p only — do not set generic PORT (other Next apps inherit it from the shell).
    nextProcess = spawn(npxCmd, ["next", "dev", "-p", PORT.toString()], {
      cwd: appRoot,
      env: sharedEnv,
      shell: process.platform === "win32",
    });
  } else {
    // Production standalone server.js reads PORT; scoped to this child process only.
    sharedEnv.PORT = PORT.toString();
    const standaloneDir = getStandaloneDir();
    const serverScript = path.join(standaloneDir, "server.js");

    if (process.platform === "darwin") {
      nextProcess = utilityProcess.fork(serverScript, [], {
        cwd: standaloneDir,
        env: sharedEnv,
        serviceName: "OmniSync Server",
        stdio: "pipe",
      });
    } else {
      nextProcess = spawn(process.execPath, [serverScript], {
        cwd: standaloneDir,
        env: {
          ...sharedEnv,
          ELECTRON_RUN_AS_NODE: "1",
        },
      });
    }
  }

  attachNextProcessLogs(nextProcess);
}

function attachNextProcessLogs(processRef) {
  if (!processRef) return;

  processRef.on("error", (err) => {
    console.error("Failed to start Next.js server:", err);
  });

  processRef.on("exit", (code, signal) => {
    nextProcess = null;
    if (code !== 0 && code !== null) {
      console.error(`Next.js server exited with code=${code} signal=${signal}`);
    }
  });

  processRef.stdout?.on("data", (data) => {
    console.log(`[Next.js] ${data.toString().trim()}`);
  });

  processRef.stderr?.on("data", (data) => {
    console.error(`[Next.js Error] ${data.toString().trim()}`);
  });
}

function registerIpcHandlers() {
  // ipcMain.handle throws (and Electron aborts with SIGTRAP) if the same channel
  // is registered twice. Keep this outside createWindow — macOS activate/reopen
  // recreates the window without quitting the process.
  if (ipcHandlersRegistered) return;
  ipcHandlersRegistered = true;

  ipcMain.handle("select-directory", async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ["openDirectory", "createDirectory"],
      title: "Select Local Folder",
    });
    if (result.canceled) {
      return null;
    }
    return result.filePaths[0];
  });

  // Report whether OmniSync has Full Disk Access. TCC.db is only readable with Full
  // Disk Access granted, and (unlike Documents/Desktop/Downloads) checking it never
  // triggers a native consent prompt on its own, so this is always safe to call.
  ipcMain.handle("check-system-permissions", async () => {
    if (process.platform !== "darwin") {
      return { platform: process.platform, fullDiskAccess: true };
    }
    const tccDbPath = path.join(
      app.getPath("home"),
      "Library",
      "Application Support",
      "com.apple.TCC",
      "TCC.db"
    );
    let fullDiskAccess = false;
    try {
      fs.accessSync(tccDbPath, fs.constants.R_OK);
      fullDiskAccess = true;
    } catch {
      fullDiskAccess = false;
    }
    return { platform: process.platform, fullDiskAccess };
  });

  // Explicitly requested by the user (after we've explained why) so that macOS's
  // native one-time "OmniSync would like to access files in your ___ folder" consent
  // dialog appears in context instead of as a surprise the first time we clone/read there.
  ipcMain.handle("request-folder-access", async (_event, folderName) => {
    if (process.platform !== "darwin") {
      return { granted: true };
    }
    const allowedFolders = ["Documents", "Desktop", "Downloads"];
    if (!allowedFolders.includes(folderName)) {
      return { granted: false, error: "Unsupported folder" };
    }
    const dir = path.join(app.getPath("home"), folderName);
    try {
      await fs.promises.readdir(dir);
      return { granted: true };
    } catch (err) {
      return { granted: false, error: err instanceof Error ? err.message : String(err) };
    }
  });

  // Full Disk Access can only ever be toggled by the user in System Settings — Apple
  // gives apps no way to trigger that consent sheet programmatically — so the best we
  // can do is deep-link straight to the right Privacy & Security pane.
  ipcMain.handle("open-privacy-settings", async (_event, pane) => {
    if (process.platform !== "darwin") return false;
    const panes = {
      "full-disk-access": "x-apple.systempreferences:com.apple.preference.security?Privacy_AllFiles",
      documents: "x-apple.systempreferences:com.apple.preference.security?Privacy_DocumentsFolder",
      desktop: "x-apple.systempreferences:com.apple.preference.security?Privacy_DesktopFolder",
      downloads: "x-apple.systempreferences:com.apple.preference.security?Privacy_DownloadsFolder",
    };
    await shell.openExternal(panes[pane] || panes["full-disk-access"]);
    return true;
  });
}

function createWindow() {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    return;
  }

  // The Content-Security-Policy is applied by the Next.js middleware (nonce-based
  // in production) so that inline scripts can be locked down with a per-request nonce.

  // Provision HttpOnly session cookie containing the API token for Same-Origin API requests
  const cookie = {
    url: SERVER_URL,
    name: "omnisync_token",
    value: apiToken,
    domain: "localhost",
    path: "/",
    httpOnly: true,
    sameSite: "strict",
  };

  session.defaultSession.cookies.set(cookie).then(() => {
    console.log("Authentication cookie provisioned successfully.");
  }).catch((err) => {
    console.error("Failed to provision authentication cookie:", err);
  });

  const iconPath = getAppIconPath();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    ...(iconPath ? { icon: iconPath } : {}),
    ...(process.platform === "darwin" ? { titleBarStyle: "hiddenInset" } : {}),
    backgroundColor: "#0d1117",
    show: false, // Don't show until ready-to-show
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, "preload.js"),
    },
  });

  // Set Dock icon on macOS
  if (process.platform === "darwin" && iconPath) {
    try {
      const image = nativeImage.createFromPath(iconPath);
      if (!image.isEmpty()) {
        app.dock.setIcon(image);
      }
    } catch (err) {
      console.error("Failed to set macOS Dock icon:", err);
    }
  }

  // Open external links in user's default browser (crucial for GitHub Device Flow and PAT link)
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  // Intercept and prevent in-app navigation to arbitrary domains
  mainWindow.webContents.on("will-navigate", (event, url) => {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.origin !== SERVER_URL) {
        event.preventDefault();
        shell.openExternal(url);
      }
    } catch {
      event.preventDefault();
    }
  });

  mainWindow.loadURL(SERVER_URL);

  mainWindow.once("ready-to-show", () => {
    mainWindow.show();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

function launchMainWindow() {
  if (mainWindow || isLaunchingWindow) return;
  isLaunchingWindow = true;

  const finish = () => {
    isLaunchingWindow = false;
    createWindow();
  };

  // On macOS, closing the last window kills the Next.js server but keeps the app
  // alive in the Dock. Reopen must restart the server before creating a window.
  const req = http.get(SERVER_URL, () => {
    req.destroy();
    finish();
  });
  req.on("error", () => {
    startNextServer();
    waitForServer(finish);
  });
}

// Clean up processes on exit
function cleanUp() {
  if (nextProcess) {
    console.log("Killing Next.js server process...");
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", nextProcess.pid, "/f", "/t"]);
    } else {
      nextProcess.kill("SIGINT");
    }
    nextProcess = null;
  }
}

app.on("ready", () => {
  registerIpcHandlers();
  startNextServer();
  waitForServer(() => {
    console.log("Next.js server is ready. Launching Electron window.");
    launchMainWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS the app stays alive in the Dock after the last window closes.
  // Keep the Next.js server running so dock reopen does not race a cold restart.
  if (process.platform !== "darwin") {
    cleanUp();
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    launchMainWindow();
  }
});

process.on("exit", cleanUp);
process.on("SIGINT", () => {
  cleanUp();
  process.exit(0);
});
