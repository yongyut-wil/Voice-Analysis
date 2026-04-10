import type { Route } from "./+types/analyses";
import { Link } from "react-router";
import { ArrowLeft, AlertTriangle } from "lucide-react";
import { getAudioFiles } from "~/lib/supabase.server";
import { EmotionBadge } from "~/components/emotion-badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "~/components/ui/table";
import { Badge } from "~/components/ui/badge";
import type { Emotion } from "~/types/analysis";

export function meta(_: Route.MetaArgs) {
  return [{ title: "ประวัติการวิเคราะห์ — Voice Analysis" }];
}

export async function loader(_: Route.LoaderArgs) {
  const files = await getAudioFiles();
  return { files };
}

const STATUS_LABELS: Record<string, string> = {
  pending: "รอดำเนินการ",
  processing: "กำลังวิเคราะห์",
  done: "เสร็จสิ้น",
  error: "เกิดข้อผิดพลาด",
};

const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  processing: "outline",
  done: "default",
  error: "destructive",
};

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("th-TH", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function formatSize(bytes: number | null) {
  if (!bytes) return "-";
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default function Analyses({ loaderData }: Route.ComponentProps) {
  const { files } = loaderData;

  return (
    <main className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-12">
        <Link
          to="/"
          className="text-muted-foreground hover:text-foreground mb-6 flex w-fit items-center gap-1 text-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          กลับหน้าหลัก
        </Link>
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">ประวัติการวิเคราะห์</h1>
            <p className="text-muted-foreground mt-1 text-sm">{files.length} ไฟล์ทั้งหมด</p>
          </div>
          <Link
            to="/"
            className="bg-primary text-primary-foreground hover:bg-primary/90 rounded-lg px-4 py-2 text-sm font-medium transition-colors"
          >
            + อัพโหลดไฟล์ใหม่
          </Link>
        </div>

        {files.length === 0 ? (
          <div className="py-24 text-center">
            <p className="text-muted-foreground text-lg">ยังไม่มีไฟล์เสียง</p>
            <Link
              to="/"
              className="text-primary mt-4 block text-sm underline-offset-4 hover:underline"
            >
              อัพโหลดไฟล์แรก →
            </Link>
          </div>
        ) : (
          <div className="rounded-xl border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ชื่อไฟล์</TableHead>
                  <TableHead>วันที่</TableHead>
                  <TableHead>ขนาด</TableHead>
                  <TableHead>สถานะ</TableHead>
                  <TableHead>อารมณ์</TableHead>
                  <TableHead>เนื้อหาผิดกฎหมาย</TableHead>
                  <TableHead>ความพึงพอใจ</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {files.map((file) => {
                  const analysis = file.analysis_results?.[0];
                  return (
                    <TableRow
                      key={file.id}
                      className="hover:bg-muted/50 cursor-pointer"
                      onClick={() => (window.location.href = `/analyses/${file.id}`)}
                    >
                      <TableCell className="max-w-[200px] truncate font-medium">
                        {file.original_name}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatDate(file.created_at)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {formatSize(file.file_size)}
                      </TableCell>
                      <TableCell>
                        <Badge variant={STATUS_VARIANTS[file.status] ?? "secondary"}>
                          {STATUS_LABELS[file.status] ?? file.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <EmotionBadge emotion={(analysis?.emotion as Emotion) ?? null} />
                      </TableCell>
                      <TableCell>
                        {analysis ? (
                          analysis.illegal_detected ? (
                            <span className="text-destructive flex items-center gap-1 text-sm font-medium">
                              <AlertTriangle className="h-3.5 w-3.5" />
                              พบ
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-sm">ปกติ</span>
                          )
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {analysis?.satisfaction_score != null ? (
                          <span className="text-sm">{analysis.satisfaction_score}/100</span>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </main>
  );
}
