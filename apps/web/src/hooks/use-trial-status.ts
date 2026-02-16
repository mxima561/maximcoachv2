"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type TrialStatus = {
  isTrialActive: boolean;
  daysRemaining: number;
  sessionsRemaining: number;
  canCreateSessions: boolean;
  isLoading: boolean;
  orgId: string | null;
};

export function useTrialStatus(): TrialStatus {
  const [status, setStatus] = useState<TrialStatus>({
    isTrialActive: false,
    daysRemaining: 0,
    sessionsRemaining: 0,
    canCreateSessions: true,
    isLoading: true,
    orgId: null,
  });

  const supabase = createClient();

  useEffect(() => {
    async function fetchTrialStatus() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setStatus({
            isTrialActive: false,
            daysRemaining: 0,
            sessionsRemaining: 0,
            canCreateSessions: false,
            isLoading: false,
            orgId: null,
          });
          return;
        }

        const { data: orgUsers } = await supabase
          .from("organization_users")
          .select("organization_id, role")
          .eq("user_id", user.id)
          .limit(1);

        if (!orgUsers || orgUsers.length === 0) {
          setStatus({
            isTrialActive: false,
            daysRemaining: 0,
            sessionsRemaining: 0,
            canCreateSessions: false,
            isLoading: false,
            orgId: null,
          });
          return;
        }

        const orgUser = orgUsers[0];

        const { data: org } = await supabase
          .from("organizations")
          .select("plan, trial_ends_at")
          .eq("id", orgUser.organization_id)
          .single();

        if (!org || org.plan !== "trial") {
          setStatus({
            isTrialActive: false,
            daysRemaining: 0,
            sessionsRemaining: 0,
            canCreateSessions: true,
            isLoading: false,
            orgId: null,
          });
          return;
        }

        const now = new Date();
        const trialEnd = new Date(org.trial_ends_at!);
        const daysRemaining = Math.max(
          0,
          Math.ceil((trialEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        );

        const { count } = await supabase
          .from("trial_sessions")
          .select("*", { count: "exact", head: true })
          .eq("organization_id", orgUser.organization_id);

        const sessionsRemaining = Math.max(0, 5 - (count || 0));
        const canCreateSessions =
          daysRemaining > 0 && sessionsRemaining > 0 && orgUser.role === "admin";

        setStatus({
          isTrialActive: true,
          daysRemaining,
          sessionsRemaining,
          canCreateSessions,
          isLoading: false,
          orgId: orgUser.organization_id,
        });
      } catch (error) {
        console.error("Error fetching trial status:", error);
        setStatus({
          isTrialActive: false,
          daysRemaining: 0,
          sessionsRemaining: 0,
          canCreateSessions: false,
          isLoading: false,
        });
      }
    }

    fetchTrialStatus();

    const channel = supabase
      .channel("trial-status")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "organizations" },
        fetchTrialStatus
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trial_sessions" },
        fetchTrialStatus
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  return status;
}
