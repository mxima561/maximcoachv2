"use client";

import { useEffect, useState, use } from "react";
import { Trophy, Clock, Copy, Check } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface MatchData {
  id: string;
  challenger_id: string;
  opponent_id: string;
  scenario_type: string;
  status: string;
  deadline: string;
  challenger_name: string;
  opponent_name: string;
  challenger_scores: CategoryScores | null;
  opponent_scores: CategoryScores | null;
  challenger_overall: number;
  opponent_overall: number;
}

interface CategoryScores {
  opening: { score: number };
  discovery: { score: number };
  objection_handling: { score: number };
  closing: { score: number };
  communication: { score: number };
}

const CATEGORIES = [
  "opening",
  "discovery",
  "objection_handling",
  "closing",
  "communication",
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  opening: "Opening",
  discovery: "Discovery",
  objection_handling: "Objection Handling",
  closing: "Closing",
  communication: "Communication",
};

export default function H2HResultsPage({
  params,
}: {
  params: Promise<{ matchId: string }>;
}) {
  const { matchId } = use(params);
  const supabase = createClient();
  const [match, setMatch] = useState<MatchData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: matchRow } = await supabase
        .from("h2h_matches")
        .select("*")
        .eq("id", matchId)
        .single();

      if (!matchRow) {
        setLoading(false);
        return;
      }

      // Get user names
      const { data: challenger } = await supabase
        .from("users")
        .select("name")
        .eq("id", matchRow.challenger_id)
        .single();

      const { data: opponent } = await supabase
        .from("users")
        .select("name")
        .eq("id", matchRow.opponent_id)
        .single();

      // Get scorecards if both completed
      let challengerScores: CategoryScores | null = null;
      let challengerOverall = 0;
      let opponentScores: CategoryScores | null = null;
      let opponentOverall = 0;

      if (matchRow.challenger_session_id) {
        const { data: sc } = await supabase
          .from("scorecards")
          .select("overall_score, scores")
          .eq("session_id", matchRow.challenger_session_id)
          .single();
        if (sc) {
          challengerScores = sc.scores as CategoryScores;
          challengerOverall = sc.overall_score ?? 0;
        }
      }

      if (matchRow.opponent_session_id) {
        const { data: sc } = await supabase
          .from("scorecards")
          .select("overall_score, scores")
          .eq("session_id", matchRow.opponent_session_id)
          .single();
        if (sc) {
          opponentScores = sc.scores as CategoryScores;
          opponentOverall = sc.overall_score ?? 0;
        }
      }

      setMatch({
        ...matchRow,
        challenger_name: challenger?.name ?? "Challenger",
        opponent_name: opponent?.name ?? "Opponent",
        challenger_scores: challengerScores,
        opponent_scores: opponentScores,
        challenger_overall: challengerOverall,
        opponent_overall: opponentOverall,
      });
      setLoading(false);
    }
    load();
  }, [matchId]);

  async function handleShare() {
    if (!match) return;
    const winner =
      match.challenger_overall >= match.opponent_overall
        ? match.challenger_name
        : match.opponent_name;
    const summary = `Head-to-Head: ${match.challenger_name} (${match.challenger_overall}) vs ${match.opponent_name} (${match.opponent_overall}) — Winner: ${winner}`;
    await navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading...
      </p>
    );
  }

  if (!match) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Match not found.
      </p>
    );
  }

  const bothCompleted =
    match.challenger_scores !== null && match.opponent_scores !== null;
  const winner =
    match.challenger_overall >= match.opponent_overall
      ? "challenger"
      : "opponent";

  const deadlineRemaining = Math.max(
    0,
    new Date(match.deadline).getTime() - Date.now(),
  );
  const hoursLeft = Math.floor(deadlineRemaining / (1000 * 60 * 60));

  // Radar chart data points as SVG polygon
  function radarPoints(
    scores: CategoryScores | null,
    cx: number,
    cy: number,
    r: number,
  ): string {
    if (!scores) return "";
    const values = CATEGORIES.map(
      (cat) => (scores[cat]?.score ?? 0) / 100,
    );
    return values
      .map((v, i) => {
        const angle = (Math.PI * 2 * i) / values.length - Math.PI / 2;
        const x = cx + r * v * Math.cos(angle);
        const y = cy + r * v * Math.sin(angle);
        return `${x},${y}`;
      })
      .join(" ");
  }

  const radarCx = 120;
  const radarCy = 120;
  const radarR = 100;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Head-to-Head Results
        </h1>
        <p className="text-muted-foreground">
          {match.scenario_type.replace("_", " ")} scenario
        </p>
      </div>

      {!bothCompleted && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className="size-5 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800 dark:text-amber-200">
                Waiting for opponent
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {hoursLeft > 0
                  ? `${hoursLeft} hours remaining`
                  : "Deadline passed"}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Side by side scores */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Card
          className={
            bothCompleted && winner === "challenger"
              ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950"
              : ""
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {match.challenger_name}
              {bothCompleted && winner === "challenger" && (
                <Trophy className="size-4 text-amber-500" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">{match.challenger_overall}</p>
            <p className="text-sm text-muted-foreground">Overall Score</p>
          </CardContent>
        </Card>

        <Card
          className={
            bothCompleted && winner === "opponent"
              ? "border-green-300 bg-green-50 dark:border-green-900 dark:bg-green-950"
              : ""
          }
        >
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              {match.opponent_name}
              {bothCompleted && winner === "opponent" && (
                <Trophy className="size-4 text-amber-500" />
              )}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">
              {match.opponent_scores ? match.opponent_overall : "—"}
            </p>
            <p className="text-sm text-muted-foreground">Overall Score</p>
          </CardContent>
        </Card>
      </div>

      {/* Radar chart */}
      {bothCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Comparison</CardTitle>
          </CardHeader>
          <CardContent className="flex justify-center">
            <svg width={240} height={240} viewBox="0 0 240 240">
              {/* Grid lines */}
              {[0.25, 0.5, 0.75, 1].map((scale) => (
                <polygon
                  key={scale}
                  points={CATEGORIES.map((_, i) => {
                    const angle =
                      (Math.PI * 2 * i) / CATEGORIES.length - Math.PI / 2;
                    return `${radarCx + radarR * scale * Math.cos(angle)},${radarCy + radarR * scale * Math.sin(angle)}`;
                  }).join(" ")}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={0.5}
                  className="text-muted-foreground/20"
                />
              ))}
              {/* Category labels */}
              {CATEGORIES.map((cat, i) => {
                const angle =
                  (Math.PI * 2 * i) / CATEGORIES.length - Math.PI / 2;
                const lx = radarCx + (radarR + 15) * Math.cos(angle);
                const ly = radarCy + (radarR + 15) * Math.sin(angle);
                return (
                  <text
                    key={cat}
                    x={lx}
                    y={ly}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-muted-foreground text-[8px]"
                  >
                    {CATEGORY_LABELS[cat]}
                  </text>
                );
              })}
              {/* Challenger */}
              <polygon
                points={radarPoints(
                  match.challenger_scores,
                  radarCx,
                  radarCy,
                  radarR,
                )}
                fill="hsl(220 80% 60% / 0.2)"
                stroke="hsl(220 80% 60%)"
                strokeWidth={2}
              />
              {/* Opponent */}
              <polygon
                points={radarPoints(
                  match.opponent_scores,
                  radarCx,
                  radarCy,
                  radarR,
                )}
                fill="hsl(340 80% 60% / 0.2)"
                stroke="hsl(340 80% 60%)"
                strokeWidth={2}
              />
            </svg>
          </CardContent>
        </Card>
      )}

      {/* Category breakdown */}
      {bothCompleted && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Category Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {CATEGORIES.map((cat) => {
                const cs = match.challenger_scores?.[cat]?.score ?? 0;
                const os = match.opponent_scores?.[cat]?.score ?? 0;
                const catWinner = cs > os ? "challenger" : cs < os ? "opponent" : "tie";
                return (
                  <div key={cat} className="space-y-1">
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-medium">
                        {CATEGORY_LABELS[cat]}
                      </span>
                      {catWinner !== "tie" && (
                        <Badge
                          variant="outline"
                          className="text-xs"
                        >
                          {catWinner === "challenger"
                            ? match.challenger_name
                            : match.opponent_name}
                        </Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="w-8 text-right text-sm font-semibold text-blue-600">
                        {cs}
                      </span>
                      <div className="flex-1">
                        <div className="flex h-3 overflow-hidden rounded-full">
                          <div
                            className="bg-blue-500"
                            style={{
                              width: `${((cs / (cs + os || 1)) * 100).toFixed(0)}%`,
                            }}
                          />
                          <div
                            className="bg-pink-500"
                            style={{
                              width: `${((os / (cs + os || 1)) * 100).toFixed(0)}%`,
                            }}
                          />
                        </div>
                      </div>
                      <span className="w-8 text-sm font-semibold text-pink-600">
                        {os}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 flex justify-center gap-6 text-xs">
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-blue-500" />
                {match.challenger_name}
              </span>
              <span className="flex items-center gap-1">
                <span className="size-2 rounded-full bg-pink-500" />
                {match.opponent_name}
              </span>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Share */}
      {bothCompleted && (
        <Button onClick={handleShare} variant="outline" className="w-full">
          {copied ? (
            <>
              <Check className="mr-2 size-4" />
              Copied!
            </>
          ) : (
            <>
              <Copy className="mr-2 size-4" />
              Share Results
            </>
          )}
        </Button>
      )}
    </div>
  );
}
