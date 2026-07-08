import { describe, it, expect } from "vitest";
import {
  MAX_READ_BYTES,
  MAX_WRITE_BYTES,
  exceedsReadLimit,
  exceedsWriteLimit,
} from "@/lib/fileLimits";

describe("fileLimits", () => {
  it("allows content within write limit", () => {
    expect(exceedsWriteLimit("hello")).toBe(false);
    expect(exceedsWriteLimit("x".repeat(MAX_WRITE_BYTES))).toBe(false);
  });

  it("rejects content over write limit", () => {
    expect(exceedsWriteLimit("x".repeat(MAX_WRITE_BYTES + 1))).toBe(true);
  });

  it("allows files within read limit", () => {
    expect(exceedsReadLimit(MAX_READ_BYTES)).toBe(false);
    expect(exceedsReadLimit(0)).toBe(false);
  });

  it("rejects files over read limit", () => {
    expect(exceedsReadLimit(MAX_READ_BYTES + 1)).toBe(true);
  });
});
