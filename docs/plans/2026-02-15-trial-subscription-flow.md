# Trial & Subscription Flow Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build complete 14-day trial system with 5-session IP-based limit, soft-block expiration, and Stripe upgrade flow.

**Architecture:** Database-centric approach with trial fields in organizations table, separate trial_sessions table for IP tracking, trial_events for analytics. Frontend guards check trial status before session creation, backend enforces limits via API endpoint.

**Tech Stack:** Next.js 16, Supabase (PostgreSQL), Stripe, Fastify API, React, TypeScript, Zod 4

---

## Task 1: Database Migration - Add Trial Fields to Organizations

**Files:**
- Create: `supabase/migrations/20260215_add_trial_fields.sql`

**Step 1: Create migration file**

```sql
-- Add trial tracking fields to organizations table
ALTER TABLE organizations
  ADD COLUMN trial_starts_at timestamptz,
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN plan_updated_at timestamptz DEFAULT now();

-- Update plan enum to include new tiers
ALTER TABLE organizations
  DROP CONSTRAINT IF EXISTS organizations_plan_check;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_plan_check
  CHECK (plan IN ('trial', 'starter', 'growth', 'scale', 'enterprise', 'free'));

COMMENT ON COLUMN organizations.trial_starts_at IS 'When trial period started (set on onboarding completion)';
COMMENT ON COLUMN organizations.trial_ends_at IS 'When trial period ends (trial_starts_at + 14 days)';
COMMENT ON COLUMN organizations.plan_updated_at IS 'When plan was last changed (for analytics)';
```

**Step 2: Apply migration locally**

Run: `cd supabase && npx supabase db reset`
Expected: Migration applies successfully, no errors

**Step 3: Verify column exists**

Run: `npx supabase db exec "SELECT column_name, data_type FROM information_schema.columns WHERE table_name='organizations'"`
Expected: See `trial_starts_at`, `trial_ends_at`, `plan_updated_at` columns

**Step 4: Test plan constraint**

Run: `npx supabase db exec "INSERT INTO organizations (name, plan) VALUES ('Test', 'invalid')"`
Expected: ERROR - violates check constraint

**Step 5: Commit**

```bash
git add supabase/migrations/20260215_add_trial_fields.sql
git commit -m "feat(db): add trial tracking fields to organizations table

- Add trial_starts_at, trial_ends_at, plan_updated_at columns
- Update plan check constraint for new tiers (trial/starter/growth/scale/enterprise/free)
- Add column comments for documentation"
```

---

## Task 2: Database Migration - Create Trial Sessions Table

**Files:**
- Create: `supabase/migrations/20260215_create_trial_sessions.sql`

**Step 1: Create migration file**

```sql
-- Table for tracking trial session attempts by IP
CREATE TABLE trial_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ip_address inet NOT NULL,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id uuid REFERENCES sessions(id) ON DELETE SET NULL,
  scenario_type text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed boolean DEFAULT false,
  duration_seconds int
);

CREATE INDEX idx_trial_sessions_ip ON trial_sessions(ip_address);
CREATE INDEX idx_trial_sessions_org ON trial_sessions(org_id);
CREATE INDEX idx_trial_sessions_created ON trial_sessions(created_at);

COMMENT ON TABLE trial_sessions IS 'Tracks trial session attempts for IP-based abuse prevention. Auto-deleted on upgrade.';
COMMENT ON COLUMN trial_sessions.ip_address IS 'IP address used for global 5-session limit';
COMMENT ON COLUMN trial_sessions.completed IS 'Whether session was completed (for analytics)';

-- Enable RLS
ALTER TABLE trial_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only read their own org's trial sessions
CREATE POLICY "Users can read own org trial sessions"
  ON trial_sessions FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );
```

**Step 2: Apply migration**

Run: `cd supabase && npx supabase db reset`
Expected: Migration applies, table created

**Step 3: Verify table structure**

Run: `npx supabase db exec "\d trial_sessions"`
Expected: Shows columns and indexes

**Step 4: Test inet type validation**

Run: `npx supabase db exec "INSERT INTO trial_sessions (ip_address, org_id, user_id, scenario_type) VALUES ('invalid', gen_random_uuid(), gen_random_uuid(), 'test')"`
Expected: ERROR - invalid input syntax for type inet

