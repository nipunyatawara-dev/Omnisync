import { NextResponse } from "next/server";

export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return NextResponse.json({ error: "Missing or invalid Authorization header" }, { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    const res = await fetch("https://api.github.com/user/repos?per_page=100&sort=updated", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "User-Agent": "OmniSync-Local-Client",
      },
    });

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json({ error: `GitHub API error: ${errText}` }, { status: res.status });
    }

    interface GitHubRepository {
      id: number;
      name: string;
      full_name: string;
      description: string | null;
      clone_url: string;
      private: boolean;
      owner: {
        login: string;
      };
    }

    const repos = await res.json() as GitHubRepository[];
    
    // Map to a clean, lightweight list of repositories
    const mapped = repos.map((repo: GitHubRepository) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      cloneUrl: repo.clone_url,
      private: repo.private,
      owner: repo.owner.login,
    }));

    return NextResponse.json({ repos: mapped });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
