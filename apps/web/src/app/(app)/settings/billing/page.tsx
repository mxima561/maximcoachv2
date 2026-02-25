"use client";

import { useTrialStatus } from "@/hooks/use-trial-status";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

export default function BillingSettingsPage() {
  const { isTrialActive, daysRemaining, sessionsRemaining, isLoading, orgId } =
    useTrialStatus();
  const supabase = createClient();

  const handleUpgradeClick = async () => {
    if (!orgId) {
      window.location.href = "/pricing";
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      await fetch(`${apiUrl}/track-upgrade-click`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          source: "billing_page",
        }),
      });
    } catch (err) {
      console.error("Failed to track upgrade click:", err);
    }

    window.location.href = "/pricing";
  };

  const handleOpenPortal = async () => {
    if (!orgId) {
      alert("Organization not found.");
      return;
    }

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/billing/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          org_id: orgId,
          return_url: window.location.href,
        }),
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "");
        throw new Error(errorText || "Failed to open billing portal");
      }

      const data = (await res.json()) as { url?: string };
      if (!data.url) throw new Error("Missing portal URL");

      window.location.href = data.url;
    } catch (err) {
      console.error("Failed to open billing portal:", err);
      alert("Unable to open billing portal. Please try again.");
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-64 rounded bg-muted"></div>
          <div className="h-48 rounded-lg bg-muted"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <h1 className="mb-8 text-3xl font-bold">Billing Settings</h1>

      {isTrialActive && (
        <div className="mb-8 rounded-lg border border-blue-300 bg-blue-50 p-6 dark:border-blue-900 dark:bg-blue-950">
          <h2 className="mb-4 text-xl font-semibold">Trial Status</h2>

          <div className="mb-6 space-y-4">
            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Days Remaining
                </span>
                <span className="text-2xl font-bold">{daysRemaining}</span>
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">
                  Sessions Remaining
                </span>
                <span className="text-2xl font-bold">
                  {sessionsRemaining} / 5
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-gray-200 dark:bg-gray-700">
                <div
                  className="h-2 rounded-full bg-blue-600 transition-all"
                  style={{ width: `${(sessionsRemaining / 5) * 100}%` }}
                />
              </div>
            </div>
          </div>

          <Link
            href="/pricing"
            className="inline-block rounded-md bg-primary px-6 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            onClick={(event) => {
              event.preventDefault();
              void handleUpgradeClick();
            }}
          >
            Upgrade Now
          </Link>
        </div>
      )}

      <div className="rounded-lg border p-6">
        <h2 className="mb-4 text-xl font-semibold">Manage Subscription</h2>

        {!isTrialActive && (
          <div className="mb-4">
            <p className="mb-2 text-sm text-muted-foreground">
              Current Plan: <span className="font-medium">Active Subscription</span>
            </p>
          </div>
        )}

        {!isTrialActive ? (
          <div className="space-y-4">
            <button
              type="button"
              onClick={handleOpenPortal}
              className="inline-block rounded-md border border-input bg-background px-6 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
            >
              Manage via Stripe Portal
            </button>

            <p className="text-xs text-muted-foreground">
              Access your Stripe customer portal to update payment methods, view
              invoices, and manage your subscription.
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Portal access unlocks after you upgrade to a paid plan.
          </p>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-amber-300 bg-amber-50 p-6 dark:border-amber-900 dark:bg-amber-950">
        <h3 className="mb-2 text-sm font-semibold">Need Help?</h3>
        <p className="text-sm text-muted-foreground">
          Questions about billing or want to discuss enterprise options?{" "}
          <Link href="/contact" className="font-medium text-primary hover:underline">
            Contact our sales team
          </Link>
        </p>
      </div>
    </div>
  );
}
