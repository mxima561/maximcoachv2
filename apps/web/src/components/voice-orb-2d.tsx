"use client";

import { useRef, useEffect, useState } from "react";
import type { OrbState } from "./voice-orb";

interface VoiceOrb2DProps {
  state?: OrbState;
  audioData?: Float32Array | null;
  className?: string;
}

const STATE_COLORS: Record<OrbState, { bg: string; bar: string; ring: string }> = {
  idle: {
    bg: "bg-blue-500/10",
    bar: "bg-blue-500",
    ring: "ring-blue-500/30",
  },
  listening: {
    bg: "bg-green-500/10",
    bar: "bg-green-500",
    ring: "ring-green-500/30",
  },
  speaking: {
    bg: "bg-amber-500/10",
    bar: "bg-amber-500",
    ring: "ring-amber-500/30",
  },
  processing: {
    bg: "bg-purple-500/10",
    bar: "bg-purple-500",
    ring: "ring-purple-500/30",
  },
};

const BAR_COUNT = 24;

export function VoiceOrb2D({
  state = "idle",
  audioData = null,
  className = "",
}: VoiceOrb2DProps) {
  const [reducedMotion, setReducedMotion] = useState(false);
  const barsRef = useRef<HTMLDivElement[]>([]);
  const frameRef = useRef<number>(0);
  const timeRef = useRef(0);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  useEffect(() => {
    if (reducedMotion) return;

    function animate() {
      frameRef.current = requestAnimationFrame(animate);
      timeRef.current += 0.016;

      const bars = barsRef.current;
      for (let i = 0; i < bars.length; i++) {
        if (!bars[i]) continue;

        let height: number;

        if (audioData && audioData.length > 0) {
          // Map bar index to audio data
          const dataIndex = Math.floor((i / bars.length) * audioData.length);
          height = Math.abs(audioData[dataIndex]) * 100;
        } else {
          // Idle animation
          const phase = (i / bars.length) * Math.PI * 2;
          const baseSpeed =
            state === "idle"
              ? 0.5
              : state === "listening"
                ? 1
                : state === "speaking"
                  ? 2
                  : 3;
          height =
            20 +
            Math.sin(timeRef.current * baseSpeed + phase) * 15 +
            Math.sin(timeRef.current * baseSpeed * 1.5 + phase * 2) * 10;
        }

        height = Math.max(8, Math.min(100, height));
        bars[i].style.height = `${height}%`;
      }
    }

    animate();
    return () => cancelAnimationFrame(frameRef.current);
  }, [audioData, state, reducedMotion]);

  const colors = STATE_COLORS[state];

  return (
    <div
      className={`relative flex aspect-square items-center justify-center ${className}`}
    >
      {/* Outer ring */}
      <div
        className={`absolute inset-4 rounded-full ring-2 ${colors.ring} transition-all duration-300`}
      />

      {/* Background circle */}
      <div
        className={`absolute inset-8 rounded-full ${colors.bg} transition-colors duration-300`}
      />

      {/* Waveform bars arranged in a circle */}
      <div className="relative flex size-3/4 items-center justify-center">
        {Array.from({ length: BAR_COUNT }).map((_, i) => {
          const angle = (i / BAR_COUNT) * 360;
          return (
            <div
              key={i}
              className="absolute flex items-end justify-center"
              style={{
                width: "3px",
                height: "40%",
                transformOrigin: "center bottom",
                transform: `rotate(${angle}deg) translateY(-50%)`,
              }}
            >
              <div
                ref={(el) => {
                  if (el) barsRef.current[i] = el;
                }}
                className={`w-full rounded-full ${colors.bar} transition-colors duration-300`}
                style={{
                  height: reducedMotion ? "30%" : "20%",
                  transition: reducedMotion
                    ? "background-color 300ms"
                    : "background-color 300ms",
                }}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Auto-detect wrapper ───────────────────────────────────────

function hasWebGL(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const canvas = document.createElement("canvas");
    return !!(
      canvas.getContext("webgl2") || canvas.getContext("webgl")
    );
  } catch {
    return false;
  }
}

export function AdaptiveOrb(
  props: VoiceOrb2DProps & { force2D?: boolean },
) {
  const [use3D, setUse3D] = useState(false);
  const [OrbComponent, setOrbComponent] = useState<React.ComponentType<
    VoiceOrb2DProps
  > | null>(null);

  useEffect(() => {
    if (props.force2D || !hasWebGL()) {
      setUse3D(false);
      return;
    }
    setUse3D(true);
    // Dynamic import to avoid loading Three.js on mobile
    import("./voice-orb").then((mod) => {
      setOrbComponent(() => mod.VoiceOrb);
    });
  }, [props.force2D]);

  if (use3D && OrbComponent) {
    return <OrbComponent {...props} />;
  }

  return <VoiceOrb2D {...props} />;
}
