# Trial & Subscription System - Manual QA Checklist

**Last Updated:** 2026-02-16
**Version:** 1.0

## Pre-Testing Setup

- [ ] Test environment has Supabase migrations applied
- [ ] Stripe test mode credentials configured
- [ ] Test email account accessible
- [ ] Browser DevTools open for debugging
- [ ] Can create multiple test accounts

---

## 1. Signup & Onboarding Flow

### 1.1 New User Signup
- [ ] Navigate to `/signup`
- [ ] Enter email, password, full name
- [ ] Submit form → "Check your email" message appears
- [ ] Email verification link received
- [ ] Click verification link → redirects to `/onboarding` (NOT `/dashboard`)

### 1.2 Onboarding Completion
- [ ] Onboarding page shows trial messaging ("14-day trial, 5 sessions")
- [ ] Enter organization name
- [ ] Submit → redirects to `/dashboard`
- [ ] Check database: `organizations` has `plan='trial'`, `trial_starts_at`, `trial_ends_at` set
- [ ] Check database: `trial_events` has `trial_started` event logged
- [ ] User appears in `organization_users` with `role='admin'`

**Expected Database State:**
```sql
SELECT name, plan, trial_starts_at, trial_ends_at FROM organizations WHERE name = '<test-org>';
-- Should return: plan='trial', dates 14 days apart

SELECT event_type FROM trial_events WHERE organization_id = '<org-id>';
-- Should return: 'trial_started'
```

---

## 2. Trial Banner Display

### 2.1 Active Trial Banner
- [ ] Banner visible at top of all app pages
- [ ] Shows correct days remaining (14 days on day 1)
- [ ] Shows correct sessions remaining (5 sessions)
- [ ] Banner has blue background (info state)
- [ ] "Upgrade now" link present

### 2.2 Banner Color Changes
- [ ] **Days ≤ 7:** Banner turns yellow (warning state)
- [ ] **Days ≤ 3:** Banner turns red (urgent state)
- [ ] **Sessions ≤ 1:** Banner turns red (urgent state)

### 2.3 Banner Real-Time Updates
- [ ] Create a session → banner updates to show 4 sessions remaining
- [ ] Create 5 sessions → banner updates in real-time

---

## 3. Session Creation & Limits

### 3.1 First Session (Admin)
- [ ] Navigate to `/simulations/new`
- [ ] Select lead, scenario
- [ ] Click "Start Simulation"
- [ ] IP address detected (check DevTools network tab for ipify.org call)
- [ ] Trial check API called (`POST /api/sessions/check-trial`)
- [ ] Check returns `{allowed: true}`
- [ ] Session created successfully
- [ ] Check database: `trial_sessions` has entry with `organization_id`, `user_id`, `session_id`, `scenario_type`, `ip_address`
- [ ] Check database: `trial_events` has `first_session` event with `time_since_trial_start_hours` metadata

**Expected Database State:**
```sql
SELECT * FROM trial_sessions WHERE organization_id = '<org-id>';
-- Should have 1 row with all fields populated

SELECT event_type, metadata FROM trial_events WHERE event_type = 'first_session';
-- Should have time_since_trial_start_hours in metadata
```

### 3.2 Session Limit (5 Sessions)
- [ ] Create sessions 2, 3, 4 successfully
- [ ] Banner updates after each: "4 remaining", "3 remaining", "2 remaining", "1 remaining"
- [ ] Create 5th session successfully
- [ ] Banner turns red: "You've used all 5 trial sessions"
- [ ] Check database: `trial_events` has `session_limit_hit` event

### 3.3 Session Blocked After Limit
- [ ] Try to create 6th session
- [ ] Trial check returns `{allowed: false, reason: 'ip_limit_reached'}`
- [ ] Alert shows: "Trial session limit reached (5 sessions per IP). Please upgrade to continue."
- [ ] Session creation blocked

### 3.4 Global IP Limit
- [ ] Note the IP address used in trial_sessions table
- [ ] Create a second organization (different account, same IP)
- [ ] Try to create session in new org
- [ ] Should be blocked: IP already has 5 sessions globally
- [ ] Check returns `{allowed: false, reason: 'ip_limit_reached'}`

### 3.5 Non-Admin User Block
- [ ] Invite a non-admin user to the organization
- [ ] Sign in as non-admin user
- [ ] Try to create session
- [ ] Should be blocked with `{allowed: false, reason: 'trial_admin_only'}`
- [ ] Alert shows: "Only admins can create sessions during the trial period"

