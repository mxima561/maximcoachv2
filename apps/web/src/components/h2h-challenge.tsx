"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Swords, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

interface Teammate {
  id: string;
  name: string;
  avg_score: number;
}

interface H2HChallengeProps {
  sessionId: string;
  scenarioType: string;
}

export function H2HChallenge({ sessionId, scenarioType }: H2HChallengeProps) {
  const supabase = createClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [teammates, setTeammates] = useState<Teammate[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setCurrentUserId(user.id);

      const { data: orgUser } = await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!orgUser?.organization_id) return;

      const { data: orgUsers } = await supabase
        .from("organization_users")
        .select("user_id, users(name)")
        .eq("organization_id", orgUser.organization_id)
        .neq("user_id", user.id);

      if (!orgUsers) return;

      // Fetch avg scores
      const withScores: Teammate[] = [];
      for (const u of orgUsers) {
        const userId = u.user_id as string;
        const userRecord = Array.isArray(u.users) ? u.users[0] : u.users;
        const userName =
          (userRecord as { name?: string | null } | null)?.name ?? "Unknown";
        const { data: scores } = await supabase
          .from("scorecards")
          .select("overall_score")
          .eq("user_id", userId);

        const avg =
          scores && scores.length > 0
            ? Math.round(
                scores.reduce((s, sc) => s + (sc.overall_score ?? 0), 0) /
                  scores.length,
              )
            : 0;

        withScores.push({ id: userId, name: userName, avg_score: avg });
      }

      setTeammates(withScores.sort((a, b) => b.avg_score - a.avg_score));
    }
    if (open) load();
  }, [open]);

  async function handleChallenge() {
    if (!selectedId || !currentUserId) return;
    setSending(true);

    // Create deterministic persona seed for fairness
    const personaSeed = crypto.randomUUID();

    const deadline = new Date();
    deadline.setHours(deadline.getHours() + 48);

    const { data, error } = await supabase
      .from("h2h_matches")
      .insert({
        challenger_id: currentUserId,
        opponent_id: selectedId,
        scenario_type: scenarioType,
        persona_seed: personaSeed,
        challenger_session_id: sessionId,
        status: "challenger_completed",
        deadline: deadline.toISOString(),
      })
      .select("id")
      .single();

    if (!error && data) {
      setOpen(false);
      router.push(`/h2h/${data.id}`);
    }
    setSending(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Swords className="mr-2 size-4" />
        Challenge a Teammate
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Challenge a Teammate</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Choose an opponent. They&apos;ll have 48 hours to complete the same
              scenario with a matched persona.
            </p>

            <div className="max-h-64 space-y-2 overflow-y-auto">
              {teammates.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setSelectedId(t.id)}
                  className={`flex w-full items-center gap-3 rounded-lg border p-3 text-left transition-colors ${
                    selectedId === t.id
                      ? "border-primary bg-primary/5"
                      : "hover:border-primary/50"
                  }`}
                >
                  <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                    {t.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{t.name}</p>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-muted-foreground">
                    <Trophy className="size-3" />
                    {t.avg_score} avg
                  </div>
                </button>
              ))}
              {teammates.length === 0 && (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No teammates found.
                </p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleChallenge}
              disabled={!selectedId || sending}
            >
              {sending ? "Sending..." : "Send Challenge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
