"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Users,
  Trophy,
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface RepCard {
  id: string;
  name: string;
  total_sessions: number;
  avg_score: number;
  sparkline: number[];
}

interface LeaderboardRow {
  user_id: string;
  user_name: string;
  avg_score: number;
  sessions_this_week: number;
  trend: "up" | "down" | "flat";
}

export default function ManagerDashboardPage() {
  const supabase = createClient();
  const [reps, setReps] = useState<RepCard[]>([]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<"name" | "sessions" | "score">("score");

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("users")
        .select("org_id, role")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) return;
      if (profile.role !== "manager" && profile.role !== "admin") return;

      // Fetch all org users who are reps
      const { data: orgUsers } = await supabase
        .from("users")
        .select("id, name")
        .eq("org_id", profile.org_id);

      if (!orgUsers?.length) {
        setLoading(false);
        return;
      }

      const repCards: RepCard[] = [];
      const leaderboardRows: LeaderboardRow[] = [];
      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const twoWeeksAgo = new Date();
      twoWeeksAgo.setDate(twoWeeksAgo.getDate() - 14);

      for (const u of orgUsers) {
        // Total sessions + avg score
        const { data: scorecards } = await supabase
          .from("scorecards")
          .select("overall_score, created_at")
          .eq("user_id", u.id)
          .order("created_at", { ascending: false });

        const total = scorecards?.length ?? 0;
        const avgScore =
          total > 0
            ? Math.round(
                (scorecards ?? []).reduce(
                  (sum, s) => sum + (s.overall_score ?? 0),
                  0,
                ) / total,
              )
            : 0;

        // Last 10 scores for sparkline
        const sparkline = (scorecards ?? [])
          .slice(0, 10)
          .map((s) => s.overall_score ?? 0)
          .reverse();

        repCards.push({
          id: u.id,
          name: u.name ?? "Unknown",
          total_sessions: total,
          avg_score: avgScore,
          sparkline,
        });

        // This week's data for leaderboard
        const thisWeekScores = (scorecards ?? []).filter(
          (s) => new Date(s.created_at) >= weekAgo,
        );
        const prevWeekScores = (scorecards ?? []).filter(
          (s) =>
            new Date(s.created_at) >= twoWeeksAgo &&
            new Date(s.created_at) < weekAgo,
        );

        const thisWeekAvg =
          thisWeekScores.length > 0
            ? thisWeekScores.reduce(
                (sum, s) => sum + (s.overall_score ?? 0),
                0,
              ) / thisWeekScores.length
            : 0;
        const prevWeekAvg =
          prevWeekScores.length > 0
            ? prevWeekScores.reduce(
                (sum, s) => sum + (s.overall_score ?? 0),
                0,
              ) / prevWeekScores.length
            : 0;

        let trend: "up" | "down" | "flat" = "flat";
        if (thisWeekAvg > prevWeekAvg + 3) trend = "up";
        else if (thisWeekAvg < prevWeekAvg - 3) trend = "down";

        leaderboardRows.push({
          user_id: u.id,
          user_name: u.name ?? "Unknown",
          avg_score: Math.round(thisWeekAvg),
          sessions_this_week: thisWeekScores.length,
          trend,
        });
      }

      setReps(repCards);
      setLeaderboard(
        leaderboardRows.sort((a, b) => b.avg_score - a.avg_score),
      );
      setLoading(false);
    }
    load();
  }, []);

  const sortedReps = [...reps].sort((a, b) => {
    if (sortBy === "name") return a.name.localeCompare(b.name);
    if (sortBy === "sessions") return b.total_sessions - a.total_sessions;
    return b.avg_score - a.avg_score;
  });

  function TrendIcon({ trend }: { trend: "up" | "down" | "flat" }) {
    if (trend === "up")
      return <TrendingUp className="size-4 text-green-500" />;
    if (trend === "down")
      return <TrendingDown className="size-4 text-red-500" />;
    return <Minus className="size-4 text-muted-foreground" />;
  }

  function MiniSparkline({ data }: { data: number[] }) {
    if (data.length < 2) return null;
    const max = Math.max(...data, 1);
    const min = Math.min(...data, 0);
    const range = max - min || 1;
    const w = 80;
    const h = 24;
    const points = data
      .map(
        (v, i) =>
          `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * h}`,
      )
      .join(" ");

    return (
      <svg width={w} height={h} className="inline-block">
        <polyline
          points={points}
          fill="none"
          stroke="currentColor"
          strokeWidth={1.5}
          className="text-primary"
        />
      </svg>
    );
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading...
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Manager Dashboard
        </h1>
        <p className="text-muted-foreground">
          Monitor team performance and identify coaching opportunities.
        </p>
      </div>

      {/* Sort controls */}
      <div className="flex gap-2">
        {(["name", "sessions", "score"] as const).map((key) => (
          <button
            key={key}
            onClick={() => setSortBy(key)}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              sortBy === key
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border hover:border-primary"
            }`}
          >
            {key === "name"
              ? "Name"
              : key === "sessions"
                ? "Sessions"
                : "Avg Score"}
          </button>
        ))}
      </div>

      {/* Rep cards grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sortedReps.map((rep) => (
          <Link key={rep.id} href={`/sessions?user_id=${rep.id}`}>
            <Card className="transition-shadow hover:shadow-md">
              <CardContent className="pt-6">
                <div className="flex items-start gap-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                    {rep.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="font-medium">{rep.name}</p>
                    <div className="mt-1 flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <BarChart3 className="size-3" />
                        {rep.total_sessions} sessions
                      </span>
                      <span className="flex items-center gap-1">
                        <Trophy className="size-3" />
                        {rep.avg_score} avg
                      </span>
                    </div>
                    <div className="mt-2">
                      <MiniSparkline data={rep.sparkline} />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      {/* Leaderboard table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="size-4" />
            Weekly Leaderboard
          </CardTitle>
        </CardHeader>
        <CardContent>
          {leaderboard.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No data yet this week.
            </p>
          ) : (
            <div className="space-y-2">
              {leaderboard.map((row, idx) => (
                <div
                  key={row.user_id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{row.user_name}</p>
                  </div>
                  <div className="flex items-center gap-4 text-sm">
                    <Badge variant="outline">{row.avg_score} avg</Badge>
                    <span className="text-muted-foreground">
                      {row.sessions_this_week} this week
                    </span>
                    <TrendIcon trend={row.trend} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
