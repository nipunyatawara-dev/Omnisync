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
  gitToken?: string; // Storing GitHub PAT
  password?: string; // Local access password
  workspacePath?: string; // Selected local repo workspace directory path
  workspaceType?: "automatic" | "manual";
  branchProtection?: boolean;
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

const ALGORITHM = "aes-256-cbc";
const IV_LENGTH = 16;

function getMachineSecret(): string {
  try {
    const userInfo = os.userInfo();
    return `${userInfo.username}-${userInfo.homedir}-${os.hostname()}`;
  } catch {
    return "omnisync-fallback-secret-2026";
  }
}

const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.OMNISYNC_ENCRYPTION_SECRET || getMachineSecret(),
  "omnisync-salt-123",
  32
);

export function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  let encrypted = cipher.update(text, "utf8", "hex");
  encrypted += cipher.final("hex");
  return iv.toString("hex") + ":" + encrypted;
}

export function decrypt(text: string): string {
  try {
    const textParts = text.split(":");
    const ivHex = textParts.shift();
    if (!ivHex) return text;
    const iv = Buffer.from(ivHex, "hex");
    const encryptedHex = textParts.join(":");
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    // If decryption fails, return original text (backward compatibility)
    return text;
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
    return profiles.map((p) => ({
      ...p,
      gitToken: p.gitToken ? decrypt(p.gitToken) : undefined,
      password: p.password ? decrypt(p.password) : undefined,
    }));
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
    password: p.password ? encrypt(p.password) : undefined,
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
  
  const updatedProfile: UserProfile = {
    ...profiles[index],
    ...updates,
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