---

## 4. Trial Expiration

### 4.1 Manual Expiration Test
- [ ] In database, set `trial_ends_at` to yesterday:
  ```sql
  UPDATE organizations SET trial_ends_at = NOW() - INTERVAL '1 day' WHERE id = '<org-id>';
  ```
- [ ] Refresh app
- [ ] Banner shows: "Your 14-day trial has ended"
- [ ] Banner is red (urgent)

### 4.2 Expired Session Block
- [ ] Try to create session
- [ ] Check returns `{allowed: false, reason: 'trial_expired'}`
- [ ] Alert shows: "Your trial has expired. Please upgrade to continue creating sessions."
- [ ] Check database: `trial_events` has `trial_expired` event with `days_since_expiry` and `attempted_by_user`

### 4.3 Soft Block Verification
- [ ] Can still browse app (dashboard, past sessions, scorecards)
- [ ] Can view billing page
- [ ] Can view pricing page
- [ ] Only session creation is blocked

---

## 5. Analytics Event Tracking

### 5.1 Upgrade Click Tracking
- [ ] Click "Upgrade now" in trial banner
- [ ] Check database: `trial_events` has `upgrade_clicked` event
- [ ] Metadata includes: `source: 'trial_banner'`
- [ ] Navigate to `/pricing`
- [ ] Click "Get Started" on Growth plan
- [ ] Check database: New `upgrade_clicked` event
- [ ] Metadata includes: `source: 'pricing_page'`, `plan_clicked: 'growth'`

### 5.2 Event Verification Query
```sql
SELECT event_type, metadata FROM trial_events
WHERE organization_id = '<org-id>'
ORDER BY created_at ASC;

-- Should see:
-- 1. trial_started (source: onboarding)
-- 2. first_session (time_since_trial_start_hours: X)
-- 3. session_limit_hit (after 5th session)
-- 4. upgrade_clicked (multiple, from banner and pricing page)
-- 5. trial_expired (if expired)
```

---

## 6. Upgrade Flow

### 6.1 Stripe Checkout
- [ ] Click "Get Started" on Growth plan
- [ ] Redirects to Stripe checkout session
- [ ] Shows Growth plan ($599/month)
- [ ] Organization name pre-filled
- [ ] Enter test card: `4242 4242 4242 4242`, future expiry, any CVC
- [ ] Submit payment

### 6.2 Post-Checkout
- [ ] Webhook received (`checkout.session.completed`)
- [ ] Check API logs: "Checkout completed" log entry
- [ ] Check database: Organization `plan` updated to 'growth'
- [ ] Check database: `stripe_customer_id` populated
- [ ] Check database: `plan_updated_at` set to current timestamp
- [ ] Check database: All `trial_sessions` deleted for this org
- [ ] Check database: `trial_events` has `upgraded` event
- [ ] Event metadata includes: `sessions_used`, `days_into_trial`, `plan: 'growth'`, `trigger: 'checkout_completed'`

**Expected Database State:**
```sql
SELECT plan, stripe_customer_id, plan_updated_at FROM organizations WHERE id = '<org-id>';
-- plan should be 'growth', stripe_customer_id should exist

SELECT COUNT(*) FROM trial_sessions WHERE organization_id = '<org-id>';
-- Should return 0 (all deleted)

SELECT event_type, metadata FROM trial_events WHERE event_type = 'upgraded';
-- Should have sessions_used, days_into_trial, plan, trigger
```

### 6.3 Post-Upgrade Session Creation
- [ ] Trial banner no longer visible
- [ ] Try to create session
- [ ] Check returns `{allowed: true}` (no trial restrictions)
- [ ] Session created successfully
- [ ] Session NOT logged in `trial_sessions` (only for trial users)
- [ ] Can create unlimited sessions (no IP limit)

---

## 7. Payment Failure Handling

### 7.1 Trigger Payment Failure
- [ ] Use Stripe CLI or dashboard to trigger `invoice.payment_failed`:
  ```bash
  stripe trigger invoice.payment_failed
  ```
- [ ] Webhook received
- [ ] Check database: `payment_failed_at` set to current timestamp
- [ ] Check database: `payment_failure_count` set to 1
- [ ] Check API logs: "Grace period started - 7 days to update payment"

### 7.2 Payment Failure Banner
- [ ] Payment failure banner appears at top (above trial banner)
- [ ] Banner is orange (warning)
- [ ] Shows: "Your last payment failed. Please update your payment method within 7 days"
- [ ] "Update payment method" link present

