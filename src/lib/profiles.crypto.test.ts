import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from "vitest";
import path from "path";
import os from "os";
import { promises as fs } from "fs";
import crypto from "crypto";

describe("profiles encryption salt migration", () => {
  let tmpDir: string;

  beforeAll(() => {
    process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-vitest-only-32chars!";
  });

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "omnisync-crypto-"));
    process.env.OMNISYNC_USER_DATA_DIR = tmpDir;
    process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-vitest-only-32chars!";
    vi.resetModules();
  });

  afterEach(async () => {
    delete process.env.OMNISYNC_USER_DATA_DIR;
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("encrypts with GCM and round-trips", async () => {
    const { encrypt, decrypt } = await import("@/lib/profiles");
    const plain = "ghp_roundtrip_token";
    const encrypted = encrypt(plain);
    expect(encrypted.split(":")).toHaveLength(3);
    expect(decrypt(encrypted)).toBe(plain);
  });

  it("decrypts legacy CBC ciphertext encrypted with the fixed salt", async () => {
    const secret = process.env.OMNISYNC_ENCRYPTION_SECRET!;
    const key = crypto.scryptSync(secret, "omnisync-salt-123", 32);
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv("aes-256-cbc", key, iv);
    let enc = cipher.update("legacy-token-value", "utf8", "hex");
    enc += cipher.final("hex");
    const legacyCiphertext = `${iv.toString("hex")}:${enc}`;

    const { decryptWithMeta, encrypt } = await import("@/lib/profiles");
    const meta = decryptWithMeta(legacyCiphertext);
    expect(meta.plaintext).toBe("legacy-token-value");
    expect(meta.needsRemigration).toBe(true);
    expect(encrypt(meta.plaintext).split(":")).toHaveLength(3);
  });

  it("creates an encryption-salt.bin file", async () => {
    const { encrypt } = await import("@/lib/profiles");
    encrypt("trigger-salt");
    const saltPath = path.join(tmpDir, "encryption-salt.bin");
    const stat = await fs.stat(saltPath);
    expect(stat.size).toBeGreaterThanOrEqual(16);
    expect(stat.mode & 0o777).toBe(0o600);
  });
});
