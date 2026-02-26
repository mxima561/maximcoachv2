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

export const SESSION_TYPES = ["simulation", "live_coaching"] as const;
export type SessionType = (typeof SESSION_TYPES)[number];

export const COACHING_SENTIMENTS = ["positive", "neutral", "negative"] as const;
export type CoachingSentiment = (typeof COACHING_SENTIMENTS)[number];

export const PLANS = [
  "trial",
  "solo",
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
    repLimit: 1,
    sessionPool: 5,
    duration: 14, // days
    sessionLimit: 5,
    features: ["14-day access", "5 total sessions", "All scenarios"],
  },
  solo: {
    name: "Solo",
    price: 29,
    repLimit: 1,
    sessionPool: "unlimited" as const,
    features: [
      "Live coaching",
      "Call recording",
      "Post-call notes",
      "Basic analytics",
    ],
  },
  starter: {
    name: "Starter",
    price: 299,
    repLimit: 5,
    sessionPool: 75,
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
    repLimit: 15,
    sessionPool: 225,
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
    repLimit: 30,
    sessionPool: 600,
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
    repLimit: -1,
    sessionPool: "unlimited" as const,
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
    repLimit: 1,
    sessionPool: 10,
    features: ["Limited features"],
  },
} as const;

/** Feature access control by plan tier */
export type Feature =
  | "live_coaching"
  | "simulation"
  | "leaderboards"
  | "challenges"
  | "manager_dashboard"
  | "crm_sync"
  | "h2h";

const FEATURE_GATES: Record<Feature, Plan[]> = {
  live_coaching: ["solo", "starter", "growth", "scale", "enterprise"],
  simulation: ["trial", "starter", "growth", "scale", "enterprise"],
  leaderboards: ["growth", "scale", "enterprise"],
  challenges: ["growth", "scale", "enterprise"],
  manager_dashboard: ["growth", "scale", "enterprise"],
  crm_sync: ["scale", "enterprise"],
  h2h: ["growth", "scale", "enterprise"],
};

export function canAccess(plan: Plan, feature: Feature): boolean {
  return FEATURE_GATES[feature]?.includes(plan) ?? false;
}
