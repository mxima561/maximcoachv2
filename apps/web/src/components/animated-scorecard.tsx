"use client";

import { useEffect, useState, useRef } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface SkillScore {
  name: string;
  score: number;
  previousScore?: number;
}

interface AnimatedScorecardProps {
  overallScore: number;
  skills: SkillScore[];
  xpEarned?: number;
  onAnimationComplete?: () => void;
}

function useCountUp(target: number, duration = 1500, delay = 0) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const timeout = setTimeout(() => {
      function tick(timestamp: number) {
        if (!startTime.current) startTime.current = timestamp;
        const elapsed = timestamp - startTime.current;
        const progress = Math.min(elapsed / duration, 1);
        // Ease out cubic
        const eased = 1 - Math.pow(1 - progress, 3);
        setValue(Math.round(eased * target));

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(tick);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }, delay);

    return () => {
      clearTimeout(timeout);
      cancelAnimationFrame(rafRef.current);
    };
  }, [target, duration, delay]);

  return value;
}

function TrendArrow({ current, previous }: { current: number; previous?: number }) {
  if (previous === undefined) return null;
  const diff = current - previous;
  if (Math.abs(diff) < 2) return <Minus className="size-4 text-muted-foreground" />;
  if (diff > 0) return <TrendingUp className="size-4 text-green-500" />;
  return <TrendingDown className="size-4 text-red-500" />;
}

function scoreColor(score: number): string {
  if (score >= 80) return "text-green-500";
  if (score >= 60) return "text-yellow-500";
  return "text-red-500";
}

function ScoreRing({ score, size = 120 }: { score: number; size?: number }) {
  const animatedScore = useCountUp(score, 2000);
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (animatedScore / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-[2000ms] ease-out"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-3xl font-bold tabular-nums ${scoreColor(animatedScore)}`}>
          {animatedScore}
        </span>
        <span className="text-xs text-muted-foreground">Overall</span>
      </div>
    </div>
  );
}

export function AnimatedScorecard({
  overallScore,
  skills,
  xpEarned,
  onAnimationComplete,
}: AnimatedScorecardProps) {
  const [showSkills, setShowSkills] = useState(false);
  const [showXp, setShowXp] = useState(false);

  useEffect(() => {
    const skillTimer = setTimeout(() => setShowSkills(true), 1000);
    const xpTimer = setTimeout(() => {
      setShowXp(true);
      onAnimationComplete?.();
    }, 2500);
    return () => {
      clearTimeout(skillTimer);
      clearTimeout(xpTimer);
    };
  }, [onAnimationComplete]);

  return (
    <Card className="overflow-hidden">
      <CardHeader className="text-center">
        <CardTitle>Session Scorecard</CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall score ring */}
        <div className="flex justify-center">
          <ScoreRing score={overallScore} />
        </div>

        {/* Skill breakdown */}
        <div
          className={`space-y-3 transition-all duration-500 ${
            showSkills ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          {skills.map((skill, i) => (
            <SkillRow key={skill.name} skill={skill} delay={i * 200 + 1200} />
          ))}
        </div>

        {/* XP earned */}
        {xpEarned && (
          <div
            className={`flex items-center justify-center gap-2 pt-2 transition-all duration-500 ${
              showXp ? "opacity-100 scale-100" : "opacity-0 scale-75"
            }`}
          >
            <span className="rounded-full bg-primary/10 px-4 py-2 text-lg font-bold text-primary">
              +{xpEarned} XP
            </span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function SkillRow({ skill, delay }: { skill: SkillScore; delay: number }) {
  const animatedScore = useCountUp(skill.score, 1000, delay);

  return (
    <div className="flex items-center gap-3">
      <span className="w-32 text-sm text-muted-foreground truncate">
        {skill.name}
      </span>
      <div className="flex-1">
        <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="h-full rounded-full bg-primary transition-all duration-1000 ease-out"
            style={{ width: `${animatedScore}%`, transitionDelay: `${delay}ms` }}
          />
        </div>
      </div>
      <span className={`w-8 text-right text-sm font-medium tabular-nums ${scoreColor(animatedScore)}`}>
        {animatedScore}
      </span>
      <TrendArrow current={skill.score} previous={skill.previousScore} />
    </div>
  );
}
