import fs from "node:fs";
import path from "node:path";
import os from "node:os";

export function getWritableDataDir(): string {
  if (process.env.VERCEL) {
    const tmpDir = path.join(os.tmpdir(), "darshan-crm-data");
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
  try {
    const localDir = path.join(process.cwd(), "data");
    fs.mkdirSync(localDir, { recursive: true });
    fs.accessSync(localDir, fs.constants.W_OK);
    return localDir;
  } catch {
    const tmpDir = path.join(os.tmpdir(), "darshan-crm-data");
    fs.mkdirSync(tmpDir, { recursive: true });
    return tmpDir;
  }
}

export function getWritableUploadsDir(): string {
  const uploadsDir = path.join(getWritableDataDir(), "uploads");
  fs.mkdirSync(uploadsDir, { recursive: true });
  return uploadsDir;
}
