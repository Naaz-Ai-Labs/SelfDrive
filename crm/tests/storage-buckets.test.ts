/**
 * Storage path safety.
 *
 * These guard the private customer-document bucket. The upload route builds a
 * storage key from a caller-supplied `folder` value, and before this guard existed
 * it only stripped leading/trailing slashes — so `../` segments passed straight
 * through into the key.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { isSafeStoragePath, sanitizeFolder, PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET } from "../src/lib/storage-buckets";

test("accepts the key shapes the app actually generates", () => {
  assert.equal(isSafeStoragePath("docs/2026-08/licence_1234_abcd.jpg"), true);
  assert.equal(isSafeStoragePath("vehicles/2026-08/thar.avif"), true);
  assert.equal(isSafeStoragePath("a"), true);
});

test("rejects directory traversal", () => {
  assert.equal(isSafeStoragePath("../secrets/key.pem"), false);
  assert.equal(isSafeStoragePath("docs/../../etc/passwd"), false);
  assert.equal(isSafeStoragePath("docs/..%2Fetc"), false, "encoded slash is not an allowed character");
  assert.equal(isSafeStoragePath(".."), false);
});

test("rejects absolute paths and Windows separators", () => {
  assert.equal(isSafeStoragePath("/etc/passwd"), false);
  assert.equal(isSafeStoragePath("docs\\..\\secret.jpg"), false);
});

test("rejects null bytes, which can truncate a path in native code", () => {
  assert.equal(isSafeStoragePath("docs/file.jpg\0.png"), false);
});

test("rejects empty and absurdly long keys", () => {
  assert.equal(isSafeStoragePath(""), false);
  assert.equal(isSafeStoragePath("a/".repeat(400)), false);
});

test("rejects characters outside the generated alphabet", () => {
  assert.equal(isSafeStoragePath("docs/file name.jpg"), false, "space");
  assert.equal(isSafeStoragePath("docs/$(whoami).jpg"), false, "shell metacharacters");
  assert.equal(isSafeStoragePath("docs/file?x=1.jpg"), false, "query separator");
});

test("sanitizeFolder trims slashes but still refuses traversal", () => {
  assert.equal(sanitizeFolder("/vehicles/2026-08/"), "vehicles/2026-08");
  assert.equal(sanitizeFolder("../escape"), null);
  assert.equal(sanitizeFolder("   "), null);
  assert.equal(sanitizeFolder(null), null);
  assert.equal(sanitizeFolder(undefined), null);
});

test("public media and private documents are different buckets", () => {
  // If these ever collapse to one value, government IDs become world-readable again.
  assert.notEqual(PUBLIC_MEDIA_BUCKET, PRIVATE_DOCS_BUCKET);
});
