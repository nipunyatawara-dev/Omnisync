/* eslint-disable */
const { app, BrowserWindow, shell, ipcMain, dialog, nativeImage, session, safeStorage } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

// Generate a cryptographically secure random token on startup
const apiToken = crypto.randomBytes(32).toString("hex");

// Load or create a strong, per-install encryption secret used by the Next.js
// server to encrypt profile credentials at rest. The secret is a random 256-bit
// value persisted to disk, protected by the OS keychain via safeStorage when
// available (falling back to a plaintext file only if encryption is unavailable).
function getOrCreateEncryptionSecret() {
  const userDataDir = path.join(process.cwd(), "User data");
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
const PORT = OMNISYNC_APP_PORT;
const SERVER_URL = `http://localhost:${PORT}`;

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
  const isDev = !app.isPackaged;
  const command = isDev ? "dev" : "start";

  console.log(`Starting Next.js server in ${isDev ? "development" : "production"} mode...`);

  // Spawn Next.js server process with the generated API token in the environment
  const encryptionSecret = getOrCreateEncryptionSecret();

  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  nextProcess = spawn(npxCmd, ["next", command], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      PORT: PORT.toString(),
      NEXT_PUBLIC_OMNISYNC_PORT: PORT.toString(),
      OMNISYNC_API_TOKEN: apiToken,
      OMNISYNC_ENCRYPTION_SECRET: encryptionSecret,
    },
    shell: process.platform === "win32",
  });

  nextProcess.stdout.on("data", (data) => {
    console.log(`[Next.js] ${data.toString().trim()}`);
  });

  nextProcess.stderr.on("data", (data) => {
    console.error(`[Next.js Error] ${data.toString().trim()}`);
  });
}

function createWindow() {
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

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 850,
    minWidth: 1000,
    minHeight: 700,
    icon: path.join(__dirname, "public", "icon.png"),
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
  if (process.platform === "darwin") {
    try {
      const image = nativeImage.createFromPath(path.join(__dirname, "public", "icon.png"));
      app.dock.setIcon(image);
    } catch (err) {
      console.error("Failed to set macOS dock icon:", err);
    }
  }

  // Register Directory Picker IPC handler
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
  startNextServer();
  waitForServer(() => {
    console.log("Next.js server is ready. Launching Electron window.");
    createWindow();
  });
});

app.on("window-all-closed", () => {
  cleanUp();
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("activate", () => {
  if (mainWindow === null) {
    createWindow();
  }
});

process.on("exit", cleanUp);
process.on("SIGINT", () => {
  cleanUp();
  process.exit(0);
});
