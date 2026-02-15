# Trial & Subscription Flow Design

**Date:** 2026-02-15
**Status:** Approved
**Approach:** Database-Centric (Approach 1)

## Overview

Complete trial and subscription system for MaximaCoach that converts free users to paid subscribers through a 14-day trial with 5-session limit, enforced globally by IP address to prevent abuse.

## Requirements Summary

### Trial Behavior
- Trial starts after user completes onboarding (not at signup)
- 14-day duration with 5 sessions total (tracked by IP globally)
- Only admin/first user can create sessions during trial
- Teammates can be added but can't simulate until upgrade

### Upgrade Flow
- Proactive: Users can upgrade anytime via pricing page
- Forced: When session limit hit or trial expires, prompt to upgrade
- After upgrade: Optimistic unlock, webhook verification in background

### Trial Expiration
- Soft block: Show persistent banner, block new sessions
- Users can still browse app and view past sessions/scorecards
- No grace period after 14 days

### Session Limits
- 5 sessions per IP address globally (not per org)
- Tracks IP on session creation
- Separate `trial_sessions` table for privacy (cleared on upgrade)

### Analytics
- Track: trial start, first session, scenarios tried, session completion, time to conversion
- Detailed events for funnel analysis
- Admin dashboard (future enhancement)

---

## Architecture

### Approach: Database-Centric

**Why this approach:**
- Single source of truth (no cache sync issues)
- Simple and reliable
- Easy to debug and reason about
- Performance acceptable for current scale
- Can add Redis caching later if needed

**Trade-offs:**
- Extra DB roundtrip on protected routes (mitigated by session caching)
- Slightly slower than Redis-cached approach
- Worth it for simplicity and reliability in v1

---

## Section 1: Database Schema Changes

### 1.1 Update `organizations` table

```sql
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
```

**Fields:**
- `trial_starts_at`: Set when onboarding completes
- `trial_ends_at`: `trial_starts_at + 14 days`
- `plan_updated_at`: Tracks conversion time for analytics
- New plan value: `'trial'` (distinct from `'free'`)

### 1.2 Create `trial_sessions` table

```sql
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
```

**Purpose:**
- Track IP-based session attempts during trial
- Separate from main `sessions` table for privacy
- Auto-cleanup via ON DELETE CASCADE when org upgrades

### 1.3 Create `trial_events` table

```sql
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
```

**Purpose:**
- Business analytics and conversion funnel tracking
- Flexible metadata for context (scenario, trigger, plan selected)

---

## Section 2: Backend Architecture

### 2.1 Trial Initialization (Onboarding)

**Location:** `apps/web/src/app/(app)/onboarding/page.tsx`

When creating organization on onboarding completion:

```typescript
const { data: newOrg } = await supabase
  .from("organizations")
  .insert({
    name: orgName,
    plan: 'trial',
    trial_starts_at: new Date().toISOString(),
    trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
  })
  .select("id")
  .single();

// Log trial start event
await supabase.from("trial_events").insert({
  org_id: newOrg.id,
  event_type: 'trial_started',
  metadata: { source: 'onboarding' }
});
```

### 2.2 Session Creation Guard

**New API endpoint:** `POST /api/sessions/check-trial`

```typescript
async function canCreateSession(userId: string, ipAddress: string) {
  const { data: user } = await supabase
    .from('users')
    .select('org_id, role, organizations(plan, trial_ends_at)')
    .eq('id', userId)
    .single();

  const org = user.organizations;

  // Paid plans: always allowed
  if (['starter', 'growth', 'scale', 'enterprise'].includes(org.plan)) {
    return { allowed: true };
  }

  // Trial plan: check limits
  if (org.plan === 'trial') {
    // Check if trial expired
    if (new Date() > new Date(org.trial_ends_at)) {
      return { allowed: false, reason: 'trial_expired' };
    }

    // Only admin can use sessions during trial
    if (user.role !== 'admin') {
      return { allowed: false, reason: 'trial_admin_only' };
    }

    // Check global IP limit (5 sessions per IP)
    const { count } = await supabase
      .from('trial_sessions')
      .select('id', { count: 'exact', head: true })
      .eq('ip_address', ipAddress);

    if (count >= 5) {
      return { allowed: false, reason: 'ip_limit_reached' };
    }

    return { allowed: true };
  }

  // Free plan: blocked
  return { allowed: false, reason: 'upgrade_required' };
}
```

