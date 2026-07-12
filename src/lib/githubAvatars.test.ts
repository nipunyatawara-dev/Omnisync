import { describe, it, expect } from "vitest";
import {
  githubLoginFromEmail,
  parseGithubRepoFullName,
  githubAvatarUrlForLogin,
} from "@/lib/githubAvatars";

describe("githubAvatars", () => {
  it("parses github remote URLs", () => {
    expect(parseGithubRepoFullName("https://github.com/acme/app.git")).toBe("acme/app");
    expect(parseGithubRepoFullName("git@github.com:acme/app.git")).toBe("acme/app");
    expect(parseGithubRepoFullName("https://gitlab.com/acme/app")).toBeNull();
  });

  it("extracts login from noreply emails", () => {
    expect(githubLoginFromEmail("12345+jane@users.noreply.github.com")).toBe("jane");
    expect(githubLoginFromEmail("jane@users.noreply.github.com")).toBe("jane");
    expect(githubLoginFromEmail("jane@example.com")).toBeNull();
  });

  it("builds avatar URLs", () => {
    expect(githubAvatarUrlForLogin("octocat")).toContain("octocat.png");
  });
});
