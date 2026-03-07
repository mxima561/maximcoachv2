"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Mic, Trophy, Target, Flame, BarChart3, ArrowRight, Sparkles } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Area,
  AreaChart,
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
import { XpBar } from "@/components/gamification/xp-bar";
import { StreakCounter } from "@/components/gamification/streak-counter";
import { RankBadge } from "@/components/gamification/rank-badge";
import { BadgeDisplay } from "@/components/gamification/badge-display";
import { identifyUser, trackEvent } from "@/lib/posthog";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
  ScaleOnHover,
} from "@/components/motion";

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

interface GamificationProfile {
  total_xp: number;
  today_xp: number;
  current_streak: number;
  longest_streak: number;
  rank: { level: number; name: string; icon: string; min_xp: number };
  rank_progress: {
    current: { level: number; name: string; minXp: number };
    next: { level: number; name: string; minXp: number } | null;
    progressToNext: number;
  };
}

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

const SCENARIO_LABELS: Record<string, string> = {
  cold_call: "Cold Call",
  discovery: "Discovery",
  objection_handling: "Objection Handling",
  closing: "Closing",
};

const STAT_CONFIG: {
  key: keyof Stats;
  title: string;
  icon: typeof Trophy;
  color: string;
  iconColor: string;
  borderColor: string;
  suffix?: (v: number) => string;
}[] = [
  {
    key: "totalSessions",
    title: "Total Sessions",
    icon: BarChart3,
    color: "from-blue-500/10 to-blue-500/5",
    iconColor: "text-blue-500",
    borderColor: "border-l-blue-500",
  },
  {
    key: "averageScore",
    title: "Average Score",
    icon: Target,
    color: "from-emerald-500/10 to-emerald-500/5",
    iconColor: "text-emerald-500",
    borderColor: "border-l-emerald-500",
  },
  {
    key: "bestScore",
    title: "Best Score",
    icon: Trophy,
    color: "from-amber-500/10 to-amber-500/5",
    iconColor: "text-amber-500",
    borderColor: "border-l-amber-500",
  },
  {
    key: "currentStreak",
    title: "Current Streak",
    icon: Flame,
    color: "from-orange-500/10 to-orange-500/5",
    iconColor: "text-orange-500",
    borderColor: "border-l-orange-500",
    suffix: (v: number) => ` day${v !== 1 ? "s" : ""}`,
  },
];

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// ── Stat Card ────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon: Icon,
  color,
  iconColor,
  borderColor,
  suffix,
}: {
  title: string;
  value: number;
  icon: typeof Trophy;
  color: string;
  iconColor: string;
  borderColor: string;
  suffix?: string;
}) {
  return (
    <ScaleOnHover>
      <Card className={`border-l-4 ${borderColor} overflow-hidden`}>
        <CardContent className="relative pt-5 pb-4">
          <div className={`absolute inset-0 bg-gradient-to-br ${color} opacity-50`} />
          <div className="relative">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-muted-foreground">{title}</p>
              <div className={`p-1.5 rounded-lg bg-background/80 ${iconColor}`}>
                <Icon className="size-4" />
              </div>
            </div>
            <div className="text-3xl font-bold tabular-nums">
              <AnimatedCounter value={value} suffix={suffix ?? ""} />
            </div>
          </div>
        </CardContent>
      </Card>
    </ScaleOnHover>
  );
}

// ── Custom Chart Tooltip ─────────────────────────────────────

function ChartTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-card/95 backdrop-blur-sm px-4 py-2.5 shadow-lg">
      <p className="text-xs text-muted-foreground mb-0.5">{label}</p>
      <p className="text-lg font-bold">{payload[0].value}</p>
    </div>
  );
}

// ── Score Badge ──────────────────────────────────────────────

