"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Trophy, Users, TrendingUp, Copy, Check, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface ChallengeEntry {
  id: string;
  user_id: string;
  progress: number;
  completed: boolean;
  users: { name: string } | null;
}

interface Challenge {
  id: string;
  title: string;
  description: string;
  goal_type: string;
  goal_value: number;
  status: string;
  end_date: string;
  created_at: string;
  reward: string | null;
  org_id: string;
}

export default function ChallengeResultsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [entries, setEntries] = useState<ChallengeEntry[]>([]);
  const [teamImprovement, setTeamImprovement] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function load() {
      const { data: challengeData } = await supabase
        .from("challenges")
        .select("*")
        .eq("id", id)
        .single();

      if (!challengeData) {
        setLoading(false);
        return;
      }

      setChallenge(challengeData);

      const { data: entryData } = await supabase
        .from("challenge_entries")
        .select("*, users(name)")
        .eq("challenge_id", id)
        .order("progress", { ascending: false });

      setEntries(entryData ?? []);

      // Compute team improvement: avg score during challenge vs prior period
      const challengeStart = new Date(challengeData.created_at);
      const challengeEnd = new Date(challengeData.end_date);
      const duration = challengeEnd.getTime() - challengeStart.getTime();
      const priorStart = new Date(challengeStart.getTime() - duration);

      const { data: duringScores } = await supabase
        .from("scorecards")
        .select("overall_score, sessions!inner(org_id, started_at)")
        .gte("sessions.started_at", challengeStart.toISOString())
        .lte("sessions.started_at", challengeEnd.toISOString())
        .eq("sessions.org_id", challengeData.org_id);

      const { data: priorScores } = await supabase
        .from("scorecards")
        .select("overall_score, sessions!inner(org_id, started_at)")
        .gte("sessions.started_at", priorStart.toISOString())
        .lt("sessions.started_at", challengeStart.toISOString())
        .eq("sessions.org_id", challengeData.org_id);

      if (duringScores?.length && priorScores?.length) {
        const avgDuring =
          duringScores.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) /
          duringScores.length;
        const avgPrior =
          priorScores.reduce((sum, s) => sum + (s.overall_score ?? 0), 0) /
          priorScores.length;
        setTeamImprovement(Math.round(avgDuring - avgPrior));
      }

      setLoading(false);
    }
    load();
  }, [id]);

  async function handleCopyResults() {
    if (!challenge) return;
    const winner = entries[0];
    const completedCount = entries.filter((e) => e.completed).length;
    const completionRate =
      entries.length > 0
        ? Math.round((completedCount / entries.length) * 100)
        : 0;

    const summary = [
      `Challenge Results: ${challenge.title}`,
      `Winner: ${winner?.users?.name ?? "N/A"} (${winner?.progress ?? 0}/${challenge.goal_value})`,
      `Participants: ${entries.length} | Completed: ${completedCount} (${completionRate}%)`,
      teamImprovement !== null
        ? `Team Improvement: ${teamImprovement > 0 ? "+" : ""}${teamImprovement} points`
        : "",
      challenge.reward ? `Reward: ${challenge.reward}` : "",
    ]
      .filter(Boolean)
      .join("\n");

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

  if (!challenge) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Challenge not found.
      </p>
    );
  }

  const winner = entries[0];
  const completedCount = entries.filter((e) => e.completed).length;
  const completionRate =
    entries.length > 0
      ? Math.round((completedCount / entries.length) * 100)
      : 0;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/challenges/${id}`}>
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Challenge Results
        </h1>
        <p className="text-muted-foreground">{challenge.title}</p>
      </div>

      {/* Winner announcement */}
      {winner && (
        <Card className="border-amber-300 bg-gradient-to-br from-amber-50 to-yellow-50 dark:border-amber-800 dark:from-amber-950 dark:to-yellow-950">
          <CardContent className="flex flex-col items-center gap-3 py-8">
            <Trophy className="size-10 text-amber-500" />
            <div className="flex size-16 items-center justify-center rounded-full bg-amber-100 text-2xl font-bold text-amber-700 dark:bg-amber-900 dark:text-amber-300">
              {(winner.users?.name ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="text-center">
              <p className="text-lg font-semibold">
                {winner.users?.name ?? "Unknown"}
              </p>
              <p className="text-sm text-muted-foreground">
                {winner.progress}/{challenge.goal_value} completed
              </p>
            </div>
            {challenge.reward && (
              <Badge className="bg-amber-600 text-sm">
                {challenge.reward}
              </Badge>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6">
            <Users className="mb-1 size-5 text-muted-foreground" />
            <p className="text-2xl font-bold">{entries.length}</p>
            <p className="text-sm text-muted-foreground">Total Joined</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6">
            <Trophy className="mb-1 size-5 text-muted-foreground" />
            <p className="text-2xl font-bold">
              {completedCount}{" "}
              <span className="text-base font-normal text-muted-foreground">
                ({completionRate}%)
              </span>
            </p>
            <p className="text-sm text-muted-foreground">Completed</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex flex-col items-center gap-1 pt-6">
            <TrendingUp className="mb-1 size-5 text-muted-foreground" />
            <p className="text-2xl font-bold">
              {teamImprovement !== null
                ? `${teamImprovement > 0 ? "+" : ""}${teamImprovement}`
                : "—"}
            </p>
            <p className="text-sm text-muted-foreground">
              Team Score Change
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Full leaderboard */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Final Leaderboard</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {entries.map((entry, idx) => {
              const pct = Math.min(
                100,
                Math.round((entry.progress / challenge.goal_value) * 100),
              );
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-4 rounded-lg border p-3"
                >
                  <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
                    {idx + 1}
                  </span>
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {(entry.users?.name ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">
                      {entry.users?.name ?? "Unknown"}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold">
                      {entry.progress}/{challenge.goal_value}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      ({pct}%)
                    </span>
                    {entry.completed && (
                      <Badge
                        variant="default"
                        className="bg-green-600 text-xs"
                      >
                        Done
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Share */}
      <Button
        onClick={handleCopyResults}
        variant="outline"
        className="w-full"
      >
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
    </div>
  );
}
