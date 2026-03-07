"use client";

import { useEffect, useRef, useState } from "react";
import { motion, type Variants } from "framer-motion";

// ── Shared spring configs ────────────────────────────────────

export const spring = {
  gentle: { type: "spring" as const, stiffness: 120, damping: 14 },
  bouncy: { type: "spring" as const, stiffness: 300, damping: 20 },
  snappy: { type: "spring" as const, stiffness: 400, damping: 25 },
};

// ── Fade-in with upward slide ────────────────────────────────

export function FadeIn({
  children,
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Staggered children container ─────────────────────────────

const staggerContainer: Variants = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: {
    opacity: 1,
    y: 0,
    transition: spring.gentle,
  },
};

export function StaggerContainer({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// ── Animated counter ─────────────────────────────────────────

export function AnimatedCounter({
  value,
  duration = 1.2,
  className,
  suffix = "",
  prefix = "",
}: {
  value: number;
  duration?: number;
  className?: string;
  suffix?: string;
  prefix?: string;
}) {
  const [displayValue, setDisplayValue] = useState(0);
  const prevValue = useRef(0);

  useEffect(() => {
    const start = prevValue.current;
    const end = value;
    const startTime = performance.now();
    const durationMs = duration * 1000;

    function animate(now: number) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(start + (end - start) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    }

    requestAnimationFrame(animate);
    prevValue.current = value;
  }, [value, duration]);

  return (
    <motion.span
      key={value}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring.gentle}
      className={className}
    >
      {prefix}{displayValue.toLocaleString()}{suffix}
    </motion.span>
  );
}

// ── Scale on hover ───────────────────────────────────────────

export function ScaleOnHover({
  children,
  className,
  scale = 1.02,
}: {
  children: React.ReactNode;
  className?: string;
  scale?: number;
}) {
  return (
    <motion.div
      whileHover={{ scale }}
      whileTap={{ scale: 0.98 }}
      transition={spring.snappy}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ── Slide in from direction ──────────────────────────────────

export function SlideIn({
  children,
  from = "bottom",
  delay = 0,
  className,
}: {
  children: React.ReactNode;
  from?: "left" | "right" | "top" | "bottom";
  delay?: number;
  className?: string;
}) {
  const directions = {
    left: { x: -24, y: 0 },
    right: { x: 24, y: 0 },
    top: { x: 0, y: -24 },
    bottom: { x: 0, y: 24 },
  };

  return (
    <motion.div
      initial={{ opacity: 0, ...directions[from] }}
      animate={{ opacity: 1, x: 0, y: 0 }}
      transition={{ ...spring.gentle, delay }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// Re-export motion for convenience
export { motion };
