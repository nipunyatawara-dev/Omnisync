import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";
import { getUserDataDir, writeUserDataJson } from "@/lib/userDataDir";

export interface UserProfile {
  id: string;
  name: string;
  profession: string;
  email?: string;
  phone?: string;
  businessName?: string;
  profilePic?: string;
  gitToken?: string; // Storing GitHub PAT (server-side only; never sent to the client)
  hasGitToken?: boolean; // Client-facing flag indicating a token is stored
  password?: string; // Local access password (stored as a one-way hash)
  workspacePath?: string; // Selected local repo workspace directory path
  workspaceType?: "automatic" | "manual";
  branchProtection?: boolean;
  protectedBranches?: string[];
  autoFetch?: boolean;
  port?: number;
  runCommand?: string;
  buildCommand?: string;
  createdAt: string;
  updatedAt: string;
}

const USER_DATA_DIR = getUserDataDir();
const PROFILES_FILE = path.join(USER_DATA_DIR, "profiles.json");
const CONFIG_FILE = path.join(USER_DATA_DIR, "config.json"); // To store active profile
const OAUTH_FILE = path.join(USER_DATA_DIR, "oauth.json"); // To store OAuth config credentials
const GITHUB_SESSION_FILE = path.join(USER_DATA_DIR, "github-session.json");

export interface GithubSession {
  token: string;
  login?: string;
  avatarUrl?: string;
  updatedAt: string;
}

const ALGORITHM = "aes-256-gcm";
const LEGACY_ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 12; // Standard for GCM
const LEGACY_SALT = "omnisync-salt-123";
const SALT_FILE = path.join(USER_DATA_DIR, "encryption-salt.bin");

function getMachineSecret(): string {
  if (process.env.OMNISYNC_ENCRYPTION_SECRET) {
    return process.env.OMNISYNC_ENCRYPTION_SECRET;
  }
  try {
    const userInfo = os.userInfo();
    return `${userInfo.username}-${userInfo.homedir}-${os.hostname()}`;
  } catch {
    throw new Error(
      "OMNISYNC_ENCRYPTION_SECRET is not set and OS user info is unavailable. Cannot encrypt credentials."
    );
  }
}

let cachedSalt: Buffer | null = null;
let cachedKey: Buffer | null = null;
let cachedLegacyKey: Buffer | null = null;

function getOrCreateSaltSync(): Buffer {
  if (cachedSalt) return cachedSalt;
  try {
    fsSync.mkdirSync(USER_DATA_DIR, { recursive: true });
    if (fsSync.existsSync(SALT_FILE)) {
      cachedSalt = fsSync.readFileSync(SALT_FILE);
      if (cachedSalt.length >= 16) return cachedSalt;
    }
    cachedSalt = crypto.randomBytes(32);
    fsSync.writeFileSync(SALT_FILE, cachedSalt, { mode: 0o600 });
    try {
      fsSync.chmodSync(SALT_FILE, 0o600);
    } catch {}
    return cachedSalt;
  } catch (err) {
    console.error("[profiles] salt file unavailable, using ephemeral salt:", err);
    cachedSalt = crypto.randomBytes(32);
    return cachedSalt;
  }
}

function getEncryptionKey(): Buffer {
  if (!cachedKey) {
    cachedKey = crypto.scryptSync(getMachineSecret(), getOrCreateSaltSync(), 32);
  }
  return cachedKey;
}

function getLegacyEncryptionKey(): Buffer {
  if (!cachedLegacyKey) {
    cachedLegacyKey = crypto.scryptSync(getMachineSecret(), LEGACY_SALT, 32);
  }
  return cachedLegacyKey;
}

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag().toString("hex");
  return iv.toString("hex") + ":" + authTag + ":" + encrypted;
}

const PASSWORD_PREFIX = "scrypt$";

// One-way password hashing. Local access passwords must never be reversible.
export function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16);
  const derived = crypto.scryptSync(plain, salt, 64);
  return `${PASSWORD_PREFIX}${salt.toString("hex")}$${derived.toString("hex")}`;
}

export function isHashedPassword(value: string): boolean {
  return value.startsWith(PASSWORD_PREFIX);
}

