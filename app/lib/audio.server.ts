import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { randomUUID } from "node:crypto";

export const CHUNK_SECONDS = 300;
export const CHUNK_THRESHOLD_SEC = 300;

interface SpawnResult {
  stdout: string;
  stderr: string;
  code: number;
}

async function runProcess(cmd: string, args: string[]): Promise<SpawnResult> {
  return await new Promise<SpawnResult>((resolve, reject) => {
    const child = spawn(cmd, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err: NodeJS.ErrnoException) => {
      if (err.code === "ENOENT") {
        reject(
          new Error(
            `${cmd} not found — install ffmpeg (brew install ffmpeg / apk add ffmpeg / apt-get install ffmpeg)`
          )
        );
        return;
      }
      reject(err);
    });
    child.on("close", (code) => {
      resolve({ stdout, stderr, code: code ?? -1 });
    });
  });
}

async function writeTempFile(buffer: Buffer, ext: string): Promise<string> {
  const safeExt = ext.replaceAll(/[^a-z0-9]/gi, "") || "bin";
  const tmpPath = path.join(os.tmpdir(), `va-${randomUUID()}.${safeExt}`);
  await fs.writeFile(tmpPath, buffer);
  return tmpPath;
}

export async function probeDurationSec(buffer: Buffer, ext: string): Promise<number> {
  const tmpPath = await writeTempFile(buffer, ext);
  try {
    const { stdout, stderr, code } = await runProcess("ffprobe", [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "csv=p=0",
      tmpPath,
    ]);
    if (code !== 0) {
      throw new Error(`ffprobe failed (code ${code}): ${stderr.trim() || "unknown error"}`);
    }
    const duration = Number.parseFloat(stdout.trim());
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error(`ffprobe returned invalid duration: "${stdout.trim()}"`);
    }
    return duration;
  } finally {
    await fs.unlink(tmpPath).catch(() => undefined);
  }
}

export async function chunkAudioToMp3(
  buffer: Buffer,
  ext: string,
  chunkSec: number = CHUNK_SECONDS
): Promise<Buffer[]> {
  const inputPath = await writeTempFile(buffer, ext);
  const chunkDir = path.join(os.tmpdir(), `va-chunks-${randomUUID()}`);
  await fs.mkdir(chunkDir, { recursive: true });
  const pattern = path.join(chunkDir, "chunk_%03d.mp3");

  try {
    const { stderr, code } = await runProcess("ffmpeg", [
      "-hide_banner",
      "-loglevel",
      "error",
      "-i",
      inputPath,
      "-vn",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "32k",
      "-f",
      "segment",
      "-segment_time",
      String(chunkSec),
      pattern,
    ]);
    if (code !== 0) {
      throw new Error(`ffmpeg chunking failed (code ${code}): ${stderr.trim() || "unknown error"}`);
    }

    const files = (await fs.readdir(chunkDir)).filter((name) => name.endsWith(".mp3")).sort();
    if (files.length === 0) {
      throw new Error("ffmpeg produced no chunks");
    }

    const buffers: Buffer[] = [];
    for (const name of files) {
      buffers.push(await fs.readFile(path.join(chunkDir, name)));
    }
    return buffers;
  } finally {
    await fs.rm(chunkDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.unlink(inputPath).catch(() => undefined);
  }
}
