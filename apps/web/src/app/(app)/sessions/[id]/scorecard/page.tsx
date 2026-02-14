"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Mic,
  RefreshCw,
  Share2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClipCapture } from "@/components/clip-capture";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────

interface ScorecardCategory {
  score: number;
  strengths: string[];
  improvements: string[];
  coaching_tip: string;
}

interface ScorecardData {
  id: string;
  overall_score: number;
  scores: {
    opening: ScorecardCategory;
    discovery: ScorecardCategory;
    objection_handling: ScorecardCategory;
    closing: ScorecardCategory;
    communication: ScorecardCategory;
  };
  coaching_text: string;
}

const CATEGORY_LABELS: Record<string, string> = {
  opening: "Opening",
  discovery: "Discovery",
  objection_handling: "Objection Handling",
  closing: "Closing",
  communication: "Communication",
};

// ── Score Ring Component ──────────────────────────────────────

function ScoreRing({ score, size = 72 }: { score: number; size?: number }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;
  const color =
    score >= 80
      ? "text-green-500"
      : score >= 60
        ? "text-amber-500"
        : "text-red-500";

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="rotate-[-90deg]" width={size} height={size}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={color}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className={`text-xl font-bold ${color}`}>{score}</span>
      </div>
    </div>
  );
}

// ── Category Card ────────────────────────────────────────────

function CategoryCard({
  name,
  category,
}: {
  name: string;
  category: ScorecardCategory;
}) {
  const [expanded, setExpanded] = useState(false);
  const color =
    category.score >= 80
      ? "bg-green-500"
      : category.score >= 60
        ? "bg-amber-500"
        : "bg-red-500";

  return (
    <Card>
      <CardHeader
        className="cursor-pointer"
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {CATEGORY_LABELS[name] ?? name}
          </CardTitle>
          <div className="flex items-center gap-3">
            <span className="text-sm font-semibold">{category.score}/100</span>
            {expanded ? (
              <ChevronUp className="size-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="size-4 text-muted-foreground" />
            )}
          </div>
        </div>
        {/* Progress bar */}
        <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-muted">
          <div
            className={`h-full rounded-full ${color} transition-all`}
            style={{ width: `${category.score}%` }}
          />
        </div>
      </CardHeader>
      {expanded && (
        <CardContent className="space-y-3 border-t pt-4">
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Strengths
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {category.strengths.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Areas for Improvement
            </p>
            <ul className="mt-1 list-inside list-disc space-y-1 text-sm">
              {category.improvements.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-lg bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase text-primary">
              Coaching Tip
            </p>
            <p className="mt-1 text-sm">{category.coaching_tip}</p>
          </div>
        </CardContent>
      )}
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function ScorecardPage() {
  const params = useParams();
  const sessionId = params.id as string;
  const supabase = createClient();

  const [scorecard, setScorecard] = useState<ScorecardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("scorecards")
        .select("id, overall_score, scores, coaching_text")
        .eq("session_id", sessionId)
        .single();

      if (data) {
        setScorecard(data as unknown as ScorecardData);
      }
      setLoading(false);
    }
    load();
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading scorecard...</p>
      </div>
    );
  }

  if (!scorecard) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Scorecard not found.</p>
      </div>
    );
  }

  const categories = Object.entries(scorecard.scores) as [
    string,
    ScorecardCategory,
  ][];

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/sessions">
            <ArrowLeft className="mr-1 size-4" />
            Back to Sessions
          </Link>
        </Button>
      </div>

      {/* Overall score */}
      <Card>
        <CardContent className="flex items-center gap-6 py-6">
          <ScoreRing score={scorecard.overall_score} size={72} />
          <div className="flex-1">
            <h2 className="text-lg font-semibold">Overall Score</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {scorecard.coaching_text.split(".").slice(0, 2).join(".") + "."}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Category breakdown */}
      <div className="space-y-3">
        {categories.map(([name, cat]) => (
          <CategoryCard key={name} name={name} category={cat} />
        ))}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3">
        <Button asChild>
          <Link href={`/simulations/new`}>
            <RefreshCw className="mr-1 size-4" />
            Try Again
          </Link>
        </Button>
        <Button variant="outline" asChild>
          <Link href="/simulations/new">
            <Mic className="mr-1 size-4" />
            New Simulation
          </Link>
        </Button>
        <Button variant="outline">
          <Share2 className="mr-1 size-4" />
          Share Results
        </Button>
        <ClipCapture
          sessionId={params.id as string}
          sessionDurationSeconds={600}
        />
      </div>
    </div>
  );
}
