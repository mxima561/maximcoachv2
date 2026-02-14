"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";
import { Clock, Trophy, Users, Target } from "lucide-react";
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
  reward: string | null;
  scenario_constraints: string[] | null;
  entries: ChallengeEntry[];
}

export default function ChallengeDashboardPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const supabase = createClient();
  const [challenge, setChallenge] = useState<Challenge | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

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

      const { data: entries } = await supabase
        .from("challenge_entries")
        .select("*, users(name)")
        .eq("challenge_id", id)
        .order("progress", { ascending: false });

      setChallenge({ ...challengeData, entries: entries ?? [] });
      setLoading(false);
    }
    load();
  }, [id]);

  async function handleJoin() {
    if (!currentUserId || !challenge) return;
    setJoining(true);

    const { data, error } = await supabase
      .from("challenge_entries")
      .insert({
        challenge_id: challenge.id,
        user_id: currentUserId,
        progress: 0,
        completed: false,
      })
      .select("id, user_id, progress, completed")
      .single();

    if (!error && data) {
      const { data: userData } = await supabase
        .from("users")
        .select("name")
        .eq("id", currentUserId)
        .single();

      setChallenge({
        ...challenge,
        entries: [
          ...challenge.entries,
          { ...data, users: userData ?? { name: "You" } },
        ],
      });
    }
    setJoining(false);
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

  const endTime = new Date(challenge.end_date).getTime();
  const now = Date.now();
  const remaining = Math.max(0, endTime - now);
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24));
  const hours = Math.floor(
    (remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60),
  );
  const isEnded = remaining <= 0;
  const hasJoined = challenge.entries.some(
    (e) => e.user_id === currentUserId,
  );
  const completedCount = challenge.entries.filter((e) => e.completed).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {challenge.title}
          </h1>
          <p className="text-muted-foreground">{challenge.description}</p>
        </div>
        <Badge variant={isEnded ? "secondary" : "default"}>
          {isEnded ? "Ended" : "Active"}
        </Badge>
      </div>

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Clock className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Time Left</p>
              <p className="text-lg font-semibold">
                {isEnded ? "Ended" : `${days}d ${hours}h`}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Users className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Participants</p>
              <p className="text-lg font-semibold">
                {challenge.entries.length}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Target className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Goal</p>
              <p className="text-lg font-semibold">{challenge.goal_value}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 pt-6">
            <Trophy className="size-5 text-muted-foreground" />
            <div>
              <p className="text-sm text-muted-foreground">Completed</p>
              <p className="text-lg font-semibold">
                {completedCount}/{challenge.entries.length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Reward */}
      {challenge.reward && (
        <Card className="border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950">
          <CardContent className="flex items-center gap-3 pt-6">
            <Trophy className="size-5 text-amber-600" />
            <div>
              <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                Reward
              </p>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                {challenge.reward}
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Join button */}
      {!hasJoined && !isEnded && (
        <Button onClick={handleJoin} disabled={joining} className="w-full">
          {joining ? "Joining..." : "Join Challenge"}
        </Button>
      )}

      {/* Results link */}
      {isEnded && (
        <Button asChild variant="outline" className="w-full">
          <Link href={`/challenges/${id}/results`}>View Results</Link>
        </Button>
      )}

      {/* Participants table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Rankings</CardTitle>
        </CardHeader>
        <CardContent>
          {challenge.entries.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              No participants yet. Be the first to join!
            </p>
          ) : (
            <div className="space-y-2">
              {challenge.entries.map((entry, idx) => {
                const isCurrentUser = entry.user_id === currentUserId;
                const pct = Math.min(
                  100,
                  Math.round((entry.progress / challenge.goal_value) * 100),
                );
                return (
                  <div
                    key={entry.id}
                    className={`flex items-center gap-4 rounded-lg border p-3 ${
                      isCurrentUser ? "border-primary bg-primary/5" : ""
                    }`}
                  >
                    <span className="flex size-7 items-center justify-center rounded-full bg-muted text-sm font-medium">
                      {idx + 1}
                    </span>
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {(entry.users?.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium">
                          {entry.users?.name ?? "Unknown"}
                          {isCurrentUser && (
                            <span className="ml-2 text-xs text-primary">
                              (You)
                            </span>
                          )}
                        </p>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold">
                            {entry.progress}/{challenge.goal_value}
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
                      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className={`h-full rounded-full transition-all ${
                            entry.completed ? "bg-green-500" : "bg-primary"
                          }`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <p className="text-right text-xs text-muted-foreground">
                        {pct}%
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
