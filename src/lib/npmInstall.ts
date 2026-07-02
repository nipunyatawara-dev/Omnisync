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

/**
 * esbuild postinstall breaks when optional @esbuild/* platform packages are missing
 * but bin/esbuild is already a native binary from a prior partial install (npm then
 * runs `node` on the Mach-O file and fails with "Invalid or unexpected token").
 */
export async function resetBrokenEsbuildInstall(cwd: string): Promise<string | null> {
  const esbuildDir = path.join(cwd, "node_modules", "esbuild");
  const esbuildScope = path.join(cwd, "node_modules", "@esbuild");

  if (!(await pathExists(esbuildDir))) {
    return null;
  }

  if (await pathExists(esbuildScope)) {
    return null;
  }

  await fs.rm(esbuildDir, { recursive: true, force: true });

  return (
    "Removed incomplete esbuild install (missing @esbuild platform packages). " +
    "Reinstalling with optional dependencies."
  );
}

export function npmInstallArgs(baseArgs: string[] = ["install"]): string[] {
  return [...baseArgs, "--include=optional"];
}
