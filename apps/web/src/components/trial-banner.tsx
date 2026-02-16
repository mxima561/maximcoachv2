"use client";

import { useTrialStatus } from "@/hooks/use-trial-status";
import { useRouter } from "next/navigation";

export function TrialBanner() {
  const { isTrialActive, daysRemaining, sessionsRemaining, isLoading, orgId } =
    useTrialStatus();
  const router = useRouter();

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

  const handleUpgradeClick = async () => {
    if (orgId) {
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL;
        await fetch(`${apiUrl}/track-upgrade-click`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            org_id: orgId,
            source: "trial_banner",
          }),
        });
      } catch (err) {
        console.error("Failed to track upgrade click:", err);
      }
    }
    router.push("/pricing");
  };

  return (
    <div className={`sticky top-0 z-50 px-4 py-2 text-center text-sm ${bgColor}`}>
      <span className="font-medium">
        Trial: {daysRemaining} day{daysRemaining !== 1 ? "s" : ""} remaining,{" "}
        {sessionsRemaining} session{sessionsRemaining !== 1 ? "s" : ""} left
      </span>
      {" · "}
      <button
        onClick={handleUpgradeClick}
        className="underline hover:no-underline"
      >
        Upgrade now
      </button>
    </div>
  );
}