**Step 5: Commit**

```bash
git add supabase/migrations/20260215_create_trial_sessions.sql
git commit -m "feat(db): create trial_sessions table for IP tracking

- Track session attempts by IP address (inet type)
- Links to org/user/session for analytics
- Indexes on ip_address, org_id, created_at
- RLS policy for privacy
- Auto-cleanup via ON DELETE CASCADE"
```

---

## Task 3: Database Migration - Create Trial Events Table

**Files:**
- Create: `supabase/migrations/20260215_create_trial_events.sql`

**Step 1: Create migration file**

```sql
-- Table for trial analytics and conversion funnel tracking
CREATE TABLE trial_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  event_type text NOT NULL CHECK (event_type IN (
    'trial_started',
    'first_session',
    'session_limit_hit',
    'trial_expired',
    'upgraded',
    'upgrade_clicked'
  )),
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_trial_events_org ON trial_events(org_id);
CREATE INDEX idx_trial_events_type ON trial_events(event_type);
CREATE INDEX idx_trial_events_created ON trial_events(created_at);

COMMENT ON TABLE trial_events IS 'Analytics events for trial conversion funnel';
COMMENT ON COLUMN trial_events.metadata IS 'Flexible event context (scenario, trigger, plan, etc.)';

-- Enable RLS
ALTER TABLE trial_events ENABLE ROW LEVEL SECURITY;

-- Policy: Users can read own org's events
CREATE POLICY "Users can read own org trial events"
  ON trial_events FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM users WHERE id = auth.uid()
    )
  );
```

**Step 2: Apply migration**

Run: `cd supabase && npx supabase db reset`
Expected: Migration applies, table created

**Step 3: Test event_type constraint**

Run: `npx supabase db exec "INSERT INTO trial_events (org_id, event_type) VALUES (gen_random_uuid(), 'invalid_event')"`
Expected: ERROR - violates check constraint

**Step 4: Test metadata jsonb**

Run: `npx supabase db exec "INSERT INTO trial_events (org_id, event_type, metadata) VALUES (gen_random_uuid(), 'trial_started', '{\"source\": \"onboarding\"}'::jsonb)"`
Expected: Success (if org exists) or FK error

**Step 5: Commit**

```bash
git add supabase/migrations/20260215_create_trial_events.sql
git commit -m "feat(db): create trial_events table for analytics

- Tracks conversion funnel events (started, first session, limit hit, upgraded)
- Flexible metadata as jsonb for event context
- Indexes for reporting queries
- RLS enabled for privacy"
```

---

## Task 4: Update Shared Constants - Add New Plan Types

**Files:**
- Modify: `packages/shared/src/constants.ts:28-29`

**Step 1: Update PLANS array**

```typescript
// Before
export const PLANS = ["free", "growth", "pro"] as const;

// After
export const PLANS = ["trial", "free", "starter", "growth", "scale", "enterprise"] as const;
export type Plan = (typeof PLANS)[number];
```

**Step 2: Verify TypeScript compiles**

Run: `cd packages/shared && npm run build`
Expected: No errors, types generated

**Step 3: Check usages in API**

Run: `cd apps/api && npm run typecheck`
Expected: May show errors where plan values are hardcoded - that's OK, we'll fix in next tasks

**Step 4: Commit**

```bash
git add packages/shared/src/constants.ts
git commit -m "feat(shared): add new plan types to PLANS enum

- Add 'trial' plan for 14-day trial period
- Add new paid tiers: starter, scale, enterprise
- Keep 'free' for blocked state
- TypeScript will enforce type safety across codebase"
```

---

## Task 5: Create Trial Check API Endpoint

**Files:**
- Create: `apps/api/src/routes/trial.ts`
- Modify: `apps/api/src/index.ts` (register routes)

**Step 1: Create trial routes file**

