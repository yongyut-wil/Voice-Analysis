import { useState, useRef, useEffect } from "react";
import { Send, Loader2, Bot, User, RotateCcw } from "lucide-react";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";

interface Message {
  role: "user" | "agent";
  content: string;
}

const SUGGESTIONS = [
  "สายที่ emotion เป็น negative มีกี่สาย?",
  "satisfaction score เฉลี่ยเป็นเท่าไหร่?",
  "มีสายที่ตรวจพบเนื้อหาผิดกฎหมายกี่สาย?",
];

export function AnalyticsChat() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading]);

  async function send(question?: string) {
    const q = (question ?? input).trim();
    if (!q || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: q }]);
    setLoading(true);
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json()) as { answer?: string; error?: string };
      setMessages((prev) => [
        ...prev,
        { role: "agent", content: data.answer ?? data.error ?? "ไม่สามารถตอบได้" },
      ]);
    } catch {
      setMessages((prev) => [...prev, { role: "agent", content: "เกิดข้อผิดพลาด กรุณาลองใหม่" }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 && (
        <div className="flex flex-wrap gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              onClick={() => send(s)}
              className="text-muted-foreground hover:text-foreground hover:bg-muted rounded-full border px-3 py-1.5 text-xs transition-colors"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      {messages.length > 0 && (
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">ประวัติการสนทนา</span>
          <button
            onClick={() => setMessages([])}
            className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
          >
            <RotateCcw className="h-3 w-3" />
            ล้าง
          </button>
        </div>
      )}

      {messages.length > 0 && (
        <div ref={scrollRef} className="max-h-64 space-y-3 overflow-y-auto pr-1">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-2 ${m.role === "user" ? "flex-row-reverse" : ""}`}>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                  m.role === "user" ? "bg-primary text-primary-foreground" : "bg-muted"
                }`}
              >
                {m.role === "user" ? (
                  <User className="h-3.5 w-3.5" />
                ) : (
                  <Bot className="h-3.5 w-3.5" />
                )}
              </div>
              <div
                className={`max-w-[80%] rounded-xl px-3 py-2 text-sm ${
                  m.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-none"
                    : "bg-muted rounded-tl-none"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex gap-2">
              <div className="bg-muted flex h-7 w-7 shrink-0 items-center justify-center rounded-full">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="bg-muted rounded-xl rounded-tl-none px-3 py-2">
                <Loader2 className="text-muted-foreground h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        <Input
          placeholder="ถามเกี่ยวกับข้อมูลการสนทนา..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          disabled={loading}
        />
        <Button onClick={() => send()} disabled={loading || !input.trim()} size="icon">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}
