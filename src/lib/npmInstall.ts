import { promises as fs } from "fs";
import path from "path";

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

/** True when bin/esbuild is a native executable instead of the JS postinstall stub. */
export async function isNativeExecutable(filePath: string): Promise<boolean> {
  try {
    const handle = await fs.open(filePath, "r");
    const header = Buffer.alloc(4);
    await handle.read(header, 0, 4, 0);
    await handle.close();

    // Mach-O (32/64-bit), ELF, or PE — not a #! node script.
    const isMachO =
      header[0] === 0xcf &&
      header[1] === 0xfa &&
      header[2] === 0xed &&
      (header[3] === 0xfe || header[3] === 0xce);
    const isElf =
      header[0] === 0x7f &&
      header[1] === 0x45 &&
      header[2] === 0x4c &&
      header[3] === 0x46;
    const isPe = header[0] === 0x4d && header[1] === 0x5a;

    return isMachO || isElf || isPe;
  } catch {
    return false;
  }
}

/**
 * esbuild postinstall breaks when optional @esbuild/* platform packages are missing
 * or bin/esbuild is already a native binary from a prior partial install (npm then
 * runs `node` on the Mach-O file and fails with "Invalid or unexpected token").
 */
export async function resetBrokenEsbuildInstall(cwd: string): Promise<string | null> {
  const esbuildDir = path.join(cwd, "node_modules", "esbuild");
  const esbuildScope = path.join(cwd, "node_modules", "@esbuild");
  const esbuildBin = path.join(esbuildDir, "bin", "esbuild");

  if (!(await pathExists(esbuildDir))) {
    return null;
  }

  const scopeMissing = !(await pathExists(esbuildScope));
  const binIsNative = (await pathExists(esbuildBin)) && (await isNativeExecutable(esbuildBin));

  if (!scopeMissing && !binIsNative) {
    return null;
  }

  await fs.rm(esbuildDir, { recursive: true, force: true });

  if (scopeMissing) {
    return (
      "Removed incomplete esbuild install (missing @esbuild platform packages). " +
      "Reinstalling with optional dependencies."
    );
  }

  return (
    "Removed stale esbuild binary (native bin/esbuild would break postinstall). " +
    "Reinstalling esbuild."
  );
}

/**
 * Strip ANSI CSI sequences and OSC sequences (e.g. terminal shell-integration markers
 * like "\x1b]1337;CurrentDir=...\x07" that iTerm2/VS Code/Cursor inject into interactive
 * login shells) from captured process output before displaying it to the user.
 */
export function stripTerminalEscapeSequences(str: string): string {
  return str
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, "");
}

/** Drop npm's unreadable Buffer byte dumps from install error output. */
export function sanitizeNpmInstallLogLine(line: string): string | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  if (/Buffer\(\d+\)\s*\[Uint8Array\]/.test(trimmed)) {
    return null;
  }

  if (/npm error\s+\d+(?:,\s*\d+){5,}/.test(trimmed) || /^\d+(?:,\s*\d+){5,}/.test(trimmed)) {
    return null;
  }

  if (/\.\.\.\s+\d+\s+more items/.test(trimmed)) {
    return null;
  }

  if (trimmed === "]" || trimmed === "}" || trimmed === "],") {
    return null;
  }

  if (/SyntaxError: Invalid or unexpected token/.test(trimmed)) {
    return "esbuild postinstall failed: bin/esbuild is not a Node script (stale native binary from a partial install).";
  }

  return line;
}

export function npmInstallArgs(baseArgs: string[] = ["install"]): string[] {
  // Match the manual workflow: plain `npm install` (deps + devDeps).
  // Callers must run with NODE_ENV=development so npm does not omit devDependencies.
  return [...baseArgs];
}

/** Use plain `npm install`, same as a normal Terminal workflow after clone. */
export async function resolveDependencyInstallArgs(
  _cwd: string
): Promise<string[]> {
  return npmInstallArgs(["install"]);
}