export function verifyPassword(plain: string, stored: string): boolean {
  if (!isHashedPassword(stored)) return false;
  const [, saltHex, hashHex] = stored.split("$");
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const derived = crypto.scryptSync(plain, salt, expected.length);
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

function decryptWithKey(text: string, key: Buffer): string | null {
  try {
    const parts = text.split(":");
    if (parts.length === 2) {
      const [ivHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, key, iv);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
    if (parts.length === 3) {
      const [ivHex, tagHex, encryptedHex] = parts;
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
    return null;
  } catch {
    return null;
  }
}

/** Returns plaintext and whether the ciphertext used a legacy key/format (needs remigration). */
export function decryptWithMeta(text: string): { plaintext: string; needsRemigration: boolean } {
  const modern = decryptWithKey(text, getEncryptionKey());
  if (modern !== null && text.split(":").length === 3) {
    return { plaintext: modern, needsRemigration: false };
  }

  const legacy = decryptWithKey(text, getLegacyEncryptionKey());
  if (legacy !== null) {
    return { plaintext: legacy, needsRemigration: true };
  }

  if (modern !== null) {
    return { plaintext: modern, needsRemigration: text.split(":").length === 2 };
  }

  console.error("Decryption failed. The secret key might be invalid or file is tampered.");
  throw new Error("Decryption failed");
}

export function decrypt(text: string): string {
  return decryptWithMeta(text).plaintext;
}

export function isLegacyCiphertext(text: string): boolean {
  return text.split(":").length === 2;
}

// Ensure directory exists
async function ensureDirs() {
  await fs.mkdir(USER_DATA_DIR, { recursive: true });
}

// Read all profiles
export async function getProfiles(): Promise<UserProfile[]> {
  try {
    await ensureDirs();
    const data = await fs.readFile(PROFILES_FILE, "utf-8");
    const json = JSON.parse(data);
    const profiles = (json.profiles || []) as UserProfile[];
    let needsRemigration = false;
    const decrypted = profiles.map((p) => {
      try {
        if (!p.gitToken) {
          return {
            ...p,
            gitToken: undefined,
            password: p.password,
          };
        }
        const meta = decryptWithMeta(p.gitToken);
        if (meta.needsRemigration) needsRemigration = true;
        return {
          ...p,
          gitToken: meta.plaintext,
          password: p.password,
        };
      } catch (err) {
        console.error(`Failed to decrypt credentials for profile: ${p.id}`, err);
        return {
          ...p,
          gitToken: undefined,
          password: p.password,
        };
      }
    });
    if (needsRemigration) {
      // Re-encrypt CBC / legacy-salt ciphertext with current GCM + per-install salt.
      await saveProfiles(decrypted);
    }
    return decrypted;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === "ENOENT") {
      return [];
    }
    console.error("Error reading profiles", error);
    return [];
  }
}

// Write profiles list
export async function saveProfiles(profiles: UserProfile[]): Promise<void> {
  await ensureDirs();
  const encryptedProfiles = profiles.map((p) => ({
    ...p,
    gitToken: p.gitToken ? encrypt(p.gitToken) : undefined,
    password: p.password
      ? (isHashedPassword(p.password) ? p.password : hashPassword(p.password))
      : undefined,
  }));
  await writeUserDataJson(PROFILES_FILE, { profiles: encryptedProfiles });
}

// Create a new profile
export async function createProfile(draft: Omit<UserProfile, "id" | "createdAt" | "updatedAt">): Promise<UserProfile> {
  const profiles = await getProfiles();
  const id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  const now = new Date().toISOString();
  const gitToken = draft.gitToken || (await getGithubSession())?.token;

  const newProfile: UserProfile = {
    ...draft,
    gitToken,
    id,
    createdAt: now,
    updatedAt: now,
  };

  if (gitToken) {
    await saveGithubSession({ token: gitToken, login: draft.name });
  }
  
  profiles.push(newProfile);
  await saveProfiles(profiles);
  await setActiveProfileId(id);
  return newProfile;
}

// Update profile details
export async function updateProfile(id: string, updates: Partial<UserProfile>): Promise<UserProfile> {
  const profiles = await getProfiles();
  const index = profiles.findIndex((p) => p.id === id);
  if (index === -1) {
    throw new Error("Profile not found");
  }
  
  const { id: _, createdAt: __, ...allowedUpdates } = updates;
  const updatedProfile: UserProfile = {
    ...profiles[index],
    ...allowedUpdates,
    updatedAt: new Date().toISOString(),
  };

  if (updatedProfile.gitToken) {
    await saveGithubSession({
      token: updatedProfile.gitToken,
      login: updatedProfile.name,
    });
  }
  
  profiles[index] = updatedProfile;
  await saveProfiles(profiles);
  return updatedProfile;
}

// Get active profile ID
export async function getActiveProfileId(): Promise<string | null> {
  try {
    await ensureDirs();
    const data = await fs.readFile(CONFIG_FILE, "utf-8");
    const json = JSON.parse(data);
    return json.activeProfileId || null;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err && err.code === "ENOENT") {
      const profiles = await getProfiles();
      if (profiles.length > 0) {
        return profiles[0].id;
      }
      return null;
    }
    return null;
  }
}

// Set active profile ID
export async function setActiveProfileId(id: string | null): Promise<void> {
  await ensureDirs();
  await writeUserDataJson(CONFIG_FILE, { activeProfileId: id });
}

// Get full active profile
export async function getActiveProfile(): Promise<UserProfile | null> {
  const activeId = await getActiveProfileId();
  if (!activeId) return null;
  return getProfileById(activeId);
}

export async function getProfileById(id: string): Promise<UserProfile | null> {
  const profiles = await getProfiles();
  return profiles.find((p) => p.id === id) || null;
}

// Delete profile
export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  const profileToDelete = profiles.find((p) => p.id === id);

  if (profileToDelete?.gitToken) {
    await saveGithubSession({
      token: profileToDelete.gitToken,
      login: profileToDelete.name,
    });
  }

  const filtered = profiles.filter((p) => p.id !== id);
  await saveProfiles(filtered);
  
  const activeId = await getActiveProfileId();
  if (activeId === id) {
    await setActiveProfileId(filtered[0]?.id || null);
  }
}