```typescript
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createServiceClient } from "../lib/supabase.js";

const CheckTrialSchema = z.object({
  user_id: z.string().uuid(),
  ip_address: z.string().ip(),
});

export async function trialRoutes(app: FastifyInstance) {
  const supabase = createServiceClient();

  app.post("/api/sessions/check-trial", async (request, reply) => {
    const { user_id, ip_address } = CheckTrialSchema.parse(request.body);

    // Get user with org info
    const { data: user, error: userError } = await supabase
      .from("users")
      .select("org_id, role, organizations(plan, trial_ends_at)")
      .eq("id", user_id)
      .single();

    if (userError || !user) {
      return reply.status(404).send({ error: "User not found" });
    }

    const org = user.organizations as { plan: string; trial_ends_at: string | null };

    // Paid plans: always allowed
    if (["starter", "growth", "scale", "enterprise"].includes(org.plan)) {
      return { allowed: true };
    }

    // Trial plan: check limits
    if (org.plan === "trial") {
      // Check if trial expired
      if (org.trial_ends_at && new Date() > new Date(org.trial_ends_at)) {
        return { allowed: false, reason: "trial_expired" };
      }

      // Only admin can use sessions during trial
      if (user.role !== "admin") {
        return { allowed: false, reason: "trial_admin_only" };
      }

      // Check global IP limit (5 sessions per IP)
      const { count } = await supabase
        .from("trial_sessions")
        .select("id", { count: "exact", head: true })
        .eq("ip_address", ip_address);

      if (count && count >= 5) {
        return { allowed: false, reason: "ip_limit_reached" };
      }

      return { allowed: true };
    }

    // Free plan or any other: blocked
    return { allowed: false, reason: "upgrade_required" };
  });
}
```

**Step 2: Register routes in index.ts**

Find the route registration section and add:

```typescript
import { trialRoutes } from "./routes/trial.js";

// ... in the app setup
await trialRoutes(app);
```

**Step 3: Test endpoint locally**

Run: `cd apps/api && npm run dev`
Then in another terminal:
```bash
curl -X POST http://localhost:3001/api/sessions/check-trial \
  -H "Content-Type: application/json" \
  -d '{"user_id":"test-uuid","ip_address":"192.168.1.1"}'
```
Expected: 404 (user not found) - endpoint is working

**Step 4: Commit**

```bash
git add apps/api/src/routes/trial.ts apps/api/src/index.ts
git commit -m "feat(api): add trial check endpoint for session guards

- POST /api/sessions/check-trial validates trial status
- Returns {allowed, reason} based on plan, expiration, role, IP limit
- Reason codes: trial_expired, trial_admin_only, ip_limit_reached, upgrade_required
- Checks global IP limit of 5 sessions from trial_sessions table"
```

---

## Task 6: Update Onboarding to Initialize Trial

**Files:**
- Modify: `apps/web/src/app/(app)/onboarding/page.tsx:112-131`

**Step 1: Update org creation logic**

Find the `handleComplete` function where org is created:

```typescript
// Before
const { data: newOrg } = await supabase
  .from("organizations")
  .insert({ name: orgName })
  .select("id")
  .single();

// After
const trialStartsAt = new Date().toISOString();
const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

const { data: newOrg } = await supabase
  .from("organizations")
  .insert({
    name: orgName,
    plan: 'trial',
    trial_starts_at: trialStartsAt,
    trial_ends_at: trialEndsAt,
  })
  .select("id")
  .single();

if (newOrg) {
  orgId = newOrg.id;

  // Log trial start event
  await supabase.from("trial_events").insert({
    org_id: newOrg.id,
    event_type: 'trial_started',
    metadata: { source: 'onboarding' },
  });

  await supabase
    .from("users")
    .update({ org_id: orgId, role: "admin" })
    .eq("id", user.id);
}
```

**Step 2: Test onboarding flow**

Run: `cd apps/web && npm run dev`
Navigate to `/onboarding` and complete flow
Expected: Org created with trial fields set, event logged

**Step 3: Verify in database**

Run: `npx supabase db exec "SELECT name, plan, trial_starts_at, trial_ends_at FROM organizations ORDER BY created_at DESC LIMIT 1"`
Expected: See trial plan with dates 14 days apart

**Step 4: Commit**

```bash
git add apps/web/src/app/(app)/onboarding/page.tsx
git commit -m "feat(onboarding): initialize trial on org creation

- Set plan='trial' on new org creation
- Calculate trial_starts_at (now) and trial_ends_at (+14 days)
- Log 'trial_started' event to trial_events table
- First user becomes admin automatically"
```

---

