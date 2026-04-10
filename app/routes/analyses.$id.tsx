import type { Route } from "./+types/analyses.$id";
import { Link, data, useNavigate, useRevalidator } from "react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { getAudioFileById } from "~/lib/supabase.server";
import { getPresignedUrl } from "~/lib/minio.server";
import { cleanErrorMessage } from "~/lib/error-utils";
import { AudioPlayer } from "~/components/audio-player";
import { EmotionBadge } from "~/components/emotion-badge";
import { Progress } from "~/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "~/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "~/components/ui/card";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import { AlertTriangle, ArrowLeft, Clock, FileAudio, Loader2, RefreshCw } from "lucide-react";
import type { Emotion } from "~/types/analysis";

export function meta({ data: loaderData }: Route.MetaArgs) {
  const name = loaderData?.file?.original_name ?? "รายละเอียด";
  return [{ title: `${name} — Voice Analysis` }];
}

export async function loader({ params }: Route.LoaderArgs) {
  const file = await getAudioFileById(params.id);
  if (!file) throw data("ไม่พบไฟล์", { status: 404 });

  let presignedUrl: string | null = null;
  try {
    presignedUrl = await getPresignedUrl(file.filename);
  } catch {
    // MinIO ไม่พร้อมหรือไฟล์ถูกลบ — แสดง player ไม่ได้แต่ไม่ crash
  }

  const analysis = file.analysis_results?.[0] ?? null;
  const cleanedFile = {
    ...file,
    error_message: file.error_message ? cleanErrorMessage(file.error_message) : null,
  };
  return { file: cleanedFile, analysis, presignedUrl };
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", { dateStyle: "long", timeStyle: "short" });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function formatDuration(sec: number | null) {
  if (!sec) return "-";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  return `${m}:${String(s).padStart(2, "0")} นาที`;
}

function RetryButton({ audioFileId }: { audioFileId: string }) {
  const navigate = useNavigate();
  const { revalidate } = useRevalidator();
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  const handleRetry = useCallback(async () => {
    setRetrying(true);
    setError(null);
    try {
      const res = await fetch(`/api/retry/${audioFileId}`, { method: "POST" });
      if (!res.ok) {
        const json = (await res.json()) as { error: string };
        throw new Error(json.error);
      }
      pollRef.current = setInterval(async () => {
        const statusRes = await fetch(`/api/status/${audioFileId}`);
        const json = (await statusRes.json()) as { status: string; analysisId: string | null };
        if (json.status === "done") {
          clearInterval(pollRef.current!);
          revalidate();
          setRetrying(false);
        } else if (json.status === "error") {
          clearInterval(pollRef.current!);
          setRetrying(false);
          revalidate();
        }
      }, 3000);
    } catch (err) {
      setRetrying(false);
      setError(err instanceof Error ? err.message : "เกิดข้อผิดพลาด");
    }
  }, [audioFileId, navigate, revalidate]);

  return (
    <div className="space-y-2">
      <Button onClick={handleRetry} disabled={retrying} variant="outline" size="sm">
        {retrying ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            กำลังวิเคราะห์ใหม่...
          </>
        ) : (
          <>
            <RefreshCw className="mr-2 h-4 w-4" />
            ลองวิเคราะห์อีกครั้ง
          </>
        )}
      </Button>
      {error && <p className="text-destructive text-xs">{error}</p>}
    </div>
  );
}

export default function AnalysisDetail({ loaderData }: Route.ComponentProps) {
  const { file, analysis, presignedUrl } = loaderData;

  return (
    <main className="bg-background min-h-screen">
      <div className="container mx-auto max-w-3xl px-4 py-12">
        <Link
          to="/analyses"
          className="text-muted-foreground hover:text-foreground mb-8 flex items-center gap-2 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> กลับไปรายการ
        </Link>

        {/* Header */}
        <div className="mb-8">
          <div className="flex items-start gap-3">
            <FileAudio className="text-primary mt-1 h-6 w-6 shrink-0" />
            <div>
              <h1 className="text-xl font-bold">{file.original_name}</h1>
              <p className="text-muted-foreground mt-1 text-sm">
                {formatDate(file.created_at)} · {formatSize(file.file_size)} ·{" "}
                {formatDuration(file.duration)}
              </p>
            </div>
          </div>
        </div>

        {/* Audio Player */}
        {presignedUrl && (
          <Card className="mb-6">
            <CardContent className="pt-6">
              <AudioPlayer src={presignedUrl} />
            </CardContent>
          </Card>
        )}

        {/* Status: Processing */}
        {file.status === "processing" && (
          <Alert className="mb-6">
            <Clock className="h-4 w-4" />
            <AlertTitle>กำลังวิเคราะห์...</AlertTitle>
            <AlertDescription>ระบบกำลังประมวลผล กรุณารีเฟรชหน้านี้ในอีกสักครู่</AlertDescription>
          </Alert>
        )}

        {/* Status: Error */}
        {file.status === "error" && (
          <Alert variant="destructive" className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>เกิดข้อผิดพลาด</AlertTitle>
            <AlertDescription>
              {file.error_message ?? "ไม่สามารถวิเคราะห์ไฟล์นี้ได้"}
            </AlertDescription>
          </Alert>
        )}
        {file.status === "error" && (
          <div className="mb-6">
            <RetryButton audioFileId={file.id} />
          </div>
        )}

        {/* Analysis Results */}
        {analysis && (
          <div className="space-y-6">
            {/* Illegal Detection Alert */}
            {analysis.illegal_detected && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>⚠️ ตรวจพบเนื้อหาที่น่าสงสัย</AlertTitle>
                <AlertDescription>
                  {analysis.illegal_details ?? "พบการกล่าวถึงสิ่งที่อาจผิดกฎหมายในการสนทนา"}
                </AlertDescription>
              </Alert>
            )}

            {/* Emotion + Satisfaction */}
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-sm font-medium">
                    อารมณ์โดยรวม
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <EmotionBadge emotion={(analysis.emotion as Emotion) ?? null} />
                  {analysis.emotion_score != null && (
                    <p className="text-muted-foreground text-xs">
                      ความมั่นใจ: {Math.round(analysis.emotion_score * 100)}%
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-muted-foreground text-sm font-medium">
                    ความพึงพอใจ
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-3">
                    <Progress value={analysis.satisfaction_score ?? 0} className="flex-1" />
                    <span className="text-sm font-semibold">
                      {analysis.satisfaction_score ?? 0}/100
                    </span>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Summary */}
            {analysis.summary && (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">สรุปบทสนทนา</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm leading-relaxed">{analysis.summary}</p>
                </CardContent>
              </Card>
            )}

            {/* Transcription */}
            {analysis.transcription && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-muted-foreground text-sm font-medium">
                    คำพูดที่ถอดข้อความได้
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <textarea
                    readOnly
                    value={analysis.transcription}
                    rows={8}
                    className="bg-muted w-full resize-none rounded-lg p-4 font-mono text-sm leading-relaxed focus:outline-none"
                  />
                </CardContent>
              </Card>
            )}

            {/* Meta */}
            <div className="text-muted-foreground flex flex-wrap gap-3 text-xs">
              {analysis.stt_model_used && (
                <Badge variant="outline" className="font-mono text-xs">
                  STT: {analysis.stt_model_used}
                </Badge>
              )}
              {analysis.model_used && (
                <Badge variant="outline" className="font-mono text-xs">
                  LLM: {analysis.model_used}
                </Badge>
              )}
              {analysis.processing_time_ms && (
                <span>ใช้เวลาวิเคราะห์: {(analysis.processing_time_ms / 1000).toFixed(1)}s</span>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
