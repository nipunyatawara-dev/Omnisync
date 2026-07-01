/* eslint-disable */
const { app, BrowserWindow, shell, ipcMain, dialog, nativeImage, session } = require("electron");
const { spawn } = require("child_process");
const http = require("http");
const path = require("path");
const crypto = require("crypto");

// Generate a cryptographically secure random token on startup
const apiToken = crypto.randomBytes(32).toString("hex");

let nextProcess = null;
let mainWindow = null;
const PORT = 3000;
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
  const npxCmd = process.platform === "win32" ? "npx.cmd" : "npx";
  nextProcess = spawn(npxCmd, ["next", command], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: PORT.toString(), OMNISYNC_API_TOKEN: apiToken },
    shell: true,
  });

  nextProcess.stdout.on("data", (data) => {
    console.log(`[Next.js] ${data.toString().trim()}`);
  });

  nextProcess.stderr.on("data", (data) => {
    console.error(`[Next.js Error] ${data.toString().trim()}`);
  });
}

function createWindow() {
  // Configure Content-Security-Policy (CSP) headers for the Electron window
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [
          "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: https://avatars.githubusercontent.com https://github.com; connect-src 'self' https://api.github.com https://github.com http://localhost:* ws://localhost:*;"
        ]
      }
    });
  });

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
    titleBarStyle: "hiddenInset", // Sleek macOS style
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
