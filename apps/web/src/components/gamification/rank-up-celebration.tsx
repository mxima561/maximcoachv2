"use client";

import { useEffect, useState } from "react";
import { RankBadge } from "./rank-badge";

interface RankUpCelebrationProps {
  rankName: string;
  rankIcon: string;
  rankLevel: number;
  onDismiss?: () => void;
}

export function RankUpCelebration({
  rankName,
  rankIcon,
  rankLevel,
  onDismiss,
}: RankUpCelebrationProps) {
  const [show, setShow] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShow(false);
      onDismiss?.();
    }, 4000);
    return () => clearTimeout(timer);
  }, [onDismiss]);

  if (!show) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-4 rounded-2xl border bg-card p-8 shadow-xl animate-in zoom-in-95 duration-300">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">
          Rank Up!
        </p>
        <RankBadge level={rankLevel} name={rankName} icon={rankIcon} size="lg" />
        <p className="text-muted-foreground">
          You've reached <span className="font-semibold text-foreground">{rankName}</span>
        </p>
        <button
          onClick={() => { setShow(false); onDismiss?.(); }}
          className="mt-2 text-sm text-muted-foreground hover:text-foreground"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
