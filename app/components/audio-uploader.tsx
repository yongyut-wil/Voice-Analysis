import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useNavigate } from "react-router";
import { Card, CardContent } from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { UploadCloud, FileAudio, Loader2 } from "lucide-react";

const ACCEPTED_TYPES = {
  "audio/mpeg": [".mp3"],
  "audio/wav": [".wav"],
  "audio/mp4": [".m4a", ".mp4"],
  "audio/ogg": [".ogg"],
  "audio/webm": [".webm"],
  "audio/x-m4a": [".m4a"],
};

type UploadState = "idle" | "uploading" | "error";

async function readErrorMessage(response: Response, fallback: string): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";

  if (contentType.includes("application/json")) {
    try {
      const body = (await response.json()) as { error?: string; message?: string };
      return body.error?.trim() || body.message?.trim() || fallback;
    } catch {
      return fallback;
    }
  }

  try {
    const text = (await response.text()).trim();
    return text ? text.slice(0, 200) : fallback;
  } catch {
    return fallback;
  }
}

export function AudioUploader() {
  const navigate = useNavigate();
  const [state, setState] = useState<UploadState>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const processFile = useCallback(
    async (file: File) => {
      setState("uploading");
      setProgress(10);
      setError(null);

      try {
        const formData = new FormData();
        formData.append("audio", file);

        const uploadRes = await fetch("/api/upload", { method: "POST", body: formData });
        if (!uploadRes.ok) {
          throw new Error(
            await readErrorMessage(uploadRes, "อัพโหลดไฟล์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
          );
        }
        const { audioFileId } = (await uploadRes.json()) as { audioFileId: string };
        setProgress(60);

        const analyzeRes = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ audioFileId }),
        });
        if (!analyzeRes.ok) {
          throw new Error(
            await readErrorMessage(analyzeRes, "เริ่มการวิเคราะห์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง")
          );
        }

        // server return 202 ทันที — ไปหน้า detail เลย หน้า detail จะ polling เอง
        navigate(`/analyses/${audioFileId}`);
      } catch (err) {
        setState("error");
        const message = err instanceof Error ? err.message.trim() : "";
        setError(message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
    },
    [navigate]
  );

  const onDrop = useCallback(
    (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;
      setSelectedFile(file);
      processFile(file);
    },
    [processFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPTED_TYPES,
    maxSize: 100 * 1024 * 1024,
    multiple: false,
    disabled: state === "uploading",
  });

  const isProcessing = state === "uploading";

  let uploadIcon: React.ReactNode;
  if (isProcessing) {
    uploadIcon = <Loader2 className="text-primary h-12 w-12 animate-spin" />;
  } else if (selectedFile) {
    uploadIcon = <FileAudio className="text-primary h-12 w-12" />;
  } else {
    uploadIcon = <UploadCloud className="text-muted-foreground h-12 w-12" />;
  }

  return (
    <div className="mx-auto w-full max-w-xl space-y-4">
      <Card
        {...getRootProps()}
        className={`cursor-pointer border-2 border-dashed transition-all duration-200 ${
          isDragActive
            ? "border-primary bg-primary/5 scale-[1.02]"
            : "border-muted-foreground/30 hover:border-primary/50"
        } ${isProcessing ? "cursor-not-allowed opacity-70" : ""}`}
      >
        <CardContent className="flex flex-col items-center justify-center gap-4 py-12">
          <input {...getInputProps()} />

          {uploadIcon}

          <div className="text-center">
            {state === "uploading" && (
              <>
                <p className="font-medium">กำลังอัพโหลดและเริ่มวิเคราะห์...</p>
                <p className="text-muted-foreground text-sm">{selectedFile?.name}</p>
              </>
            )}
            {(state === "idle" || state === "error") && (
              <>
                <p className="font-medium">
                  {isDragActive ? "วางไฟล์ที่นี่" : "ลากไฟล์มาวาง หรือคลิกเพื่อเลือก"}
                </p>
                <p className="text-muted-foreground mt-1 text-sm">
                  รองรับ: MP3, WAV, M4A, OGG, WebM (สูงสุด 100 MB)
                </p>
              </>
            )}
          </div>

          {isProcessing && (
            <div className="bg-muted h-2 w-full rounded-full">
              <div
                className="bg-primary h-2 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          )}

          {!isProcessing && (
            <Button variant="outline" size="sm" className="mt-2">
              เลือกไฟล์เสียง
            </Button>
          )}
        </CardContent>
      </Card>

      {state === "error" && error && (
        <div className="bg-destructive/10 border-destructive/20 text-destructive rounded-lg border px-4 py-3 text-sm">
          {error}
        </div>
      )}
    </div>
  );
}
