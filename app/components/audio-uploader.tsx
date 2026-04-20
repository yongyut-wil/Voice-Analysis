import { useCallback, useEffect, useRef, useState } from "react";
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

const POLL_INTERVAL_MS = 3000;

type UploadState = "idle" | "uploading" | "analyzing" | "done" | "error";

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
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // หยุด polling เมื่อ component unmount
  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  const startPolling = useCallback(
    (audioFileId: string) => {
      let dots = 0;
      pollRef.current = setInterval(async () => {
        try {
          const res = await fetch(`/api/status/${audioFileId}`);
          const json = (await res.json()) as {
            status: string;
            error: string | null;
            analysisId: string | null;
          };

          // animate progress 50 → 95 ระหว่างรอ
          dots = (dots + 1) % 4;
          setProgress((p) => Math.min(p + 3, 95));

          if (json.status === "done") {
            clearInterval(pollRef.current!);
            setProgress(100);
            setState("done");
            navigate(`/analyses/${audioFileId}?result=${json.analysisId}`);
          } else if (json.status === "error") {
            clearInterval(pollRef.current!);
            setState("error");
            setError(json.error ?? "เกิดข้อผิดพลาดระหว่างวิเคราะห์");
          }
        } catch {
          // network error — ลอง poll ต่อ
        }
      }, POLL_INTERVAL_MS);
    },
    [navigate]
  );

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
        setProgress(40);

        setState("analyzing");
        setProgress(50);

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

        // server return 202 ทันที — เริ่ม polling
        startPolling(audioFileId);
      } catch (err) {
        setState("error");
        const message = err instanceof Error ? err.message.trim() : "";
        setError(message || "เกิดข้อผิดพลาด กรุณาลองใหม่");
      }
    },
    [startPolling]
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
    disabled: state === "uploading" || state === "analyzing",
  });

  const isProcessing = state === "uploading" || state === "analyzing";

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

          {isProcessing ? (
            <Loader2 className="text-primary h-12 w-12 animate-spin" />
          ) : selectedFile ? (
            <FileAudio className="text-primary h-12 w-12" />
          ) : (
            <UploadCloud className="text-muted-foreground h-12 w-12" />
          )}

          <div className="text-center">
            {state === "uploading" && (
              <>
                <p className="font-medium">กำลังอัพโหลด...</p>
                <p className="text-muted-foreground text-sm">{selectedFile?.name}</p>
              </>
            )}
            {state === "analyzing" && (
              <>
                <p className="font-medium">กำลังวิเคราะห์เสียง...</p>
                <p className="text-muted-foreground text-sm">อาจใช้เวลา 1–3 นาที กรุณารอสักครู่</p>
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