### 7.3 Grace Period Countdown
- [ ] Manually set `payment_failed_at` to 5 days ago:
  ```sql
  UPDATE organizations SET payment_failed_at = NOW() - INTERVAL '5 days' WHERE id = '<org-id>';
  ```
- [ ] Refresh app
- [ ] Banner shows: "2 days to avoid service interruption"

### 7.4 Urgent State
- [ ] Set `payment_failed_at` to 6 days ago
- [ ] Refresh app
- [ ] Banner turns red (urgent, ≤ 2 days remaining)

### 7.5 Grace Period Expiration
- [ ] Set `payment_failed_at` to 8 days ago
- [ ] Trigger another `invoice.payment_failed` webhook
- [ ] Check database: Plan downgraded to 'free'
- [ ] Check database: `payment_failed_at` cleared (null)
- [ ] Check database: `payment_failure_count` reset to 0
- [ ] Check API logs: "Downgraded to free plan after 7-day grace period"

### 7.6 Payment Recovery
- [ ] Set `payment_failed_at` to 2 days ago
- [ ] Trigger `invoice.payment_succeeded` webhook:
  ```bash
  stripe trigger invoice.payment_succeeded
  ```
- [ ] Check database: `payment_failed_at` cleared (null)
- [ ] Check database: `payment_failure_count` reset to 0
- [ ] Check API logs: "Payment recovered"
- [ ] Payment failure banner disappears

---

## 8. Pricing & Billing Pages

### 8.1 Pricing Page
- [ ] Navigate to `/pricing`
- [ ] 4 tiers displayed: Starter, Growth, Scale, Enterprise
- [ ] Growth tier highlighted as "RECOMMENDED"
- [ ] Each tier shows price, features, "Get Started" button
- [ ] Enterprise shows "Contact Sales" button
- [ ] Clicking "Get Started" redirects to Stripe checkout

### 8.2 Billing Settings Page
- [ ] Navigate to `/settings/billing`
- [ ] Shows current plan name
- [ ] **Trial users:** Shows "X days remaining"
- [ ] **Trial users:** Shows session usage "X of 5" with progress bar
- [ ] **Paid users:** Shows session usage "X of [plan limit]" with progress bar
- [ ] "Upgrade Plan" button links to `/pricing`
- [ ] **Paid users:** "Manage Billing" button links to Stripe portal

---

## 9. Edge Cases & Error Handling

### 9.1 Missing IP Address
- [ ] Block ipify.org in DevTools (Network tab)
- [ ] Try to create session
- [ ] Should use fallback: `ip_address = 'unknown'`
- [ ] Session still created
- [ ] Check logs for warning

### 9.2 Existing User Login
- [ ] User with existing org logs in
- [ ] Redirected to `/dashboard` (not onboarding)
- [ ] Trial banner shown (if on trial)
- [ ] Session creation works normally

### 9.3 Concurrent Session Creation
- [ ] Open two browser tabs
- [ ] In both tabs, try to create 5th session simultaneously
- [ ] Only one should succeed
- [ ] Other should be blocked (IP limit reached)

### 9.4 Real-Time Updates
- [ ] Open two tabs as same user
- [ ] In tab 1, create a session
- [ ] Tab 2 banner should update automatically (WebSocket subscription)
- [ ] Sessions remaining count decreases in real-time

---

## 10. Browser & Mobile Testing

### 10.1 Cross-Browser
- [ ] Chrome: All flows work
- [ ] Firefox: All flows work
- [ ] Safari: All flows work
- [ ] Edge: All flows work

### 10.2 Mobile Responsive
- [ ] Trial banner readable on mobile (text wraps appropriately)
- [ ] Payment failure banner readable on mobile
- [ ] Pricing page responsive (cards stack on mobile)
- [ ] Billing page responsive
- [ ] Stripe checkout mobile-optimized

---

## Test Completion Summary

**Date Tested:** _________________
**Tested By:** _________________
**Environment:** ☐ Staging ☐ Production

### Results
- Total Tests: 100+
- Passed: _____
- Failed: _____
- Blocked: _____

### Critical Issues Found
1. _________________________________________________________________
2. _________________________________________________________________
3. _________________________________________________________________

### Sign-Off
☐ All critical paths passing
☐ No blockers for production release
☐ Edge cases documented

**Approved By:** _________________
**Date:** _________________