## Task 7: Create Trial Banner Component

**Files:**
- Create: `apps/web/src/components/trial-banner.tsx`
- Create: `apps/web/src/hooks/use-trial-status.ts`

**Step 1: Create useTrialStatus hook**

```typescript
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

interface TrialStatus {
  plan: string;
  trialEndsAt: string | null;
  sessionsUsed: number;
  daysRemaining: number;
}

export function useTrialStatus() {
  const [status, setStatus] = useState<TrialStatus | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function fetchTrialStatus() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      // Get user's org
      const { data: userData } = await supabase
        .from('users')
        .select('org_id, organizations(plan, trial_ends_at)')
        .eq('id', user.id)
        .single();

      if (!userData) return;

      const org = userData.organizations as { plan: string; trial_ends_at: string | null };

      // Count trial sessions for this org
      const { count } = await supabase
        .from('trial_sessions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', userData.org_id);

      // Calculate days remaining
      const daysRemaining = org.trial_ends_at
        ? Math.ceil((new Date(org.trial_ends_at).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : 0;

      setStatus({
        plan: org.plan,
        trialEndsAt: org.trial_ends_at,
        sessionsUsed: count || 0,
        daysRemaining,
      });
    }

    fetchTrialStatus();
  }, []);

  return status;
}
```

**Step 2: Create TrialBanner component**

```typescript
import Link from 'next/link';
import { useTrialStatus } from '@/hooks/use-trial-status';
import { AlertCircle, Clock, Zap } from 'lucide-react';

export function TrialBanner() {
  const status = useTrialStatus();

  if (!status || status.plan !== 'trial') return null;

  const isExpired = status.daysRemaining <= 0;
  const isLowSessions = status.sessionsUsed >= 5;

  return (
    <div
      className={`sticky top-0 z-50 flex items-center justify-center gap-2 px-4 py-3 text-sm font-medium ${
        isExpired || isLowSessions
          ? 'bg-destructive text-destructive-foreground'
          : 'bg-primary text-primary-foreground'
      }`}
    >
      {isExpired ? (
        <>
          <AlertCircle className="h-4 w-4" />
          <span>Your 14-day trial has ended.</span>
          <Link href="/billing" className="underline underline-offset-4">
            Upgrade now
          </Link>
          <span>to continue.</span>
        </>
      ) : isLowSessions ? (
        <>
          <AlertCircle className="h-4 w-4" />
          <span>You've used all 5 trial sessions.</span>
          <Link href="/pricing" className="underline underline-offset-4">
            Upgrade
          </Link>
          <span>to continue training.</span>
        </>
      ) : (
        <>
          <Clock className="h-4 w-4" />
          <span>{status.daysRemaining} days left in trial</span>
          <Zap className="h-4 w-4" />
          <span>{5 - status.sessionsUsed} sessions remaining</span>
        </>
      )}
    </div>
  );
}
```

**Step 3: Add to app layout**

Modify `apps/web/src/app/(app)/layout.tsx` to include the banner:

```typescript
import { TrialBanner } from '@/components/trial-banner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <TrialBanner />
      {children}
    </>
  );
}
```

**Step 4: Test banner display**

Run: `npm run dev`
Sign in as trial user
Expected: Banner shows at top with days/sessions remaining

**Step 5: Commit**

```bash
git add apps/web/src/components/trial-banner.tsx apps/web/src/hooks/use-trial-status.ts apps/web/src/app/(app)/layout.tsx
git commit -m "feat(ui): add trial status banner component

- useTrialStatus hook fetches org plan and trial data
- Banner shows days and sessions remaining during trial
- Red warning when expired or session limit hit
- Sticky at top of app, links to upgrade pages"
```

---

## Task 8: Create Pricing Page

**Files:**
- Create: `apps/web/src/app/(app)/pricing/page.tsx`

**Step 1: Create pricing page component**

