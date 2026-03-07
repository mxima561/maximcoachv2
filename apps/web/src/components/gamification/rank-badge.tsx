"use client";

import { motion } from "framer-motion";
import { spring } from "@/components/motion";

interface RankBadgeProps {
  level: number;
  name: string;
  icon: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = {
  sm: "size-9 text-base",
  md: "size-13 text-xl",
  lg: "size-18 text-3xl",
};

const labelSizes = {
  sm: "text-xs",
  md: "text-sm",
  lg: "text-base",
};

export function RankBadge({ level, name, icon, size = "md" }: RankBadgeProps) {
  return (
    <motion.div
      className="flex flex-col items-center gap-1.5"
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={spring.bouncy}
    >
      <div className="relative">
        <div
          className={`flex items-center justify-center rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-[oklch(0.60_0.26_310)]/10 ring-2 ring-primary/25 ${sizeClasses[size]}`}
        >
          {icon}
        </div>
        <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground shadow-sm">
          {level}
        </div>
      </div>
      <span className={`font-semibold ${labelSizes[size]}`}>{name}</span>
    </motion.div>
  );
}
