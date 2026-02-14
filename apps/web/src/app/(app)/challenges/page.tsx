"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Plus, Trophy, Clock, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

interface Challenge {
  id: string;
  title: string;
  description: string;
  goal_type: string;
  goal_value: number;
  status: string;
  end_date: string;
  reward: string | null;
  challenge_entries: { count: number }[];
}

export default function ChallengesPage() {
  const supabase = createClient();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) return;

      const { data } = await supabase
        .from("challenges")
        .select("*, challenge_entries(count)")
        .eq("org_id", profile.org_id)
        .order("created_at", { ascending: false });

      setChallenges(data ?? []);
      setLoading(false);
    }
    load();
  }, []);

  function getTimeRemaining(endDate: string) {
    const diff = new Date(endDate).getTime() - Date.now();
    if (diff <= 0) return "Ended";
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    return `${days} day${days !== 1 ? "s" : ""} left`;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Challenges</h1>
          <p className="text-muted-foreground">
            Compete with your team to hit goals and earn rewards.
          </p>
        </div>
        <Button asChild>
          <Link href="/challenges/new">
            <Plus className="mr-2 size-4" />
            New Challenge
          </Link>
        </Button>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading...
        </p>
      )}

      {!loading && challenges.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <Trophy className="mx-auto mb-4 size-10 text-muted-foreground" />
            <p className="text-lg font-medium">No challenges yet</p>
            <p className="text-sm text-muted-foreground">
              Create one to get your team competing.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {challenges.map((c) => {
          const entryCount = c.challenge_entries?.[0]?.count ?? 0;
          return (
            <Link key={c.id} href={`/challenges/${c.id}`}>
              <Card className="transition-shadow hover:shadow-md">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">{c.title}</CardTitle>
                    <Badge
                      variant={
                        c.status === "active" ? "default" : "secondary"
                      }
                    >
                      {c.status}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  <p className="text-sm text-muted-foreground line-clamp-2">
                    {c.description}
                  </p>
                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Users className="size-3" />
                      {entryCount} joined
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="size-3" />
                      {getTimeRemaining(c.end_date)}
                    </span>
                    {c.reward && (
                      <span className="flex items-center gap-1">
                        <Trophy className="size-3" />
                        {c.reward}
                      </span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