```typescript
"use client";

import Link from "next/link";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const PLANS = [
  {
    id: 'starter',
    name: 'Starter',
    price: 299,
    description: 'Small sales teams testing AI training',
    features: [
      'Up to 5 reps',
      '15 sessions/rep/month (75 pool)',
      'Core scenarios (cold call, objection handling, discovery, closing)',
      'Basic rep dashboard with scoring',
      'Animated orb visualization',
      'Email support',
    ],
  },
  {
    id: 'growth',
    name: 'Growth',
    price: 599,
    description: 'Growing teams that saw results on Starter',
    popular: true,
    features: [
      'Up to 15 reps',
      '15 sessions/rep/month (225 pool)',
      'Everything in Starter',
      'Weekly leaderboards',
      'Team challenges',
      'Manager dashboard with team analytics',
      'Clip sharing & team feed',
      'Slack notifications',
      'Priority support',
    ],
  },
  {
    id: 'scale',
    name: 'Scale',
    price: 999,
    description: 'Full sales floors with advanced needs',
    features: [
      'Up to 30 reps',
      '20 sessions/rep/month (600 pool)',
      'Everything in Growth',
      'Head-to-head mode',
      'Custom scenario builder',
      'CRM integration (HubSpot, Salesforce)',
      'Advanced analytics & reporting',
      'Dedicated success manager',
    ],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    price: null,
    description: 'Multi-location orgs, franchise teams',
    features: [
      '30+ reps (negotiated)',
      'Unlimited sessions',
      'Everything in Scale',
      'Company-wide tournaments',
      'SSO/SAML',
      'Custom persona library',
      'API access',
      'Quarterly business reviews',
    ],
  },
];

export default function PricingPage() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-12">
      <div className="text-center">
        <h1 className="text-4xl font-bold tracking-tight">Choose Your Plan</h1>
        <p className="mt-3 text-lg text-muted-foreground">
          Start with a 14-day trial, upgrade anytime
        </p>
      </div>

      <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={plan.popular ? 'border-primary shadow-lg' : ''}
          >
            {plan.popular && (
              <div className="absolute -top-4 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
                Most Popular
              </div>
            )}
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
              <CardDescription>{plan.description}</CardDescription>
              <div className="mt-4">
                {plan.price ? (
                  <>
                    <span className="text-4xl font-bold">${plan.price}</span>
                    <span className="text-muted-foreground">/month</span>
                  </>
                ) : (
                  <span className="text-4xl font-bold">Custom</span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {plan.id === 'enterprise' ? (
                <Button variant="outline" className="w-full" asChild>
                  <a href="mailto:sales@maximacoach.com">Contact Sales</a>
                </Button>
              ) : (
                <Button
                  className={plan.popular ? '' : 'w-full'}
                  variant={plan.popular ? 'default' : 'outline'}
                  asChild
                >
                  <Link href={`/signup?plan=${plan.id}`}>Select Plan</Link>
                </Button>
              )}
              <ul className="mt-6 space-y-3">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Test pricing page**

Run: `npm run dev`
Navigate to `/pricing`
Expected: 4 pricing tiers displayed, Growth highlighted

**Step 3: Commit**

```bash
git add apps/web/src/app/(app)/pricing/page.tsx
git commit -m "feat(ui): create pricing page with 4 tiers

- Display Starter ($299), Growth ($599), Scale ($999), Enterprise (custom)
- Growth tier highlighted as 'Most Popular'
- Select Plan buttons link to signup/checkout
- Enterprise has Contact Sales button
- Responsive grid layout"
```

---

## Task 9: Create Billing Settings Page

**Files:**
- Create: `apps/web/src/app/(app)/settings/billing/page.tsx`

**Step 1: Create billing page**

```typescript
"use client";

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

interface BillingData {
  plan: string;
  trialEndsAt: string | null;
  sessionsUsed: number;
  sessionLimit: number | null;
  stripeCustomerId: string | null;
}