**Reason codes:**
- `trial_expired`: Trial period ended
- `trial_admin_only`: Non-admin user during trial
- `ip_limit_reached`: 5 sessions from this IP
- `upgrade_required`: Free plan needs upgrade

### 2.3 Track Trial Session

When trial user creates session:

```typescript
// After session created in main sessions table
await supabase.from('trial_sessions').insert({
  ip_address: request.headers.get('x-forwarded-for') || request.ip,
  org_id: user.org_id,
  user_id: user.id,
  session_id: newSession.id,
  scenario_type: sessionData.scenario_type,
});

// Log first session event if this is their first
const { count } = await supabase
  .from('trial_sessions')
  .select('id', { count: 'exact', head: true })
  .eq('org_id', user.org_id);

if (count === 1) {
  await supabase.from('trial_events').insert({
    org_id: user.org_id,
    event_type: 'first_session',
    metadata: {
      scenario: sessionData.scenario_type,
      hours_since_trial_start: (Date.now() - new Date(org.trial_starts_at).getTime()) / (1000 * 60 * 60)
    }
  });
}

// Log if hitting session limit
if (count === 5) {
  await supabase.from('trial_events').insert({
    org_id: user.org_id,
    event_type: 'session_limit_hit'
  });
}
```

### 2.4 Cleanup on Upgrade

**Location:** `apps/api/src/routes/billing.ts`

In Stripe webhook handler for `checkout.session.completed`:

```typescript
await supabase
  .from('trial_sessions')
  .delete()
  .eq('org_id', orgId);

await supabase.from('trial_events').insert({
  org_id: orgId,
  event_type: 'upgraded',
  metadata: {
    plan: newPlan,
    days_into_trial: daysElapsed,
    sessions_used: sessionCount
  }
});
```

---

## Section 3: Frontend Components

### 3.1 Trial Status Banner

**Location:** `apps/web/src/components/trial-banner.tsx`

```typescript
export function TrialBanner() {
  const { org, sessionsUsed, daysRemaining } = useTrialStatus();

  if (!org || org.plan !== 'trial') return null;

  const isExpired = daysRemaining <= 0;
  const isLowSessions = sessionsUsed >= 5;

  return (
    <div className={isExpired || isLowSessions ? 'bg-destructive' : 'bg-primary'}>
      {isExpired ? (
        <>Your 14-day trial has ended. <Link to="/billing">Upgrade now</Link> to continue.</>
      ) : isLowSessions ? (
        <>You've used all 5 trial sessions. <Link to="/pricing">Upgrade</Link> to continue training.</>
      ) : (
        <>{daysRemaining} days left in trial · {5 - sessionsUsed} sessions remaining</>
      )}
    </div>
  );
}
```

**Placement:** Top of `apps/web/src/app/(app)/layout.tsx`, sticky, can't be dismissed

### 3.2 Pricing Page

**Location:** `apps/web/src/app/(app)/pricing/page.tsx`

- Shows all 4 tiers: Starter, Growth, Scale, Enterprise
- "Select Plan" button per tier → triggers Stripe checkout
- Highlights current plan if logged in
- Enterprise tier has "Contact Sales" button

### 3.3 Billing Settings Page

**Location:** `apps/web/src/app/(app)/settings/billing/page.tsx`

**Displays:**
- Current plan with description
- Trial countdown if on trial: "7 days remaining"
- Session usage: "4 of 75 sessions used this month"
- "Upgrade Plan" button → `/pricing`
- "Manage Billing" button → Stripe customer portal (paid plans only)

### 3.4 Session Creation Guard (Frontend)

