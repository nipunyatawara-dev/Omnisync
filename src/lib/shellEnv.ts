import { createRequire } from "node:module";
import type { ChildProcess, SpawnOptions } from "child_process";
import path from "node:path";

type ShellEnvModule = {
  getLoginShellPath: () => string;
  augmentProcessEnv: (base?: NodeJS.ProcessEnv) => NodeJS.ProcessEnv;
  resolveCommand: (name: string) => string;
  spawnLoginCommand: (commandLine: string, options?: SpawnOptions) => ChildProcess;
  spawnTool: (name: string, args: string[], options?: SpawnOptions) => ChildProcess;
};

const requireFromCwd = createRequire(path.join(process.cwd(), "package.json"));

let shellEnvModule: ShellEnvModule | null = null;

function loadShellEnv(): ShellEnvModule {
  if (!shellEnvModule) {
    shellEnvModule = requireFromCwd(path.join(process.cwd(), "shellEnv.js")) as ShellEnvModule;
  }
  return shellEnvModule;
}

export function getLoginShellPath(): string {
  return loadShellEnv().getLoginShellPath();
}

export function augmentProcessEnv(base: NodeJS.ProcessEnv = process.env): NodeJS.ProcessEnv {
  return loadShellEnv().augmentProcessEnv(base);
}

export function resolveCommand(name: string): string {
  return loadShellEnv().resolveCommand(name);
}

export function spawnLoginCommand(commandLine: string, options: SpawnOptions = {}) {
  return loadShellEnv().spawnLoginCommand(commandLine, options);
}

export function spawnTool(name: string, args: string[], options: SpawnOptions = {}) {
  return loadShellEnv().spawnTool(name, args, options);
}
