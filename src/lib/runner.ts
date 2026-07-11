import { ChildProcess } from "child_process";
import { spawnLoginCommand, spawnTool } from "@/lib/shellEnv";
import { stripTerminalEscapeSequences } from "@/lib/npmInstall";
import { prepareWorkspaceForRunner } from "@/lib/runnerPrepare";
import { appendTerminalLine, logTerminalCommand } from "@/lib/dashboardTerminal";
import {
  buildWorkspaceChildEnv,
  workspaceEnvModeForRunCommand,
} from "@/lib/workspaceProcessEnv";

export interface RunnerStartOptions {
  runCommand?: string;
  buildCommand?: string;
  port?: number;
  shell?: string;
}

export interface RunnerStatus {
  status: "stopped" | "starting" | "running" | "error";
  pid: number | null;
  error?: string;
  runCommand?: string;
  port?: number;
}

export interface RunnerState {
  childProcess: ChildProcess | null;
  status: "stopped" | "starting" | "running" | "error";
  logs: string[];
  error?: string;
  cwd: string | null;
  runCommand: string;
  port: number;
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
    runCommand: "npm run dev",
    port: 3000,
  };
}

const state = globalRef.runnerState;

function appendLog(text: string) {
  const time = new Date().toLocaleTimeString();
  const cleanText = stripTerminalEscapeSequences(text);
  state.logs.push(`[${time}] ${cleanText}`);
  if (state.logs.length > 1000) {
    state.logs.shift();
  }
  appendTerminalLine(cleanText, cleanText.includes("[ERROR]") ? "error" : "output");
}

/** Prefer argv spawn for `npm run <script>` so cwd/env cannot drift via login shell. */
function spawnRunCommand(
  runCommand: string,
  cwd: string,
  env: NodeJS.ProcessEnv
): ChildProcess {
  const match = runCommand.trim().match(/^npm\s+run\s+(\S+)(.*)$/i);
  if (match) {
    const script = match[1];
    const rest = match[2].trim();
    const extra = rest ? rest.split(/\s+/).filter(Boolean) : [];
    return spawnTool("npm", ["run", script, ...extra], { cwd, env });
  }
  return spawnLoginCommand(runCommand, { cwd, env });
}

export async function startRunner(cwd: string, options: RunnerStartOptions = {}) {
  const runCommand = options.runCommand?.trim() || "npm run dev";
  const buildCommand = options.buildCommand?.trim() || "npm run build";
  const port = options.port && options.port > 0 ? options.port : 3000;

  if (state.status === "running" || state.status === "starting") {
    if (state.cwd === cwd && state.runCommand === runCommand && state.port === port) {
      return getRunnerStatus();
    }
    stopRunner();
  }

  state.status = "starting";
  state.cwd = cwd;
  state.runCommand = runCommand;
  state.port = port;
  state.error = undefined;
  state.logs = [];
  logTerminalCommand(`run server → ${runCommand} (PORT=${port})`, "runner");
  appendLog(`Starting development server in directory: ${cwd}...`);

  try {
    await prepareWorkspaceForRunner(cwd, {
      runCommand,
      buildCommand,
      onLog: appendLog,
    });

    appendLog(`Executing: ${runCommand} (PORT=${port})`);

    const env = buildWorkspaceChildEnv(cwd, {
      port,
      mode: workspaceEnvModeForRunCommand(runCommand),
    });

    const child = spawnRunCommand(runCommand, cwd, env);

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
      state.childProcess = null;
      appendLog(`Failed to start child process: ${err.message}`);
    });

    child.on("close", (code) => {
      state.childProcess = null;
      appendLog(`Process exited with code ${code}`);
      if (code !== 0 && code !== null) {
        state.status = "error";
        state.error = `Dev server exited with code ${code}`;
      } else {
        state.status = "stopped";
      }
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

export function stopRunner() {
  if (!state.childProcess) {
    state.status = "stopped";
    return getRunnerStatus();
  }

  appendLog("Stopping development server...");
  logTerminalCommand("stop server", "runner");
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

export function getRunnerStatus(): RunnerStatus {
  return {
    status: state.status,
    pid: state.childProcess?.pid || null,
    error: state.error,
    runCommand: state.runCommand,
    port: state.port,
  };
}

export function getRunnerLogs(): string[] {
  return state.logs;
}