**Location:** `apps/web/src/app/(app)/simulations/new/page.tsx`

Before creating session:

```typescript
const checkResult = await fetch('/api/sessions/check-trial').then(r => r.json());

if (!checkResult.allowed) {
  if (checkResult.reason === 'trial_expired') {
    showModal({
      title: 'Trial Expired',
      body: 'Your 14-day trial has ended. Upgrade to continue training.',
      action: 'Upgrade Now',
      link: '/pricing'
    });
  } else if (checkResult.reason === 'ip_limit_reached') {
    showModal({
      title: 'Session Limit Reached',
      body: 'You've used all 5 trial sessions. Upgrade for unlimited sessions.',
      action: 'See Plans',
      link: '/pricing'
    });
  } else if (checkResult.reason === 'trial_admin_only') {
    showMessage('Only admins can create sessions during the trial period.');
  }
  return;
}

// Proceed with session creation
```

### 3.5 Stripe Checkout Flow

**Flow:**
1. User clicks "Select Plan" on `/pricing`
2. Call `POST /api/billing/checkout` with `{ org_id, plan, success_url, cancel_url }`
3. Redirect to Stripe checkout
4. On success → `/billing/success?session_id=xyz`
5. Success page optimistically updates plan, shows spinner
6. Polls org status every 2 seconds for 10 seconds
7. When webhook confirms, redirect to `/dashboard`

**Success page** (`apps/web/src/app/(app)/billing/success/page.tsx`):
- Shows "Payment successful! Upgrading your account..."
- Polls backend for plan update confirmation
- Timeout after 10 seconds → shows "Taking longer than expected" message

---

## Section 4: Error Handling & Edge Cases

### 4.1 Payment Failures

**Scenario:** Payment fails after initial authorization

**Handling:**
- Webhook receives `invoice.payment_failed`
- Don't downgrade immediately (7-day grace period)
- Send email: "Payment failed, please update payment method"
- Show banner: "Payment issue - update billing"
- After 7 days, downgrade to `free` plan

### 4.2 Webhook Delivery Failures

**Scenario:** Stripe webhook never reaches server

**Handling:**
- User is optimistically upgraded on success page
- Background job runs every 5 minutes
- Checks orgs with `payment_verification_pending` flag
- Queries Stripe API directly to confirm subscription
- If confirmed: clear pending flag
- If failed: rollback plan, notify user

### 4.3 IP Address Edge Cases

**VPN/Proxy Users:**
- Acceptable: If they switch IPs, might get a few extra sessions
- Global limit still applies per IP

**Shared IPs (offices):**
- Intentional: First user from office gets 5 sessions, then blocked
- Forces upgrade for whole team

**No IP available:**
- Fallback: Allow session but log warning
- Monitor for abuse

### 4.4 Trial Extension

**Manual Override:**
- Add `trial_extended` boolean to org
- When set, add 7 days to `trial_ends_at`
- Admin panel for extensions (future)

### 4.5 Timezone Handling

- All timestamps stored as UTC in database
- Display in user's local timezone on frontend
- Expiration checks use server UTC (consistent)

### 4.6 Abandoned Sessions

**Scenario:** User starts session but doesn't finish

**Handling:**
- Still counts toward IP limit (logged on start)
- Mark as `completed: false`
- No "refunds" (prevents gaming the system)

### 4.7 No Second Trials

**Policy:** Once you've had trial or been on paid plan, can't get another trial

**Enforcement:**
- Check if org ever had `trial_starts_at` set
- If yes, new plan must be paid tier or `free` (blocked)
- Prevents cycle: trial → cancel → new trial

---

## Section 5: Analytics & Tracking

### 5.1 Metrics Tracked

**Core Metrics:**
- Total sessions per trial
- Sessions completed vs. abandoned
- Scenarios attempted
- Average session duration
- Time to first session
- Time to conversion

**Conversion Events:**
- Trial started
- First session created
- Session limit hit
- Trial expired
- Upgraded (with trigger: limit/expiration/proactive)

### 5.2 Example Queries

