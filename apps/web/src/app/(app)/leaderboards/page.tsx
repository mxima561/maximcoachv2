"use client";

import { useEffect, useState, useCallback } from "react";
import { Trophy, TrendingUp, Target, Flame, Clock, Crown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/posthog";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
  AnimatedCounter,
  motion,
} from "@/components/motion";

// ── Types ─────────────────────────────────────────────────────

type TabKey = "top_score" | "most_improved" | "consistency" | "streak";

interface LeaderboardEntry {
  user_id: string;
  user_name: string;
  rank: number;
  metric_value: number | string;
  metric_label: string;
}

const TABS: {
  key: TabKey;
  label: string;
  icon: typeof Trophy;
  view: string;
  metricField: string;
  metricLabel: string;
}[] = [
  {
    key: "top_score",
    label: "Top Score",
    icon: Trophy,
    view: "leaderboard_top_score",
    metricField: "top_score",
    metricLabel: "Score",
  },
  {
    key: "most_improved",
    label: "Most Improved",
    icon: TrendingUp,
    view: "leaderboard_most_improved",
    metricField: "improvement",
    metricLabel: "Improvement",
  },
  {
    key: "consistency",
    label: "Consistency King",
    icon: Target,
    view: "leaderboard_consistency",
    metricField: "score_variance",
    metricLabel: "Variance",
  },
  {
    key: "streak",
    label: "Streak Leader",
    icon: Flame,
    view: "leaderboard_streak",
    metricField: "streak_days",
    metricLabel: "Days",
  },
];

function getDaysUntilReset(): number {
  const now = new Date();
  const day = now.getDay();
  return day === 0 ? 7 : 7 - day;
}

// ── Podium card for top 3 ────────────────────────────────────

function PodiumCard({ entry, isCurrentUser }: { entry: LeaderboardEntry; isCurrentUser: boolean }) {
  const podiumConfig: Record<number, { gradient: string; medal: string; height: string; ring: string }> = {
    1: { gradient: "from-amber-400/20 via-yellow-400/10 to-amber-400/5", medal: "from-amber-400 to-yellow-500", height: "h-28", ring: "ring-amber-400/30" },
    2: { gradient: "from-slate-300/20 via-slate-200/10 to-slate-300/5", medal: "from-slate-400 to-slate-300", height: "h-22", ring: "ring-slate-400/30" },
    3: { gradient: "from-orange-400/20 via-orange-300/10 to-orange-400/5", medal: "from-orange-500 to-orange-400", height: "h-18", ring: "ring-orange-400/30" },
  };

  const cfg = podiumConfig[entry.rank];
  if (!cfg) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: entry.rank * 0.1, type: "spring", stiffness: 200, damping: 20 }}
      className={`flex flex-col items-center ${entry.rank === 1 ? "order-2" : entry.rank === 2 ? "order-1" : "order-3"}`}
    >
      <div className="relative mb-2">
        <div className={`flex size-14 items-center justify-center rounded-full bg-gradient-to-br ${cfg.gradient} ring-2 ${cfg.ring} ${isCurrentUser ? "ring-primary ring-offset-2" : ""}`}>
          <span className="text-lg font-bold">
            {entry.user_name.charAt(0).toUpperCase()}
          </span>
        </div>
        {entry.rank === 1 && (
          <Crown className="absolute -top-3 left-1/2 -translate-x-1/2 size-5 text-amber-500" />
        )}
        <div className={`absolute -bottom-1 left-1/2 -translate-x-1/2 flex size-6 items-center justify-center rounded-full bg-gradient-to-br ${cfg.medal} text-[11px] font-bold text-white shadow-sm`}>
          {entry.rank}
        </div>
      </div>
      <p className="text-sm font-semibold mt-1 text-center max-w-20 truncate">
        {entry.user_name}
        {isCurrentUser && <span className="block text-[10px] text-primary font-medium">You</span>}
      </p>
      <p className="text-lg font-bold tabular-nums mt-0.5">{entry.metric_value}</p>
      <div className={`w-16 ${cfg.height} mt-2 rounded-t-lg bg-gradient-to-t ${cfg.gradient}`} />
    </motion.div>
  );
}

