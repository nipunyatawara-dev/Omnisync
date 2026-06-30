import { spawn, ChildProcess } from "child_process";

export interface RunnerStatus {
  status: "stopped" | "starting" | "running" | "error";
  pid: number | null;
  error?: string;
}

export interface RunnerState {
  childProcess: ChildProcess | null;
  status: "stopped" | "starting" | "running" | "error";
  logs: string[];
  error?: string;
  cwd: string | null;
}

// Store process references globally in development to handle Next.js hot reloads
const globalRef = global as typeof globalThis & { runnerState?: RunnerState };

if (!globalRef.runnerState) {
  globalRef.runnerState = {
    childProcess: null,
    status: "stopped",
    logs: [],
    error: undefined,
    cwd: null,
  };
}

const state = globalRef.runnerState;

// Append a log line with time stamp
function appendLog(text: string) {
  const time = new Date().toLocaleTimeString();
  const cleanText = text.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
  state.logs.push(`[${time}] ${cleanText}`);
  // Cap at 1000 lines
  if (state.logs.length > 1000) {
    state.logs.shift();
  }
}

// Start dev server in target directory
export function startRunner(cwd: string) {
  if (state.status === "running" || state.status === "starting") {
    // If running in same directory, do nothing
    if (state.cwd === cwd) {
      return getRunnerStatus();
    }
    // Otherwise stop first
    stopRunner();
  }

  state.status = "starting";
  state.cwd = cwd;
  state.error = undefined;
  state.logs = [];
  appendLog(`Starting development server in directory: ${cwd}...`);
  appendLog(`Executing: npm run dev`);

  try {
    const child = spawn("npm", ["run", "dev"], {
      cwd,
      shell: true,
      env: { ...process.env, FORCE_COLOR: "1" },
    });

    state.childProcess = child;
    state.status = "running";

    child.stdout?.on("data", (data) => {
      const lines = data.toString().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          appendLog(line);
        }
      });
    });

    child.stderr?.on("data", (data) => {
      const lines = data.toString().split("\n");
      lines.forEach((line: string) => {
        if (line.trim()) {
          appendLog(`[ERROR] ${line}`);
        }
      });
    });

    child.on("error", (err) => {
      state.status = "error";
      state.error = err.message;
      appendLog(`Failed to start child process: ${err.message}`);
    });

    child.on("close", (code) => {
      state.status = "stopped";
      state.childProcess = null;
      appendLog(`Process exited with code ${code}`);
    });

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    state.status = "error";
    state.error = msg;
    state.childProcess = null;
    appendLog(`Exception caught starting process: ${msg}`);
  }

  return getRunnerStatus();
}

// Stop development server
export function stopRunner() {
  if (!state.childProcess) {
    state.status = "stopped";
    return getRunnerStatus();
  }

  appendLog("Stopping development server...");
  try {
    state.childProcess.kill("SIGTERM");
    
    const proc = state.childProcess;
    setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {}
    }, 1000);
    
    state.childProcess = null;
    state.status = "stopped";
    appendLog("Development server stopped.");
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    appendLog(`Error stopping server: ${msg}`);
  }

  return getRunnerStatus();
}

// Get runner status
export function getRunnerStatus(): RunnerStatus {
  return {
    status: state.status,
    pid: state.childProcess?.pid || null,
    error: state.error,
  };
}

// Get live output logs
export function getRunnerLogs(): string[] {
  return state.logs;
}