**Conversion funnel:**
```sql
SELECT
  COUNT(CASE WHEN event_type = 'trial_started' THEN 1 END) as trials_started,
  COUNT(CASE WHEN event_type = 'first_session' THEN 1 END) as activated,
  COUNT(CASE WHEN event_type = 'upgraded' THEN 1 END) as converted
FROM trial_events
WHERE created_at > NOW() - INTERVAL '30 days';
```

**Most popular scenarios:**
```sql
SELECT scenario_type, COUNT(*)
FROM trial_sessions
GROUP BY scenario_type
ORDER BY count DESC;
```

**Time to first session:**
```sql
SELECT AVG(
  EXTRACT(EPOCH FROM (first_session.created_at - trial_start.created_at)) / 3600
) as avg_hours_to_first_session
FROM trial_events trial_start
JOIN trial_events first_session
  ON trial_start.org_id = first_session.org_id
WHERE trial_start.event_type = 'trial_started'
  AND first_session.event_type = 'first_session';
```

### 5.3 Admin Dashboard (Future)

**Planned views:**
- Conversion rate by source
- Average sessions before upgrade
- Most common upgrade trigger
- Drop-off funnel (% who never start, % who hit limit but don't upgrade)

**Implementation:** SQL queries → Metabase/Retool/custom admin page

---

## Section 6: Testing Strategy

### 6.1 Database Migration Testing

- Run migration on staging
- Verify constraints work
- Check indexes created
- Test rollback script

### 6.2 E2E Test Cases

**Case 1: Happy Path**
1. Sign up → complete onboarding
2. Verify trial dates set correctly
3. Create 3 sessions → verify logged
4. Upgrade via Stripe (test mode)
5. Verify plan updated, trial data cleared

**Case 2: Session Limit**
1. Create trial, use 5 sessions from same IP
2. Attempt 6th → verify blocked
3. Check banner shows correct message

**Case 3: Trial Expiration**
1. Create trial with past `trial_ends_at`
2. Try to create session → blocked
3. Can still view old sessions

**Case 4: Global IP Limit**
1. Trial A from IP 1.2.3.4, use 5 sessions
2. Trial B from same IP → blocked on first session

**Case 5: Non-Admin Block**
1. Admin creates trial, invites rep
2. Rep tries session → blocked
3. Admin upgrades
4. Rep tries session → allowed

### 6.3 Webhook Testing

```bash
stripe listen --forward-to localhost:3001/api/billing/webhook
stripe trigger checkout.session.completed
```

Verify: plan updates, trial data cleared, events logged

### 6.4 Manual QA Checklist

- [ ] Full signup → upgrade flow
- [ ] VPN test (different IPs)
- [ ] Manual trial expiration (DB edit)
- [ ] Session limit enforcement
- [ ] Non-admin session block during trial
- [ ] Stripe webhook (local + staging)
- [ ] Analytics events logged
- [ ] Mobile responsive

---

## Implementation Order

1. **Database migrations** (trial fields, trial_sessions, trial_events)
2. **Update shared constants** (add new plan values)
3. **Backend trial logic** (check-trial endpoint, session guards)
4. **Update onboarding** (set trial dates)
5. **Frontend components** (banner, pricing page, billing page)
6. **Stripe integration** (checkout flow, webhooks, cleanup)
7. **Analytics tracking** (event logging)
8. **Testing** (E2E, manual QA)

---

## Future Enhancements

- Admin dashboard for trial analytics
- A/B testing trial durations (7 days vs. 14 days)
- Trial extension workflow (admin panel)
- Email drip campaign during trial
- In-app messaging for upgrade prompts
- Redis caching for trial status checks

---

## Success Metrics

- **Activation:** % of trials that create first session within 24 hours
- **Engagement:** Average sessions per trial
- **Conversion:** % of trials that upgrade to paid
- **Time to Value:** Hours from signup to first session
- **Upgrade Trigger:** Distribution of limit/expiration/proactive upgrades

Target: 30%+ trial-to-paid conversion rate
