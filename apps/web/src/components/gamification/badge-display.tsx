"use client";

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { motion } from "framer-motion";

interface BadgeItem {
  id: string;
  slug: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  earned: boolean;
  earned_at: string | null;
}

interface BadgeDisplayProps {
  badges: BadgeItem[];
  earnedCount: number;
  totalCount: number;
}

export function BadgeDisplay({ badges, earnedCount, totalCount }: BadgeDisplayProps) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Achievements</h3>
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-20 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.60_0.26_310)]"
              initial={{ width: 0 }}
              animate={{ width: `${totalCount > 0 ? (earnedCount / totalCount) * 100 : 0}%` }}
              transition={{ duration: 0.8, delay: 0.3 }}
            />
          </div>
          <span className="text-xs font-medium text-muted-foreground tabular-nums">
            {earnedCount}/{totalCount}
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2.5">
        {badges.map((badge, i) => (
          <Tooltip key={badge.id}>
            <TooltipTrigger asChild>
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: i * 0.03, type: "spring", stiffness: 300, damping: 20 }}
                whileHover={badge.earned ? { scale: 1.15, rotate: 5 } : {}}
                className={`flex size-11 items-center justify-center rounded-xl text-lg cursor-default transition-colors ${
                  badge.earned
                    ? "bg-gradient-to-br from-primary/12 to-primary/5 ring-1 ring-primary/20 shadow-sm"
                    : "bg-muted/40 opacity-30 grayscale"
                }`}
              >
                {badge.icon}
              </motion.div>
            </TooltipTrigger>
            <TooltipContent className="max-w-48">
              <p className="font-semibold">{badge.name}</p>
              <p className="text-xs text-muted-foreground">{badge.description}</p>
              {badge.earned && badge.earned_at && (
                <p className="mt-1 text-xs text-primary font-medium">
                  Earned {new Date(badge.earned_at).toLocaleDateString()}
                </p>
              )}
            </TooltipContent>
          </Tooltip>
        ))}
      </div>
    </div>
  );
}
