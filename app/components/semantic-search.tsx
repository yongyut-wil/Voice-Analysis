import { useState } from "react";
import { Search, Loader2 } from "lucide-react";
import { useNavigate } from "react-router";
import { Input } from "~/components/ui/input";
import { Button } from "~/components/ui/button";
import { EmotionBadge } from "~/components/emotion-badge";
import type { Emotion } from "~/types/analysis";

interface KBResult {
  chunk_id: string;
  chunk_content: string;
  relevance: number;
  emotion?: string;
  satisfaction_score?: number;
  illegal_detected?: boolean;
  audio_file_id?: string;
}

export function SemanticSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<KBResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function search() {
    const q = query.trim();
    if (!q) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const data = (await res.json()) as { results?: KBResult[] };
      setResults(data.results ?? []);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="เช่น 'ลูกค้าไม่พอใจ' หรือ 'ข้อเสนอที่น่าสงสัย'"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && search()}
          // autoComplete="off"
        />
        <Button onClick={search} disabled={loading || !query.trim()} size="sm">
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
          ค้นหา
        </Button>
      </div>

      {results !== null && (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {results.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">ไม่พบผลลัพธ์</p>
          ) : (
            results.map((r) => (
              <div
                key={r.chunk_id}
                className="hover:bg-muted/50 cursor-pointer rounded-lg border p-3 transition-colors"
                onClick={() => r.audio_file_id && navigate(`/analyses/${r.audio_file_id}`)}
              >
                <div className="mb-1 flex items-center gap-2">
                  <EmotionBadge emotion={(r.emotion as Emotion) ?? null} />
                  {r.satisfaction_score != null && (
                    <span className="text-muted-foreground text-xs">
                      ความพึงพอใจ {r.satisfaction_score}/100
                    </span>
                  )}
                  <span className="text-muted-foreground ml-auto text-xs">
                    {(r.relevance * 100).toFixed(0)}% match
                  </span>
                </div>
                <p className="line-clamp-2 text-sm">{r.chunk_content}</p>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
