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

export const PLANS = ["free", "growth", "pro"] as const;
export type Plan = (typeof PLANS)[number];
