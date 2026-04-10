import type { Route } from "./+types/home";
import { lazy, Suspense } from "react";
import { Link } from "react-router";
import { AudioLines, BrainCircuit, FileText, ShieldAlert, Loader2 } from "lucide-react";

const AudioUploader = lazy(() =>
  import("~/components/audio-uploader").then((m) => ({ default: m.AudioUploader }))
);

export function meta(_: Route.MetaArgs) {
  return [
    { title: "Voice Analysis — วิเคราะห์เสียง" },
    { name: "description", content: "อัพโหลดไฟล์เสียงเพื่อถอดข้อความและวิเคราะห์อารมณ์" },
  ];
}

export default function Home() {
  return (
    <main className="bg-background min-h-screen">
      <div className="container mx-auto px-4 py-16">
        <div className="mb-12 text-center">
          <h1 className="text-4xl font-bold tracking-tight">Voice Analysis</h1>
          <p className="text-muted-foreground mt-3 text-lg">
            อัพโหลดไฟล์เสียง — ระบบจะถอดข้อความและวิเคราะห์อารมณ์ให้อัตโนมัติ
          </p>
        </div>

        <Suspense
          fallback={
            <div className="mx-auto flex w-full max-w-xl items-center justify-center py-24">
              <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
            </div>
          }
        >
          <AudioUploader />
        </Suspense>

        <div className="mt-8 text-center">
          <Link to="/analyses" className="text-primary text-sm underline-offset-4 hover:underline">
            ดูประวัติการวิเคราะห์ →
          </Link>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 text-center sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-950">
              <AudioLines className="h-6 w-6 text-blue-600 dark:text-blue-400" />
            </div>
            <h3 className="mt-3 font-semibold">Speech-to-Text</h3>
            <p className="text-muted-foreground mt-1 text-sm">ถอดข้อความจากไฟล์เสียงอัตโนมัติ</p>
          </div>
          <div className="rounded-xl border p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-950">
              <FileText className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <h3 className="mt-3 font-semibold">สรุปบทสนทนา</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              สรุปเรื่องที่คุย ผลลัพธ์ และจุดน่าสังเกต
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-950">
              <BrainCircuit className="h-6 w-6 text-purple-600 dark:text-purple-400" />
            </div>
            <h3 className="mt-3 font-semibold">วิเคราะห์อารมณ์</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              จำแนก ดี / ธรรมชาติ / ไม่ดี พร้อมคะแนนความพึงพอใจ
            </p>
          </div>
          <div className="rounded-xl border p-6">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 dark:bg-red-950">
              <ShieldAlert className="h-6 w-6 text-red-600 dark:text-red-400" />
            </div>
            <h3 className="mt-3 font-semibold">ตรวจจับเนื้อหาไม่เหมาะสม</h3>
            <p className="text-muted-foreground mt-1 text-sm">
              แจ้งเตือนหากพบการพูดถึงสิ่งผิดกฎหมาย
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
