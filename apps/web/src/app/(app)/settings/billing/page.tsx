"use client";

import { useTrialStatus } from "@/hooks/use-trial-status";
import Link from "next/link";

export default function BillingSettingsPage() {
  const { isTrialActive, daysRemaining, sessionsRemaining, isLoading } =
    useTrialStatus();

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

        <div className="space-y-4">
          <a
            href="/api/billing/portal"
            className="inline-block rounded-md border border-input bg-background px-6 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground"
          >
            Manage via Stripe Portal
          </a>

          <p className="text-xs text-muted-foreground">
            Access your Stripe customer portal to update payment methods, view
            invoices, and manage your subscription.
          </p>
        </div>
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
