"use client";

import { useTrialStatus } from "@/hooks/use-trial-status";
import Link from "next/link";

export function TrialBanner() {
  const { isTrialActive, daysRemaining, sessionsRemaining, isLoading } =
    useTrialStatus();

  if (isLoading || !isTrialActive) return null;

  const urgency =
    daysRemaining <= 3 || sessionsRemaining <= 1
      ? "urgent"
      : daysRemaining <= 7
      ? "warning"
      : "info";

  const bgColor =
    urgency === "urgent"
      ? "bg-red-600 text-white"
      : urgency === "warning"
      ? "bg-yellow-500 text-black"
      : "bg-blue-600 text-white";

  return (
    <div className={`sticky top-0 z-50 px-4 py-2 text-center text-sm ${bgColor}`}>
      <span className="font-medium">
        Trial: {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining,{" "}
        {sessionsRemaining} session{sessionsRemaining !== 1 ? "s" : ""} left
      </span>
      {" · "}
      <Link href="/pricing" className="underline hover:no-underline">
        Upgrade now
      </Link>
    </div>
  );
}
