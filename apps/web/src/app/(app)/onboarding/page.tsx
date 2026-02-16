"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in");
        setLoading(false);
        return;
      }

      const trialStartsAt = new Date();
      const trialEndsAt = new Date();
      trialEndsAt.setDate(trialEndsAt.getDate() + 14);

      const { data: org, error: orgError } = await supabase
        .from("organizations")
        .insert({
          name: orgName,
          plan: "trial",
          trial_starts_at: trialStartsAt.toISOString(),
          trial_ends_at: trialEndsAt.toISOString(),
          plan_updated_at: trialStartsAt.toISOString(),
        })
        .select()
        .single();

      if (orgError || !org) {
        setError(orgError?.message || "Failed to create organization");
        setLoading(false);
        return;
      }

      const { error: memberError } = await supabase
        .from("organization_users")
        .insert({
          organization_id: org.id,
          user_id: user.id,
          role: "admin",
        });

      if (memberError) {
        setError(memberError.message);
        setLoading(false);
        return;
      }

      await supabase.from("trial_events").insert({
        organization_id: org.id,
        event_type: "trial_started",
        metadata: {
          source: "onboarding",
          user_email: user.email,
          org_name: orgName,
        },
      });

      router.push("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-md space-y-6 p-6">
        <div className="text-center">
          <h1 className="text-3xl font-bold tracking-tight">
            Welcome to MaximaCoach
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start your 14-day free trial with 5 practice sessions
          </p>
        </div>

        <form onSubmit={handleCreateOrganization} className="space-y-4">
          <div>
            <label htmlFor="orgName" className="block text-sm font-medium">
              Organization name
            </label>
            <input
              id="orgName"
              type="text"
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="Acme Corp"
              required
              className="mt-1 block w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating organization..." : "Start free trial"}
          </button>
        </form>

        <div className="rounded-lg border bg-muted/50 p-4">
          <h3 className="mb-2 text-sm font-semibold">Trial includes:</h3>
          <ul className="space-y-1 text-sm text-muted-foreground">
            <li>✓ 14-day access</li>
            <li>✓ 5 practice sessions</li>
            <li>✓ AI-powered coaching</li>
            <li>✓ Performance analytics</li>
          </ul>
        </div>
      </div>
    </main>
  );
}