function ScoreBadge({ score }: { score: number }) {
  const config = score >= 80
    ? { bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", label: "Excellent" }
    : score >= 60
      ? { bg: "bg-amber-500/10 text-amber-600 border-amber-500/20", label: "Good" }
      : { bg: "bg-red-500/10 text-red-600 border-red-500/20", label: "Needs Work" };

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-semibold ${config.bg}`}>
      {score}
    </span>
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
  const [gamification, setGamification] = useState<GamificationProfile | null>(null);
  const [badges, setBadges] = useState<BadgeItem[]>([]);
  const [badgeCounts, setBadgeCounts] = useState({ earned: 0, total: 0 });

  const fetchGamification = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const headers = { Authorization: `Bearer ${session.access_token}` };

    const [profileRes, badgesRes] = await Promise.all([
      fetch(`${API_URL}/api/gamification/profile`, { headers }).then((r) => r.ok ? r.json() : null),
      fetch(`${API_URL}/api/gamification/badges`, { headers }).then((r) => r.ok ? r.json() : null),
    ]);

    if (profileRes) setGamification(profileRes);
    if (badgesRes) {
      setBadges(badgesRes.badges ?? []);
      setBadgeCounts({ earned: badgesRes.earned_count ?? 0, total: badgesRes.total_count ?? 0 });
    }
  }, [supabase]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) {
        identifyUser(data.user.id, { email: data.user.email });
        trackEvent("dashboard_viewed");
      }
    });
  }, [supabase]);

  useEffect(() => {
    async function load() {
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
    fetchGamification();
  }, [fetchGamification]);

  return (
    <div className="space-y-8">
      {/* Hero header */}
      <FadeIn>
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/8 via-primary/4 to-transparent border border-primary/10 p-6 md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-primary/5 to-transparent rounded-full blur-3xl" />
          <div className="relative flex items-center justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Sparkles className="size-5 text-primary" />
                <span className="text-sm font-medium text-primary">Training Hub</span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight">
                Welcome back
              </h1>
              <p className="text-muted-foreground max-w-md">
                Track your progress, sharpen your skills, and climb the leaderboard.
              </p>
            </div>
            <Button asChild size="lg" className="hidden md:flex gap-2 rounded-xl shadow-lg shadow-primary/20">
              <Link href="/simulations/new">
                <Mic className="size-4" />
                Start Simulation
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </FadeIn>

      {/* Gamification bar */}
      {gamification && (
        <FadeIn delay={0.1}>
          <Card className="overflow-hidden">
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-[1fr_auto_auto]">
                <div className="space-y-1">
                  <XpBar
                    currentXp={gamification.total_xp}
                    currentRankMinXp={gamification.rank_progress.current.minXp}
                    nextRankMinXp={gamification.rank_progress.next?.minXp ?? null}
                    rankName={gamification.rank.name}
                    rankIcon={gamification.rank.icon}
                    nextRankName={gamification.rank_progress.next?.name ?? null}
                  />
                  {gamification.today_xp > 0 && (
                    <p className="text-xs text-primary font-medium">
                      +{gamification.today_xp} XP today
                    </p>
                  )}
                </div>
                <div className="flex items-center border-l pl-6">
                  <StreakCounter
                    streak={gamification.current_streak}
                    longestStreak={gamification.longest_streak}
                  />
                </div>
                <div className="flex items-center border-l pl-6">
                  <RankBadge
                    level={gamification.rank.level}
                    name={gamification.rank.name}
                    icon={gamification.rank.icon}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Mobile CTA */}
      <div className="md:hidden">
        <Button asChild className="w-full gap-2 rounded-xl shadow-lg shadow-primary/20">
          <Link href="/simulations/new">
            <Mic className="size-4" />
            Start Simulation
            <ArrowRight className="size-4" />
          </Link>
        </Button>
      </div>

      {/* Stat cards */}
      <StaggerContainer className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {STAT_CONFIG.map((cfg) => {
          const value = stats[cfg.key as keyof Stats];
          const numValue = typeof value === "number" ? value : 0;
          return (
            <StaggerItem key={cfg.key}>
              <StatCard
                title={cfg.title}
                value={numValue}
                icon={cfg.icon}
                color={cfg.color}
                iconColor={cfg.iconColor}
                borderColor={cfg.borderColor}
                suffix={cfg.suffix ? cfg.suffix(numValue) : undefined}
              />
            </StaggerItem>
          );
        })}
      </StaggerContainer>

      {/* Score trend chart */}
      {trend.length > 0 && (
        <FadeIn delay={0.3}>
          <Card className="overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">Score Trend</CardTitle>
                <span className="text-xs text-muted-foreground">Last 30 days</span>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={260}>
                <AreaChart data={trend}>
                  <defs>
                    <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="oklch(0.55 0.27 277)" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="oklch(0.55 0.27 277)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted/50" vertical={false} />
                  <XAxis
                    dataKey="date"
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    domain={[0, 100]}
                    className="text-xs"
                    tick={{ fontSize: 11 }}
                    axisLine={false}
                    tickLine={false}
                    width={30}
                  />
                  <Tooltip content={<ChartTooltip />} />
                  <Area
                    type="monotone"
                    dataKey="score"
                    stroke="oklch(0.55 0.27 277)"
                    strokeWidth={2.5}
                    fill="url(#scoreGradient)"
                    dot={{ r: 3, fill: "oklch(0.55 0.27 277)", strokeWidth: 0 }}
                    activeDot={{ r: 6, strokeWidth: 2, stroke: "white" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Badges */}
      {badges.length > 0 && (
        <FadeIn delay={0.4}>
          <Card>
            <CardContent className="pt-6">
              <BadgeDisplay
                badges={badges}
                earnedCount={badgeCounts.earned}
                totalCount={badgeCounts.total}
              />
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Recent sessions */}
      <FadeIn delay={0.5}>
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Recent Sessions</CardTitle>
              {recent.length > 0 && (
                <Button variant="ghost" size="sm" asChild className="text-xs text-muted-foreground hover:text-primary">
                  <Link href="/sessions">View all</Link>
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {recent.length === 0 ? (
              <div className="flex flex-col items-center py-8 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
                  <Mic className="size-6 text-primary" />
                </div>
                <p className="font-medium">No sessions yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Start your first simulation to begin tracking your progress.
                </p>
                <Button asChild variant="outline" size="sm" className="mt-4">
                  <Link href="/simulations/new">Start Simulation</Link>
                </Button>
              </div>
            ) : (
              <StaggerContainer className="space-y-2">
                {recent.map((session) => (
                  <StaggerItem key={session.id}>
                    <Link
                      href={`/sessions/${session.id}/scorecard`}
                      className="group flex items-center justify-between rounded-xl border p-3.5 transition-all duration-200 hover:bg-accent/50 hover:border-primary/15 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex size-9 items-center justify-center rounded-lg bg-primary/8 text-primary">
                          <Mic className="size-4" />
                        </div>
                        <div>
                          <p className="font-medium text-sm group-hover:text-primary transition-colors">
                            {SCENARIO_LABELS[session.scenario_type] ??
                              session.scenario_type}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {new Date(session.started_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {session.overall_score !== null && (
                          <ScoreBadge score={session.overall_score} />
                        )}
                        <ArrowRight className="size-4 text-muted-foreground/0 group-hover:text-muted-foreground transition-all group-hover:translate-x-0.5" />
                      </div>
                    </Link>
                  </StaggerItem>
                ))}
              </StaggerContainer>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