export default function LeaderboardsPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabKey>("top_score");
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
    trackEvent("leaderboard_viewed");
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    const tab = TABS.find((t) => t.key === activeTab)!;

    const { data } = await supabase
      .from(tab.view)
      .select("*")
      .order("rank", { ascending: true })
      .limit(20);

    if (data) {
      setEntries(
        data.map((row: Record<string, unknown>) => ({
          user_id: row.user_id as string,
          user_name: row.user_name as string,
          rank: row.rank as number,
          metric_value: row[tab.metricField] as number | string,
          metric_label: tab.metricLabel,
        })),
      );
    } else {
      setEntries([]);
    }
    setLoading(false);
  }, [activeTab, supabase]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  useEffect(() => {
    const channel = supabase
      .channel("leaderboard-updates")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "scorecards" },
        () => {
          setTimeout(() => loadEntries(), 2000);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, loadEntries]);

  const daysLeft = getDaysUntilReset();
  const top3 = entries.filter((e) => e.rank <= 3);
  const rest = entries.filter((e) => e.rank > 3);

  return (
    <div className="space-y-6">
      <FadeIn>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">
              Leaderboards
            </h1>
            <p className="text-muted-foreground">
              See how you stack up against your team this week.
            </p>
          </div>
          <Badge variant="outline" className="gap-1.5 rounded-full px-3 py-1">
            <Clock className="size-3" />
            Resets in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
          </Badge>
        </div>
      </FadeIn>

      {/* Tabs */}
      <FadeIn delay={0.1}>
        <div className="flex gap-1 rounded-xl bg-muted/50 p-1">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {isActive && (
                  <motion.div
                    layoutId="leaderboard-tab"
                    className="absolute inset-0 rounded-lg bg-background shadow-sm"
                    transition={{ type: "spring", stiffness: 350, damping: 30 }}
                  />
                )}
                <Icon className="size-4 relative z-10" />
                <span className="relative z-10 hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
      </FadeIn>

      {/* Podium for top 3 */}
      {!loading && top3.length > 0 && (
        <FadeIn delay={0.15}>
          <Card className="overflow-hidden">
            <CardContent className="pt-8 pb-0">
              <div className="flex items-end justify-center gap-6">
                {top3.map((entry) => (
                  <PodiumCard
                    key={entry.user_id}
                    entry={entry}
                    isCurrentUser={entry.user_id === currentUserId}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      {/* Rest of leaderboard */}
      <FadeIn delay={0.2}>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">
              {TABS.find((t) => t.key === activeTab)?.label} Rankings
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading && (
              <div className="space-y-3 py-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-4 animate-pulse">
                    <div className="size-8 rounded-full bg-muted" />
                    <div className="h-4 w-32 rounded bg-muted" />
                    <div className="ml-auto h-4 w-12 rounded bg-muted" />
                  </div>
                ))}
              </div>
            )}

            {!loading && entries.length === 0 && (
              <div className="flex flex-col items-center py-12 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5">
                  <Trophy className="size-6 text-primary" />
                </div>
                <p className="font-medium">Not enough data yet</p>
                <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                  Need at least 3 users with sessions this week.
                </p>
              </div>
            )}

            {!loading && rest.length > 0 && (
              <StaggerContainer className="space-y-1.5">
                {rest.map((entry) => {
                  const isCurrentUser = entry.user_id === currentUserId;
                  return (
                    <StaggerItem key={entry.user_id}>
                      <div
                        className={`flex items-center gap-4 rounded-xl px-3.5 py-3 transition-colors ${
                          isCurrentUser
                            ? "bg-primary/5 border border-primary/15"
                            : "hover:bg-muted/50"
                        }`}
                      >
                        <span className="flex size-7 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums">
                          {entry.rank}
                        </span>
                        <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary/12 to-primary/5 text-sm font-semibold text-primary">
                          {entry.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">
                            {entry.user_name}
                            {isCurrentUser && (
                              <span className="ml-2 text-xs text-primary font-medium">
                                (You)
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold tabular-nums">{entry.metric_value}</p>
                          <p className="text-[11px] text-muted-foreground">
                            {entry.metric_label}
                          </p>
                        </div>
                      </div>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>
            )}
          </CardContent>
        </Card>
      </FadeIn>
    </div>
  );
}
