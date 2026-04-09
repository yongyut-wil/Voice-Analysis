import { useEffect, useRef } from "react";

interface AudioPlayerProps {
  src: string;
  title?: string;
}

export function AudioPlayer({ src, title }: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.load();
    }
  }, [src]);

  return (
    <div className="w-full">
      {title && <p className="text-muted-foreground mb-2 text-sm">{title}</p>}
      <audio ref={audioRef} controls className="w-full rounded-lg" preload="metadata">
        <source src={src} />
        เบราว์เซอร์ของคุณไม่รองรับการเล่นเสียง
      </audio>
    </div>
  );
}
