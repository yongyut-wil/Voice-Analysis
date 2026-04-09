import { Badge } from "~/components/ui/badge";
import { EMOTION_LABELS, EMOTION_COLORS } from "~/types/analysis";
import type { Emotion } from "~/types/analysis";

const EMOTION_EMOJI: Record<Emotion, string> = {
  positive: "🟢",
  neutral: "🟡",
  negative: "🔴",
};

interface EmotionBadgeProps {
  emotion: Emotion | null;
}

export function EmotionBadge({ emotion }: EmotionBadgeProps) {
  if (!emotion) return <span className="text-muted-foreground text-sm">-</span>;

  return (
    <Badge variant="outline" className={EMOTION_COLORS[emotion]}>
      {EMOTION_EMOJI[emotion]} {EMOTION_LABELS[emotion]}
    </Badge>
  );
}
