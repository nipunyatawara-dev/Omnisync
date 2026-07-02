import { NextResponse } from "next/server";
import {
  getProfiles,
  createProfile,
  updateProfile,
  getActiveProfileId,
  setActiveProfileId,
  deleteProfile,
  verifyPassword,
  getGithubSession,
  hasGithubSession,
  saveGithubSession,
  type UserProfile,
} from "@/lib/profiles";

function sanitizeProfile(profile: UserProfile) {
  const { password: _password, gitToken, ...rest } = profile;
  return {
    ...rest,
    hasGitToken: !!gitToken,
  };
}

export async function GET() {
  const profiles = await getProfiles();
  const activeProfileId = await getActiveProfileId();
  const sanitized = profiles.map(sanitizeProfile);

  if (!(await getGithubSession())) {
    const profileWithToken = profiles.find((profile) => profile.gitToken);
    if (profileWithToken?.gitToken) {
      await saveGithubSession({
        token: profileWithToken.gitToken,
        login: profileWithToken.name,
      });
    }
  }

  const githubConnected = await hasGithubSession();
  return NextResponse.json({ profiles: sanitized, activeProfileId, githubConnected });
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action } = body;

    if (action === "create") {
      const { name, profession, email, phone, businessName, profilePic, gitToken, password } = body;
      const newProfile = await createProfile({
        name,
        profession,
        email,
        phone,
        businessName,
        profilePic,
        gitToken,
        password,
      });
      return NextResponse.json({ success: true, profile: sanitizeProfile(newProfile) });
    }

    if (action === "select") {
      const { id, password } = body;
      if (id) {
        const profiles = await getProfiles();
        const target = profiles.find((p) => p.id === id);
        if (target?.password) {
          if (!password || !verifyPassword(String(password), target.password)) {
            return NextResponse.json({ error: "Invalid profile password" }, { status: 403 });
          }
        }
      }
      await setActiveProfileId(id);
      return NextResponse.json({ success: true });
    }

    if (action === "verify-password") {
      const { id, password } = body;
      const profiles = await getProfiles();
      const target = profiles.find((p) => p.id === id);
      if (!target) {
        return NextResponse.json({ error: "Profile not found" }, { status: 404 });
      }
      if (!target.password) {
        return NextResponse.json({ success: true, required: false });
      }
      const valid = !!password && verifyPassword(String(password), target.password);
      return NextResponse.json({ success: valid, required: true });
    }

    if (action === "update") {
      const { id, updates } = body;
      const updated = await updateProfile(id, updates);
      return NextResponse.json({ success: true, profile: sanitizeProfile(updated) });
    }

    if (action === "delete") {
      const { id } = body;
      await deleteProfile(id);
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (error: unknown) {
    console.error("[profiles] request failed:", error);
    return NextResponse.json({ error: "Profile operation failed" }, { status: 500 });
  }
}
