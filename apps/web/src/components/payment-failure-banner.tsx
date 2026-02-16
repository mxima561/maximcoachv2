"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";

export function PaymentFailureBanner() {
  const [failureInfo, setFailureInfo] = useState<{
    failedAt: string;
    daysRemaining: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  useEffect(() => {
    async function checkPaymentStatus() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) {
          setLoading(false);
          return;
        }

        const { data: orgUsers } = await supabase
          .from("organization_users")
          .select("organization_id, role")
          .eq("user_id", user.id)
          .limit(1);

        if (!orgUsers || orgUsers.length === 0) {
          setLoading(false);
          return;
        }

        const orgUser = orgUsers[0];

        const { data: org } = await supabase
          .from("organizations")
          .select("payment_failed_at")
          .eq("id", orgUser.organization_id)
          .single();

        if (org?.payment_failed_at) {
          const failedAt = new Date(org.payment_failed_at);
          const daysSinceFailure = Math.floor(
            (Date.now() - failedAt.getTime()) / (1000 * 60 * 60 * 24)
          );
          const daysRemaining = Math.max(0, 7 - daysSinceFailure);

          setFailureInfo({
            failedAt: org.payment_failed_at,
            daysRemaining,
          });
        }

        setLoading(false);
      } catch (error) {
        console.error("Error checking payment status:", error);
        setLoading(false);
      }
    }

    checkPaymentStatus();

    // Subscribe to real-time changes
    const channel = supabase
      .channel("payment-status")
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "organizations" },
        checkPaymentStatus
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  if (loading || !failureInfo) return null;

  const isUrgent = failureInfo.daysRemaining <= 2;
  const bgColor = isUrgent
    ? "bg-red-600 text-white"
    : "bg-orange-500 text-white";

  return (
    <div className={`sticky top-0 z-50 px-4 py-3 text-center text-sm ${bgColor}`}>
      <span className="font-semibold">⚠️ Payment Issue</span>
      {" · "}
      <span>
        Your last payment failed. Please update your payment method within{" "}
        <strong>{failureInfo.daysRemaining} day{failureInfo.daysRemaining !== 1 ? "s" : ""}</strong>
        {" "}to avoid service interruption.
      </span>
      {" · "}
      <Link
        href="/settings/billing"
        className="font-semibold underline hover:no-underline"
      >
        Update payment method
      </Link>
    </div>
  );
}
