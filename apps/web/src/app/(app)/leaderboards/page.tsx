"use client";

import { useEffect, useState } from "react";
import { Trophy, TrendingUp, Target, Flame, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

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
  const day = now.getDay(); // 0=Sun
  return day === 0 ? 7 : 7 - day;
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="text-lg">🥇</span>;
  if (rank === 2) return <span className="text-lg">🥈</span>;
  if (rank === 3) return <span className="text-lg">🥉</span>;
  return (
    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
      {rank}
    </span>
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
  }, []);

  useEffect(() => {
    async function load() {
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
    }
    load();
  }, [activeTab]);

  const daysLeft = getDaysUntilReset();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Leaderboards
          </h1>
          <p className="text-muted-foreground">
            See how you stack up against your team this week.
          </p>
        </div>
        <Badge variant="outline" className="gap-1">
          <Clock className="size-3" />
          Resets in {daysLeft} day{daysLeft !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 border-b-2 px-4 py-2 text-sm font-medium transition-colors ${
                isActive
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon className="size-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Leaderboard list */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {TABS.find((t) => t.key === activeTab)?.label}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Loading...
            </p>
          )}

          {!loading && entries.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Not enough data yet. Need at least 3 users with sessions this
              week.
            </p>
          )}

          {!loading && entries.length > 0 && (
            <div className="space-y-2">
              {entries.map((entry) => {
                const isCurrentUser = entry.user_id === currentUserId;
                return (
                  <div
                    key={entry.user_id}
                    className={`flex items-center gap-4 rounded-lg border p-3 ${
                      isCurrentUser
                        ? "border-primary bg-primary/5"
                        : ""
                    }`}
                  >
                    <RankBadge rank={entry.rank} />
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {entry.user_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1">
                      <p className="font-medium">
                        {entry.user_name}
                        {isCurrentUser && (
                          <span className="ml-2 text-xs text-primary">
                            (You)
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-semibold">{entry.metric_value}</p>
                      <p className="text-xs text-muted-foreground">
                        {entry.metric_label}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