export async function getGithubSession(): Promise<GithubSession | null> {
  try {
    await ensureDirs();
    const data = await fs.readFile(GITHUB_SESSION_FILE, "utf-8");
    const json = JSON.parse(data) as { token?: string; login?: string; avatarUrl?: string; updatedAt?: string };
    if (!json.token) {
      return null;
    }

    const meta = decryptWithMeta(json.token);
    const session: GithubSession = {
      token: meta.plaintext,
      login: json.login,
      avatarUrl: json.avatarUrl,
      updatedAt: json.updatedAt || new Date().toISOString(),
    };
    if (meta.needsRemigration) {
      await saveGithubSession(session);
    }
    return session;
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code === "ENOENT") {
      return null;
    }
    console.error("Error reading GitHub session", error);
    return null;
  }
}

export async function saveGithubSession(session: Pick<GithubSession, "token" | "login" | "avatarUrl">): Promise<void> {
  await ensureDirs();
  await writeUserDataJson(GITHUB_SESSION_FILE, {
    token: encrypt(session.token),
    login: session.login,
    avatarUrl: session.avatarUrl,
    updatedAt: new Date().toISOString(),
  });
}

export async function clearGithubSession(): Promise<void> {
  try {
    await fs.unlink(GITHUB_SESSION_FILE);
  } catch (error: unknown) {
    const err = error as { code?: string };
    if (err?.code !== "ENOENT") {
      throw error;
    }
  }
}

export async function hasGithubSession(): Promise<boolean> {
  const session = await getGithubSession();
  return !!session?.token;
}

export async function getGithubToken(): Promise<string | null> {
  const profile = await getActiveProfile();
  if (profile?.gitToken) {
    return profile.gitToken;
  }

  const session = await getGithubSession();
  return session?.token || null;
}

export interface OauthConfig {
  githubClientId?: string;
  githubClientSecret?: string;
}

export async function getOauthConfig(): Promise<OauthConfig> {
  try {
    await ensureDirs();
    const data = await fs.readFile(OAUTH_FILE, "utf-8");
    const json = JSON.parse(data);
    let clientSecret: string | undefined;
    if (json.githubClientSecret) {
      const meta = decryptWithMeta(json.githubClientSecret);
      clientSecret = meta.plaintext;
      if (meta.needsRemigration) {
        await saveOauthConfig({
          githubClientId: json.githubClientId,
          githubClientSecret: clientSecret,
        });
      }
    }
    return {
      githubClientId: process.env.GITHUB_CLIENT_ID || json.githubClientId || undefined,
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET || clientSecret,
    };
  } catch {
    return {
      githubClientId: process.env.GITHUB_CLIENT_ID || undefined,
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET || undefined,
    };
  }
}

export async function saveOauthConfig(config: OauthConfig): Promise<void> {
  await ensureDirs();
  const encryptedConfig = {
    ...config,
    githubClientSecret: config.githubClientSecret ? encrypt(config.githubClientSecret) : undefined,
  };
  await writeUserDataJson(OAUTH_FILE, encryptedConfig);
}

