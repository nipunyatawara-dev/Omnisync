import { describe, it, expect } from "vitest";
import {
  parseInstallSummary,
  classifyLogLine,
  dedupeLogs,
} from "@/lib/parseInstallLogs";

describe("parseInstallSummary", () => {
  it("extracts npm install stats from logs", () => {
    const logs = [
      "added 226 packages, and audited 227 packages in 7s",
      "3 vulnerabilities (2 low, 1 high)",
    ];
    const summary = parseInstallSummary(logs);
    expect(summary.packagesAdded).toBe(226);
    expect(summary.packagesAudited).toBe(227);
    expect(summary.durationSeconds).toBe(7);
    expect(summary.vulnerabilityLine).toContain("3 vulnerabilities");
  });
});

describe("classifyLogLine", () => {
  it("classifies tone by content", () => {
    expect(classifyLogLine("Error: install failed")).toBe("error");
    expect(classifyLogLine("added 10 packages, and audited 10 packages in 2s")).toBe("success");
    expect(classifyLogLine("3 vulnerabilities (1 high)")).toBe("warn");
  });
});

describe("dedupeLogs", () => {
  it("removes consecutive duplicates", () => {
    expect(
      dedupeLogs(["ok", "ok", "done", "done", "done"])
    ).toEqual(["ok", "done"]);
  });
});
