import fs from "fs";
import path from "path";
import { cpSync, mkdirSync } from "fs";

const root = process.cwd();
const standalone = path.join(root, ".next", "standalone");
const staticSrc = path.join(root, ".next", "static");
const staticDest = path.join(standalone, ".next", "static");
const publicSrc = path.join(root, "public");
const publicDest = path.join(standalone, "public");
const shellEnvSrc = path.join(root, "shellEnv.js");
const shellEnvDest = path.join(standalone, "shellEnv.js");

if (!fs.existsSync(standalone)) {
  console.error("Missing .next/standalone — ensure next.config.ts sets output: \"standalone\"");
  process.exit(1);
}

mkdirSync(path.join(standalone, ".next"), { recursive: true });
cpSync(staticSrc, staticDest, { recursive: true });
cpSync(publicSrc, publicDest, { recursive: true });
cpSync(shellEnvSrc, shellEnvDest);
