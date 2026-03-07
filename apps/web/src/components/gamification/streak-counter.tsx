"use client";

import { Flame } from "lucide-react";
import { motion } from "framer-motion";
import { AnimatedCounter, spring } from "@/components/motion";

interface StreakCounterProps {
  streak: number;
  longestStreak: number;
}

export function StreakCounter({ streak, longestStreak }: StreakCounterProps) {
  const isActive = streak > 0;
  const isHot = streak >= 7;

  return (
    <div className="flex items-center gap-3">
      <motion.div
        className={`relative flex size-13 items-center justify-center rounded-full ${
          isActive
            ? isHot
              ? "bg-gradient-to-br from-orange-500/25 to-red-500/15 text-orange-500"
              : "bg-gradient-to-br from-orange-400/20 to-orange-400/5 text-orange-400"
            : "bg-muted text-muted-foreground"
        }`}
        animate={isActive ? {
          scale: [1, 1.06, 1],
          rotate: [0, 2, -2, 0],
        } : {}}
        transition={{
          duration: 2,
          repeat: Infinity,
          repeatType: "loop",
          ease: "easeInOut",
        }}
      >
        <Flame className="size-6" />
        {isHot && (
          <motion.span
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={spring.bouncy}
            className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-gradient-to-br from-orange-500 to-red-500 text-[10px] font-bold text-white shadow-sm"
          >
            !
          </motion.span>
        )}
      </motion.div>
      <div>
        <p className="text-2xl font-bold tabular-nums">
          <AnimatedCounter value={streak} />
          <span className="ml-1 text-sm font-normal text-muted-foreground">
            day{streak !== 1 ? "s" : ""}
          </span>
        </p>
        {longestStreak > streak && (
          <p className="text-xs text-muted-foreground">
            Best: {longestStreak} days
          </p>
        )}
      </div>
    </div>
  );
}
