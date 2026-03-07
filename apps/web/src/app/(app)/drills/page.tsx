"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Dumbbell, RefreshCw, PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DrillCard } from "@/components/drill-card";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/posthog";

interface PlanDrill {
  drill_id: string;
  title: string;
  skill_category: string;
  difficulty: number;
  status: "pending" | "completed";
  completed_at: string | null;
  xp_earned: number;
}

interface DailyPlan {
  id: string;
  plan_date: string;
  status: string;
  drills: PlanDrill[];
}

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function DrillsPage() {
  const supabase = createClient();
  const [plan, setPlan] = useState<DailyPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [regenerating, setRegenerating] = useState(false);

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return { Authorization: `Bearer ${session?.access_token}` };
  }, [supabase]);

  const fetchPlan = useCallback(async () => {
    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/daily-plans/today`, { headers });
    if (res.ok) {
      setPlan(await res.json());
    }
    setLoading(false);
  }, [getHeaders]);

  useEffect(() => {
    fetchPlan();
    trackEvent("drills_page_viewed");
  }, [fetchPlan]);

  const handleRegenerate = async () => {
    setRegenerating(true);
    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/daily-plans/generate`, {
      method: "POST",
      headers,
    });
    if (res.ok) {
      setPlan(await res.json());
    }
    setRegenerating(false);
  };

  const handleCompleteDrill = async (index: number) => {
    if (!plan) return;
    const headers = await getHeaders();
    const res = await fetch(
      `${API_URL}/api/daily-plans/${plan.id}/drills/${index}/complete`,
      { method: "PATCH", headers },
    );
    if (res.ok) {
      const result = await res.json();
      trackEvent("drill_completed", { drill_index: index, xp_earned: result.xp_earned });
      // Update local state
      setPlan((prev) => {
        if (!prev) return prev;
        const updated = { ...prev };
        const drills = [...updated.drills];
        drills[index] = { ...drills[index], status: "completed", xp_earned: result.xp_earned };
        updated.drills = drills;
        updated.status = result.plan_status;
        return updated;
      });
    }
  };

  const completedCount = plan?.drills.filter((d) => d.status === "completed").length ?? 0;
  const totalCount = plan?.drills.length ?? 0;
  const allDone = plan?.status === "completed";

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full size-8 border-b-2 border-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <Dumbbell className="size-6" />
            Today's Training
          </h1>
          <p className="text-muted-foreground">
            {allDone
              ? "Great work! You've completed all drills for today."
              : `Complete ${totalCount} targeted drills to build your skills.`}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={handleRegenerate} disabled={regenerating}>
          <RefreshCw className={`mr-1 size-4 ${regenerating ? "animate-spin" : ""}`} />
          New Plan
        </Button>
      </div>

      {/* Progress bar */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="font-medium">Daily Progress</span>
            <span className="text-muted-foreground">{completedCount}/{totalCount} drills</span>
          </div>
          <div className="h-3 w-full overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-gradient-to-r from-primary to-primary/80 transition-all duration-500"
              style={{ width: `${totalCount > 0 ? (completedCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* Completion celebration */}
      {allDone && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="flex items-center gap-4 pt-6">
            <PartyPopper className="size-10 text-primary" />
            <div>
              <p className="font-semibold text-lg">All Drills Complete!</p>
              <p className="text-muted-foreground">
                You earned {plan?.drills.reduce((sum, d) => sum + (d.xp_earned || 50), 0)} XP today.
                Come back tomorrow for fresh challenges.
              </p>
            </div>
            <Button asChild className="ml-auto">
              <Link href="/simulations/new">Start Simulation</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Drill cards */}
      {plan && (
        <div className="space-y-3">
          {plan.drills.map((drill, index) => (
            <DrillCard
              key={drill.drill_id}
              title={drill.title}
              skillCategory={drill.skill_category}
              difficulty={drill.difficulty}
              status={drill.status}
              xpReward={50}
              onComplete={() => handleCompleteDrill(index)}
              onStart={() => handleCompleteDrill(index)}
            />
          ))}
        </div>
      )}

      {!plan && (
        <Card>
          <CardContent className="flex flex-col items-center py-12 text-center">
            <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
              <Dumbbell className="size-8 text-primary" />
            </div>
            <p className="text-lg font-medium">No Training Plan Yet</p>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Generate a personalized training plan based on your recent performance.
              We'll pick drills targeting your weakest skills.
            </p>
            <Button className="mt-4" onClick={handleRegenerate} disabled={regenerating}>
              <RefreshCw className={`mr-1 size-4 ${regenerating ? "animate-spin" : ""}`} />
              Generate My Plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
