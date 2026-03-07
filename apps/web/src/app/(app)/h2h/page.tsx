"use client";

import { useEffect, useState, useCallback } from "react";
import { Swords, Clock, Trophy, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/posthog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface H2HMatch {
  id: string;
  challenger_id: string;
  opponent_id: string;
  challenger: { name: string } | null;
  opponent: { name: string } | null;
  status: string;
  challenger_score: number | null;
  opponent_score: number | null;
  winner_id: string | null;
  deadline: string;
  created_at: string;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "Waiting",
  challenger_completed: "Your Turn",
  opponent_completed: "Their Turn",
  scored: "Completed",
};

export default function H2HPage() {
  const supabase = createClient();
  const [matches, setMatches] = useState<H2HMatch[]>([]);
  const [userId, setUserId] = useState<string>("");

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user.id) setUserId(session.user.id);
    return { Authorization: `Bearer ${session?.access_token}` };
  }, [supabase]);

  const fetchMatches = useCallback(async () => {
    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/h2h`, { headers });
    if (res.ok) setMatches(await res.json());
  }, [getHeaders]);

  useEffect(() => {
    fetchMatches();
    trackEvent("h2h_page_viewed");
  }, [fetchMatches]);

  const getStatusBadge = (match: H2HMatch) => {
    if (match.status === "scored") {
      const isWinner = match.winner_id === userId;
      return (
        <Badge variant={isWinner ? "default" : "secondary"}>
          {isWinner ? "Won" : "Lost"}
        </Badge>
      );
    }

    const needsAction =
      (match.status === "pending" && match.challenger_id === userId) ||
      (match.status === "challenger_completed" && match.opponent_id === userId) ||
      (match.status === "opponent_completed" && match.challenger_id === userId);

    return (
      <Badge variant={needsAction ? "default" : "outline"}>
        {needsAction ? "Your Turn" : STATUS_LABELS[match.status] ?? match.status}
      </Badge>
    );
  };

  const activeMatches = matches.filter((m) => m.status !== "scored");
  const completedMatches = matches.filter((m) => m.status === "scored");

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Swords className="size-6" />
            Head-to-Head
          </h1>
          <p className="text-muted-foreground">
            Challenge teammates to async skill battles.
          </p>
        </div>
      </div>

      {/* Active matches */}
      {activeMatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Active Challenges</h2>
          {activeMatches.map((match) => (
            <Card key={match.id}>
              <CardContent className="flex items-center gap-4 pt-6">
                <Swords className="size-8 text-primary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {match.challenger?.name ?? "Challenger"} vs {match.opponent?.name ?? "Opponent"}
                  </p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground mt-1">
                    <Clock className="size-3" />
                    <span>
                      Due {new Date(match.deadline).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                {getStatusBadge(match)}
                <Button size="sm" variant="outline">
                  View
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Completed matches */}
      {completedMatches.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-medium">Completed</h2>
          {completedMatches.map((match) => (
            <Card key={match.id} className="opacity-80">
              <CardContent className="flex items-center gap-4 pt-6">
                <Trophy className="size-8 text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="font-medium">
                    {match.challenger?.name ?? "Challenger"}{" "}
                    <span className="text-muted-foreground">
                      ({match.challenger_score ?? "-"})
                    </span>{" "}
                    vs{" "}
                    {match.opponent?.name ?? "Opponent"}{" "}
                    <span className="text-muted-foreground">
                      ({match.opponent_score ?? "-"})
                    </span>
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(match.created_at).toLocaleDateString()}
                  </p>
                </div>
                {getStatusBadge(match)}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {matches.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Swords className="size-8 text-primary" />
            </div>
            <p className="text-lg font-medium">No Challenges Yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Challenge a teammate to a head-to-head skill battle. You'll both tackle
              the same scenario, and the AI scores determine the winner.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
