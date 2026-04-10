import * as Minio from "minio";
import { randomUUID } from "crypto";
import path from "path";

function getMinioClient() {
  const endpoint = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = parseInt(process.env.MINIO_PORT ?? "9000", 10);
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const accessKey = process.env.MINIO_ACCESS_KEY;
  const secretKey = process.env.MINIO_SECRET_KEY;
  if (!accessKey || !secretKey) throw new Error("Missing MINIO_ACCESS_KEY or MINIO_SECRET_KEY");

  return new Minio.Client({ endPoint: endpoint, port, useSSL, accessKey, secretKey });
}

export function getBucketName(): string {
  return process.env.MINIO_BUCKET_NAME ?? "voice-analysis";
}

export async function ensureBucketExists(): Promise<void> {
  const client = getMinioClient();
  const bucket = getBucketName();
  const exists = await client.bucketExists(bucket);
  if (!exists) {
    await client.makeBucket(bucket);
  }
}

export async function uploadAudio(
  buffer: Buffer,
  originalName: string,
  mimeType: string
): Promise<{ filename: string; storageUrl: string }> {
  const client = getMinioClient();
  const bucket = getBucketName();
  await ensureBucketExists();

  const ext = path.extname(originalName);
  const filename = `${randomUUID()}${ext}`;

  await client.putObject(bucket, filename, buffer, buffer.length, {
    "Content-Type": mimeType,
  });

  const endpoint = process.env.MINIO_ENDPOINT ?? "localhost";
  const port = process.env.MINIO_PORT ?? "9000";
  const useSSL = process.env.MINIO_USE_SSL === "true";
  const protocol = useSSL ? "https" : "http";
  const storageUrl = `${protocol}://${endpoint}:${port}/${bucket}/${filename}`;

  return { filename, storageUrl };
}

export async function getPresignedUrl(filename: string, expirySeconds = 3600): Promise<string> {
  const client = getMinioClient();
  const bucket = getBucketName();
  return client.presignedGetObject(bucket, filename, expirySeconds);
}

export async function deleteAudio(filename: string): Promise<void> {
  const client = getMinioClient();
  const bucket = getBucketName();
  await client.removeObject(bucket, filename);
}

export async function downloadAudio(filename: string): Promise<Buffer> {
  const client = getMinioClient();
  const bucket = getBucketName();
  const stream = await client.getObject(bucket, filename);

  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    stream.on("data", (chunk: Buffer) => chunks.push(chunk));
    stream.on("end", () => resolve(Buffer.concat(chunks)));
    stream.on("error", reject);
  });
}