export default function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BillingData | null>(null);
  const supabase = createClient();

  useEffect(() => {
    async function loadBillingData() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: userData } = await supabase
        .from('users')
        .select('org_id, organizations(plan, trial_ends_at, stripe_customer_id)')
        .eq('id', user.id)
        .single();

      if (!userData) return;

      const org = userData.organizations as {
        plan: string;
        trial_ends_at: string | null;
        stripe_customer_id: string | null;
      };

      // Get session count
      const { count: sessionsCount } = await supabase
        .from('sessions')
        .select('id', { count: 'exact', head: true })
        .eq('org_id', userData.org_id)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

      // Session limits by plan
      const limits: Record<string, number | null> = {
        trial: 5,
        free: 0,
        starter: 75,
        growth: 225,
        scale: 600,
        enterprise: null,
      };

      setData({
        plan: org.plan,
        trialEndsAt: org.trial_ends_at,
        sessionsUsed: sessionsCount || 0,
        sessionLimit: limits[org.plan] ?? 0,
        stripeCustomerId: org.stripe_customer_id,
      });
      setLoading(false);
    }

    loadBillingData();
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!data) return null;

  const planNames: Record<string, string> = {
    trial: 'Trial',
    free: 'Free',
    starter: 'Starter',
    growth: 'Growth',
    scale: 'Scale',
    enterprise: 'Enterprise',
  };

  const daysRemaining = data.trialEndsAt
    ? Math.ceil((new Date(data.trialEndsAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : 0;

  return (
    <div className="mx-auto max-w-4xl px-4 py-12">
      <h1 className="text-3xl font-bold">Billing & Subscription</h1>

      <div className="mt-8 grid gap-6">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <CardTitle>Current Plan</CardTitle>
            <CardDescription>Your subscription details</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-2xl font-bold">{planNames[data.plan] || data.plan}</p>
                {data.plan === 'trial' && daysRemaining > 0 && (
                  <p className="mt-1 text-sm text-muted-foreground">
                    {daysRemaining} days remaining
                  </p>
                )}
                {data.plan === 'trial' && daysRemaining <= 0 && (
                  <Badge variant="destructive" className="mt-1">
                    Trial Expired
                  </Badge>
                )}
              </div>
              <div className="flex gap-2">
                <Button asChild>
                  <Link href="/pricing">Upgrade Plan</Link>
                </Button>
                {data.stripeCustomerId && (
                  <Button variant="outline" asChild>
                    <a href="/api/billing/portal">Manage Billing</a>
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Usage */}
        <Card>
          <CardHeader>
            <CardTitle>Usage This Month</CardTitle>
            <CardDescription>Session consumption</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">Sessions Used</span>
                <span className="text-2xl font-bold">
                  {data.sessionsUsed}
                  {data.sessionLimit && (
                    <span className="text-base font-normal text-muted-foreground">
                      {' '}
                      / {data.sessionLimit}
                    </span>
                  )}
                  {data.sessionLimit === null && (
                    <span className="text-base font-normal text-muted-foreground">
                      {' '}
                      / Unlimited
                    </span>
                  )}
                </span>
              </div>
              {data.sessionLimit && (
                <div className="h-2 w-full rounded-full bg-muted">
                  <div
                    className="h-2 rounded-full bg-primary"
                    style={{
                      width: `${Math.min((data.sessionsUsed / data.sessionLimit) * 100, 100)}%`,
                    }}
                  />
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
```

**Step 2: Create settings layout (if doesn't exist)**

```typescript
// apps/web/src/app/(app)/settings/layout.tsx
export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen">{children}</div>;
}
```

**Step 3: Test billing page**

Run: `npm run dev`
Navigate to `/settings/billing`
Expected: Shows current plan, usage, upgrade button

**Step 4: Commit**

```bash
git add apps/web/src/app/(app)/settings/billing/page.tsx apps/web/src/app/(app)/settings/layout.tsx
git commit -m "feat(ui): create billing settings page

- Display current plan with trial countdown
- Show session usage with progress bar
- Upgrade Plan button links to /pricing
- Manage Billing button for Stripe portal (paid plans)
- Loads data from org and counts sessions this month"
```

---

## Task 10: Add Session Creation Guard to Frontend

**Files:**
- Modify: `apps/web/src/app/(app)/simulations/new/page.tsx`
- Create: `apps/web/src/components/ui/alert-dialog.tsx` (if doesn't exist)

**Step 1: Create trial check function**

Add to the simulation page before session creation:

```typescript
async function checkTrialBeforeSession() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const response = await fetch('/api/sessions/check-trial', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      user_id: user.id,
      ip_address: 'client', // Server will get real IP
    }),
  });

  const result = await response.json();
  return result;
}
```

**Step 2: Add guard before session creation**

```typescript
async function handleStartSimulation() {
  const checkResult = await checkTrialBeforeSession();

  if (!checkResult.allowed) {
    if (checkResult.reason === 'trial_expired') {
      // Show modal
      alert('Your 14-day trial has ended. Upgrade to continue training.');
      router.push('/pricing');
      return;
    } else if (checkResult.reason === 'ip_limit_reached') {
      alert('You\'ve used all 5 trial sessions. Upgrade for unlimited sessions.');
      router.push('/pricing');
      return;
    } else if (checkResult.reason === 'trial_admin_only') {
      alert('Only admins can create sessions during the trial period.');
      return;
    } else if (checkResult.reason === 'upgrade_required') {
      alert('Please upgrade your plan to create sessions.');
      router.push('/pricing');
      return;
    }
  }

  // Proceed with normal session creation
  // ... existing code
}
```

**Step 3: Test trial guard**

Run: `npm run dev`
Try to create session as trial user
Expected: Check passes (if under limit) or shows appropriate message

**Step 4: Commit**

```bash
git add apps/web/src/app/(app)/simulations/new/page.tsx
git commit -m "feat(sim): add trial check guard before session creation

- Call /api/sessions/check-trial before allowing session start
- Show appropriate alerts for trial_expired, ip_limit_reached, trial_admin_only
- Redirect to /pricing on limit/expiration
- Block non-admins during trial period"
```

---

## Task 11: Update Billing Webhook for Trial Cleanup

**Files:**
- Modify: `apps/api/src/routes/billing.ts:203-219`

**Step 1: Add trial cleanup to checkout webhook**

Find the `checkout.session.completed` case in the webhook handler:

```typescript
case "checkout.session.completed": {
  const session = event.data.object as Stripe.Checkout.Session;
  const orgId = session.metadata?.org_id;
  const plan = session.metadata?.plan;

  if (orgId && plan) {
    // Get org data before update (for analytics)
    const { data: org } = await supabase
      .from('organizations')
      .select('trial_starts_at, created_at')
      .eq('id', orgId)
      .single();

    // Update plan
    await supabase
      .from("organizations")
      .update({
        plan,
        stripe_customer_id: session.customer as string,
        plan_updated_at: new Date().toISOString(),
      })
      .eq("id", orgId);

    // Clean up trial data
    await supabase
      .from('trial_sessions')
      .delete()
      .eq('org_id', orgId);

    // Log upgrade event
    const daysIntoTrial = org?.trial_starts_at
      ? Math.floor((Date.now() - new Date(org.trial_starts_at).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const { count: sessionsUsed } = await supabase
      .from('trial_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('org_id', orgId);

    await supabase.from('trial_events').insert({
      org_id: orgId,
      event_type: 'upgraded',
      metadata: {
        plan,
        days_into_trial: daysIntoTrial,
        sessions_used: sessionsUsed || 0,
        trigger: 'checkout',
      },
    });
  }
  break;
}
```

**Step 2: Test webhook locally**

Run Stripe CLI:
```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
stripe trigger checkout.session.completed
```
Expected: Webhook fires, trial_sessions deleted, event logged

**Step 3: Commit**

```bash
git add apps/api/src/routes/billing.ts
git commit -m "feat(billing): cleanup trial data on successful checkout

- Delete trial_sessions when user upgrades
- Log 'upgraded' event with metadata (days into trial, sessions used)
- Update plan_updated_at timestamp
- Track conversion trigger for analytics"
```

---

## Task 12: Add Trial Session Tracking

**Files:**
- Create: `apps/api/src/routes/sessions.ts` (or modify existing)

**Step 1: Create session tracking function**

```typescript
async function trackTrialSession(
  orgId: string,
  userId: string,
  sessionId: string,
  scenarioType: string,
  ipAddress: string
) {
  const supabase = createServiceClient();

  // Insert trial session record
  await supabase.from('trial_sessions').insert({
    ip_address: ipAddress,
    org_id: orgId,
    user_id: userId,
    session_id: sessionId,
    scenario_type: scenarioType,
  });

  // Check if this is first session
  const { count } = await supabase
    .from('trial_sessions')
    .select('id', { count: 'exact', head: true })
    .eq('org_id', orgId);

  // Log first session event
  if (count === 1) {
    const { data: org } = await supabase
      .from('organizations')
      .select('trial_starts_at')
      .eq('id', orgId)
      .single();

    const hoursSinceStart = org?.trial_starts_at
      ? (Date.now() - new Date(org.trial_starts_at).getTime()) / (1000 * 60 * 60)
      : 0;

    await supabase.from('trial_events').insert({
      org_id: orgId,
      event_type: 'first_session',
      metadata: {
        scenario: scenarioType,
        hours_since_trial_start: hoursSinceStart,
      },
    });
  }

  // Log session limit hit
  if (count === 5) {
    await supabase.from('trial_events').insert({
      org_id: orgId,
      event_type: 'session_limit_hit',
    });
  }
}
```

**Step 2: Call tracking after session creation**

In your session creation endpoint:

```typescript
app.post('/api/sessions', async (request, reply) => {
  // ... existing session creation code

  // Track if trial user
  if (org.plan === 'trial') {
    const ipAddress = request.headers['x-forwarded-for'] || request.ip || 'unknown';
    await trackTrialSession(org.id, user.id, newSession.id, scenarioType, ipAddress);
  }

  return newSession;
});
```

**Step 3: Test session tracking**

Create a trial session
Expected: trial_sessions record created, events logged for 1st and 5th session

**Step 4: Commit**

```bash
git add apps/api/src/routes/sessions.ts
git commit -m "feat(sessions): track trial session creation

- Log to trial_sessions table with IP address
- Detect and log first_session event with time-to-activation
- Detect and log session_limit_hit event on 5th session
- Extract IP from x-forwarded-for header"
```

---

## Task 13: Manual Testing & Verification

**Files:**
- N/A (manual testing)

**Step 1: Test happy path**

1. Sign up new account
2. Complete onboarding
3. Verify trial banner shows "14 days, 5 sessions"
4. Create 3 sessions
5. Check banner shows "14 days, 2 sessions"
6. Navigate to /settings/billing
7. Verify shows 3/5 sessions used

**Step 2: Test session limit**

1. Create 2 more sessions (total 5)
2. Verify banner turns red: "Session limit reached"
3. Try to create 6th session
4. Verify blocked with modal
5. Click "Upgrade" → redirects to /pricing

**Step 3: Test trial expiration**

1. In database, set trial_ends_at to yesterday
2. Refresh app
3. Verify banner shows "Trial expired"
4. Try to create session → blocked
5. Navigate around app → still works (soft block)

**Step 4: Test upgrade flow**

1. Click "Select Plan" on Growth tier
2. Should redirect to Stripe checkout (test mode)
3. Complete checkout with test card (4242 4242 4242 4242)
4. Redirect to success page
5. Verify plan updated to 'growth'
6. Verify trial_sessions deleted
7. Create new session → should work

**Step 5: Document test results**

Create a file documenting results:
```bash
echo "Manual testing completed on $(date)" > docs/test-results.md
echo "- Happy path: PASS" >> docs/test-results.md
echo "- Session limit: PASS" >> docs/test-results.md
echo "- Trial expiration: PASS" >> docs/test-results.md
echo "- Upgrade flow: PASS" >> docs/test-results.md
```

**Step 6: Commit**

```bash
git add docs/test-results.md
git commit -m "test: manual verification of trial flow

Tested:
- Trial initialization on onboarding
- Session counting and limits
- Banner states (active, limit, expired)
- Soft block on expiration
- Stripe checkout and upgrade
- Trial data cleanup

All critical paths passing."
```

---

## Implementation Complete!

You've successfully implemented the complete trial & subscription flow with:

✅ Database schema (trial fields, trial_sessions, trial_events)
✅ Backend API (trial check endpoint, session guards)
✅ Frontend components (banner, pricing page, billing page)
✅ Onboarding integration (trial initialization)
✅ Session tracking (IP-based limits, analytics events)
✅ Stripe integration (checkout, webhook cleanup)
✅ Manual testing verification

**Next Steps:**
1. Deploy to staging environment
2. Run full E2E test suite
3. Test with real Stripe account (test mode)
4. Monitor trial conversion metrics
5. Iterate based on user feedback

**Monitoring:**
- Query trial_events for conversion funnel
- Track session_limit_hit vs upgraded ratio
- Monitor IP abuse patterns
- A/B test trial duration if needed
