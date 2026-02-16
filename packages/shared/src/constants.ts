export const ROLES = ["admin", "manager", "rep"] as const;
export type Role = (typeof ROLES)[number];

export const SCENARIO_TYPES = [
  "cold_call",
  "discovery",
  "objection_handling",
  "closing",
] as const;
export type ScenarioType = (typeof SCENARIO_TYPES)[number];

export const SESSION_STATUSES = [
  "pending",
  "active",
  "completed",
  "cancelled",
] as const;
export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const CRM_SOURCES = [
  "google_sheets",
  "salesforce",
  "hubspot",
  "manual",
] as const;
export type CrmSource = (typeof CRM_SOURCES)[number];

export const PLANS = [
  "trial",
  "starter",
  "growth",
  "scale",
  "enterprise",
  "free",
] as const;
export type Plan = (typeof PLANS)[number];

export const PLAN_DETAILS = {
  trial: {
    name: "Trial",
    price: 0,
    duration: 14, // days
    sessionLimit: 5,
    features: ["14-day access", "5 total sessions", "All scenarios"],
  },
  starter: {
    name: "Starter",
    price: 299,
    features: [
      "Up to 5 reps",
      "15 sessions/rep/month (75 pool)",
      "Basic analytics",
      "Email support",
    ],
  },
  growth: {
    name: "Growth",
    price: 599,
    recommended: true,
    features: [
      "Up to 15 reps",
      "15 sessions/rep/month (225 pool)",
      "Leaderboards",
      "Team challenges",
      "Priority support",
    ],
  },
  scale: {
    name: "Scale",
    price: 999,
    features: [
      "Up to 30 reps",
      "20 sessions/rep/month (600 pool)",
      "Custom scenarios",
      "CRM integration",
      "Advanced analytics",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: null, // custom pricing
    features: [
      "30+ reps (negotiated)",
      "Unlimited sessions",
      "SSO/SAML",
      "API access",
      "Quarterly business reviews",
    ],
  },
  free: {
    name: "Free",
    price: 0,
    features: ["Limited features"],
  },
} as const;
