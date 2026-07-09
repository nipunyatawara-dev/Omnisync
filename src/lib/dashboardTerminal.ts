import { ChildProcess } from "child_process";
import path from "path";
import os from "os";
import { spawnLoginCommand } from "@/lib/shellEnv";
import { stripTerminalEscapeSequences } from "@/lib/npmInstall";
import { buildWorkspaceChildEnv } from "@/lib/workspaceProcessEnv";

export type TerminalLineKind = "command" | "output" | "error" | "system";

export interface TerminalLine {
  id: number;
  text: string;
  kind: TerminalLineKind;
}

interface TerminalState {
  lines: TerminalLine[];
  nextId: number;
  manualProcess: ChildProcess | null;
  isManualRunning: boolean;
  prompt: string;
}

const MAX_LINES = 5000;

const globalRef = global as typeof globalThis & { dashboardTerminalState?: TerminalState };

if (!globalRef.dashboardTerminalState) {
  globalRef.dashboardTerminalState = {
    lines: [],
    nextId: 1,
    manualProcess: null,
    isManualRunning: false,
    prompt: "user@localhost workspace",
  };
}

const state = globalRef.dashboardTerminalState;

export function buildTerminalPrompt(workspacePath: string): string {
  let username = "user";
  try {
    username = os.userInfo().username;
  } catch {
    username = process.env.USER || "user";
  }

  let hostname = "localhost";
  try {
    hostname = os.hostname().replace(/\.local$/, "");
  } catch {}

  const folder = path.basename(workspacePath) || "workspace";
  return `${username}@${hostname} ${folder}`;
}

export function setTerminalPrompt(prompt: string) {
  state.prompt = prompt;
}

export function getTerminalPrompt(): string {
  return state.prompt;
}

export function appendTerminalLine(text: string, kind: TerminalLineKind = "output") {
  const clean = stripTerminalEscapeSequences(text).replace(/\r$/, "");
  if (!clean && kind === "output") return;

  state.lines.push({
    id: state.nextId++,
    text: clean,
    kind,
  });

  if (state.lines.length > MAX_LINES) {
    state.lines.splice(0, state.lines.length - MAX_LINES);
  }
}

export function logTerminalCommand(command: string, source = "omnisync") {
  appendTerminalLine(`── ${source} ──`, "system");
  appendTerminalLine(`${state.prompt} % ${command}`, "command");
}

export function clearTerminal() {
  state.lines = [];
}

export function getTerminalSnapshot(sinceId = 0) {
  const lines = sinceId > 0 ? state.lines.filter((line) => line.id > sinceId) : state.lines;
  return {
    lines,
    prompt: state.prompt,
    isManualRunning: state.isManualRunning,
    lastId: state.lines.length > 0 ? state.lines[state.lines.length - 1].id : 0,
  };
}

export async function runManualTerminalCommand(cwd: string, command: string): Promise<number> {
  if (state.isManualRunning) {
    appendTerminalLine("Another command is still running. Wait for it to finish.", "error");
    return 1;
  }

  const trimmed = command.trim();
  if (!trimmed) return 0;

  logTerminalCommand(trimmed, "manual");
  state.isManualRunning = true;

  return new Promise((resolve) => {
    const child = spawnLoginCommand(trimmed, {
      cwd,
      env: buildWorkspaceChildEnv(cwd, { mode: "inherit" }),
    });

    state.manualProcess = child;

    const handleChunk = (data: Buffer, isError: boolean) => {
      data
        .toString()
        .split("\n")
        .forEach((line) => {
          if (line.trim()) {
            appendTerminalLine(line, isError ? "error" : "output");
          }
        });
    };

    child.stdout?.on("data", (data) => handleChunk(data, false));
    child.stderr?.on("data", (data) => handleChunk(data, true));

    child.on("error", (err) => {
      appendTerminalLine(`Failed to start command: ${err.message}`, "error");
      state.isManualRunning = false;
      state.manualProcess = null;
      resolve(1);
    });

    child.on("close", (code) => {
      appendTerminalLine(
        `Process exited with code ${code ?? 0}`,
        code === 0 || code === null ? "system" : "error"
      );
      state.isManualRunning = false;
      state.manualProcess = null;
      resolve(code ?? 1);
    });
  });
}
