import { describe, it, expect, beforeAll } from "vitest";
import { hashPassword, verifyPassword, isHashedPassword, encrypt, decrypt } from "@/lib/profiles";

beforeAll(() => {
  process.env.OMNISYNC_ENCRYPTION_SECRET = "test-secret-for-vitest-only-32chars!";
});

describe("profiles password hashing", () => {
  it("hashes and verifies passwords", () => {
    const hashed = hashPassword("my-local-password");
    expect(isHashedPassword(hashed)).toBe(true);
    expect(verifyPassword("my-local-password", hashed)).toBe(true);
    expect(verifyPassword("wrong", hashed)).toBe(false);
  });
});

describe("profiles encryption", () => {
  it("encrypts and decrypts tokens", () => {
    const plain = "ghp_test_token_value";
    const encrypted = encrypt(plain);
    expect(encrypted).not.toBe(plain);
    expect(decrypt(encrypted)).toBe(plain);
  });
});
