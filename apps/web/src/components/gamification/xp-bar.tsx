"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { spring } from "@/components/motion";

interface XpBarProps {
  currentXp: number;
  currentRankMinXp: number;
  nextRankMinXp: number | null;
  rankName: string;
  rankIcon: string;
  nextRankName: string | null;
}

export function XpBar({
  currentXp,
  currentRankMinXp,
  nextRankMinXp,
  rankName,
  rankIcon,
  nextRankName,
}: XpBarProps) {
  const [mounted, setMounted] = useState(false);

  const progress = nextRankMinXp
    ? Math.min(
        100,
        Math.round(
          ((currentXp - currentRankMinXp) / (nextRankMinXp - currentRankMinXp)) * 100,
        ),
      )
    : 100;

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <div className="space-y-2.5">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2 font-semibold">
          <span className="text-base">{rankIcon}</span>
          <span>{rankName}</span>
        </div>
        <span className="text-muted-foreground tabular-nums font-medium">
          {currentXp.toLocaleString()} XP
        </span>
      </div>
      <div className="relative h-3.5 w-full overflow-hidden rounded-full bg-muted/60">
        <motion.div
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary via-primary to-[oklch(0.60_0.26_310)] shimmer-bar"
          initial={{ width: 0 }}
          animate={{ width: mounted ? `${progress}%` : 0 }}
          transition={{ ...spring.gentle, duration: 1 }}
        />
      </div>
      {nextRankName && nextRankMinXp && (
        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">
            {(nextRankMinXp - currentXp).toLocaleString()} XP to {nextRankName}
          </p>
          <p className="text-xs font-medium text-primary">{progress}%</p>
        </div>
      )}
    </div>
  );
}
