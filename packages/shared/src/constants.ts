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
    features: ["14-day trial", "5 sessions", "Admin-only access"],
  },
  starter: {
    name: "Starter",
    price: 299,
    features: ["Unlimited sessions", "Basic analytics", "Email support"],
  },
  growth: {
    name: "Growth",
    price: 599,
    recommended: true,
    features: [
      "Everything in Starter",
      "Advanced analytics",
      "Priority support",
    ],
  },
  scale: {
    name: "Scale",
    price: 999,
    features: [
      "Everything in Growth",
      "Custom integrations",
      "Dedicated success manager",
    ],
  },
  enterprise: {
    name: "Enterprise",
    price: null, // custom pricing
    features: [
      "Everything in Scale",
      "White-label options",
      "SLA guarantee",
    ],
  },
  free: {
    name: "Free",
    price: 0,
    features: ["Limited features"],
  },
} as const;
