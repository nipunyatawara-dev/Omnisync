import { promises as fs } from "fs";
import path from "path";
import crypto from "crypto";
import os from "os";

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

const USER_DATA_DIR = path.join(process.cwd(), "User data");
const PROFILES_FILE = path.join(USER_DATA_DIR, "profiles.json");
const CONFIG_FILE = path.join(USER_DATA_DIR, "config.json"); // To store active profile
const OAUTH_FILE = path.join(USER_DATA_DIR, "oauth.json"); // To store OAuth config credentials

const ALGORITHM = "aes-256-gcm";
const LEGACY_ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 12; // Standard for GCM
const LEGACY_IV_LENGTH = 16;
const TAG_LENGTH = 16;

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

const ENCRYPTION_KEY = crypto.scryptSync(getMachineSecret(), "omnisync-salt-123", 32);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
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

export function decrypt(text: string): string {
  try {
    const parts = text.split(":");
    if (parts.length === 2) {
      // Legacy aes-256-cbc support
      const ivHex = parts[0];
      const encryptedHex = parts[1];
      const iv = Buffer.from(ivHex, "hex");
      const decipher = crypto.createDecipheriv(LEGACY_ALGORITHM, ENCRYPTION_KEY, iv);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    } else if (parts.length === 3) {
      // Modern aes-256-gcm
      const ivHex = parts[0];
      const tagHex = parts[1];
      const encryptedHex = parts[2];
      const iv = Buffer.from(ivHex, "hex");
      const tag = Buffer.from(tagHex, "hex");
      const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
      decipher.setAuthTag(tag);
      let decrypted = decipher.update(encryptedHex, "hex", "utf8");
      decrypted += decipher.final("utf8");
      return decrypted;
    }
    return text;
  } catch (err) {
    console.error("Decryption failed. The secret key might be invalid or file is tampered.", err);
    throw new Error("Decryption failed");
  }
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
    return profiles.map((p) => {
      try {
        return {
          ...p,
          gitToken: p.gitToken ? decrypt(p.gitToken) : undefined,
          // Password is stored as a one-way hash; pass it through untouched.
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
  await fs.writeFile(PROFILES_FILE, JSON.stringify({ profiles: encryptedProfiles }, null, 2), "utf-8");
}

// Create a new profile
export async function createProfile(draft: Omit<UserProfile, "id" | "createdAt" | "updatedAt">): Promise<UserProfile> {
  const profiles = await getProfiles();
  const id = draft.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + Date.now().toString(36);
  const now = new Date().toISOString();
  
  const newProfile: UserProfile = {
    ...draft,
    id,
    createdAt: now,
    updatedAt: now,
  };
  
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
  await fs.writeFile(CONFIG_FILE, JSON.stringify({ activeProfileId: id }, null, 2), "utf-8");
}

// Get full active profile
export async function getActiveProfile(): Promise<UserProfile | null> {
  const activeId = await getActiveProfileId();
  if (!activeId) return null;
  const profiles = await getProfiles();
  return profiles.find((p) => p.id === activeId) || null;
}

// Delete profile
export async function deleteProfile(id: string): Promise<void> {
  const profiles = await getProfiles();
  const filtered = profiles.filter((p) => p.id !== id);
  await saveProfiles(filtered);
  
  const activeId = await getActiveProfileId();
  if (activeId === id) {
    await setActiveProfileId(filtered[0]?.id || null);
  }
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
    return {
      githubClientId: process.env.GITHUB_CLIENT_ID || json.githubClientId || undefined,
      githubClientSecret: process.env.GITHUB_CLIENT_SECRET || (json.githubClientSecret ? decrypt(json.githubClientSecret) : undefined),
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
  await fs.writeFile(OAUTH_FILE, JSON.stringify(encryptedConfig, null, 2), "utf-8");
}

