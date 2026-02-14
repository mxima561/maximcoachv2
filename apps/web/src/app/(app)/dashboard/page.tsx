"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Mic, Trophy, Target, Flame, BarChart3 } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────

interface Stats {
  totalSessions: number;
  averageScore: number;
  bestScore: number;
  currentStreak: number;
}

interface TrendPoint {
  date: string;
  score: number;
}

interface RecentSession {
  id: string;
  scenario_type: string;
  overall_score: number | null;
  started_at: string;
}

const SCENARIO_LABELS: Record<string, string> = {
  cold_call: "Cold Call",
  discovery: "Discovery",
  objection_handling: "Objection Handling",
  closing: "Closing",
};

// ── Stat Card ────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
}: {
  title: string;
  value: string | number;
  icon: typeof Trophy;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium">{title}</CardTitle>
        <Icon className="size-4 text-muted-foreground" />
      </CardHeader>
      <CardContent>
        <div className="text-2xl font-bold">{value}</div>
      </CardContent>
    </Card>
  );
}

// ── Page ─────────────────────────────────────────────────────

export default function DashboardPage() {
  const supabase = createClient();
  const [stats, setStats] = useState<Stats>({
    totalSessions: 0,
    averageScore: 0,
    bestScore: 0,
    currentStreak: 0,
  });
  const [trend, setTrend] = useState<TrendPoint[]>([]);
  const [recent, setRecent] = useState<RecentSession[]>([]);

  useEffect(() => {
    async function load() {
      // Fetch scorecards for stats
      const { data: scorecards } = await supabase
        .from("scorecards")
        .select("overall_score, created_at")
        .order("created_at", { ascending: false })
        .limit(200);

      if (scorecards && scorecards.length > 0) {
        const scores = scorecards.map(
          (s: { overall_score: number }) => s.overall_score,
        );
        const avg = Math.round(
          scores.reduce((a: number, b: number) => a + b, 0) / scores.length,
        );
        const best = Math.max(...scores);

        // Calculate streak (consecutive days with sessions)
        let streak = 0;
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const dates = new Set(
          scorecards.map((s: { created_at: string }) => {
            const d = new Date(s.created_at);
            d.setHours(0, 0, 0, 0);
            return d.getTime();
          }),
        );

        for (let i = 0; i < 365; i++) {
          const checkDate = new Date(today);
          checkDate.setDate(checkDate.getDate() - i);
          checkDate.setHours(0, 0, 0, 0);
          if (dates.has(checkDate.getTime())) {
            streak++;
          } else if (i > 0) {
            break;
          }
        }

        setStats({
          totalSessions: scorecards.length,
          averageScore: avg,
          bestScore: best,
          currentStreak: streak,
        });

        // Build 30-day trend
        const trendMap = new Map<string, number[]>();
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        scorecards.forEach(
          (s: { overall_score: number; created_at: string }) => {
            const d = new Date(s.created_at);
            if (d >= thirtyDaysAgo) {
              const key = d.toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              });
              const arr = trendMap.get(key) ?? [];
              arr.push(s.overall_score);
              trendMap.set(key, arr);
            }
          },
        );

        const trendData: TrendPoint[] = [];
        for (const [date, scores] of trendMap) {
          trendData.push({
            date,
            score: Math.round(
              scores.reduce((a, b) => a + b, 0) / scores.length,
            ),
          });
        }
        setTrend(trendData.reverse());
      }

      // Fetch recent sessions
      const { data: sessions } = await supabase
        .from("sessions")
        .select("id, scenario_type, started_at, scorecards(overall_score)")
        .order("started_at", { ascending: false })
        .limit(5);

      if (sessions) {
        setRecent(
          sessions.map((s: Record<string, unknown>) => {
            const sc = s.scorecards as Record<string, unknown> | null;
            return {
              id: s.id as string,
              scenario_type: s.scenario_type as string,
              started_at: s.started_at as string,
              overall_score: (sc?.overall_score as number | null) ?? null,
            };
          }),
        );
      }
    }
    load();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
          <p className="text-muted-foreground">
            Track your sales training progress.
          </p>
        </div>
        <Button asChild>
          <Link href="/simulations/new">
            <Mic className="mr-1 size-4" />
            Start Simulation
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total Sessions"
          value={stats.totalSessions}
          icon={BarChart3}
        />
        <StatCard
          title="Average Score"
          value={stats.averageScore}
          icon={Target}
        />
        <StatCard title="Best Score" value={stats.bestScore} icon={Trophy} />
        <StatCard
          title="Current Streak"
          value={`${stats.currentStreak} day${stats.currentStreak !== 1 ? "s" : ""}`}
          icon={Flame}
        />
      </div>

      {/* Score trend chart */}
      {trend.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Score Trend (30 days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={trend}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <YAxis
                  domain={[0, 100]}
                  className="text-xs"
                  tick={{ fontSize: 12 }}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid hsl(var(--border))",
                    backgroundColor: "hsl(var(--card))",
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="score"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  activeDot={{ r: 6 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Recent sessions */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Sessions</CardTitle>
        </CardHeader>
        <CardContent>
          {recent.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No sessions yet. Start your first simulation!
            </p>
          ) : (
            <div className="space-y-3">
              {recent.map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${session.id}/scorecard`}
                  className="flex items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent"
                >
                  <div>
                    <p className="font-medium">
                      {SCENARIO_LABELS[session.scenario_type] ??
                        session.scenario_type}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(session.started_at).toLocaleDateString()}
                    </p>
                  </div>
                  {session.overall_score !== null && (
                    <Badge
                      variant={
                        session.overall_score >= 80
                          ? "default"
                          : session.overall_score >= 60
                            ? "secondary"
                            : "destructive"
                      }
                    >
                      {session.overall_score}
                    </Badge>
                  )}
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
