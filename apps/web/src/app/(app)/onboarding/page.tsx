"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { trackEvent } from "@/lib/posthog";
import {
  Mic,
  BarChart3,
  Trophy,
  Dumbbell,
  ArrowRight,
  Building2,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { spring, FadeIn, StaggerContainer, StaggerItem, ScaleOnHover } from "@/components/motion";

const FEATURES = [
  {
    icon: Mic,
    title: "AI Voice Coaching",
    description: "Practice with realistic AI personas that adapt to your skill level",
    gradient: "from-violet-500/10 to-violet-500/5",
    iconColor: "text-violet-500",
  },
  {
    icon: BarChart3,
    title: "Performance Analytics",
    description: "Track your scores, streaks, and skill growth over time",
    gradient: "from-blue-500/10 to-blue-500/5",
    iconColor: "text-blue-500",
  },
  {
    icon: Dumbbell,
    title: "Daily Training Plans",
    description: "Personalized drills targeting your weakest skills each day",
    gradient: "from-emerald-500/10 to-emerald-500/5",
    iconColor: "text-emerald-500",
  },
  {
    icon: Trophy,
    title: "Gamified Learning",
    description: "Earn XP, unlock badges, climb ranks, and compete with teammates",
    gradient: "from-amber-500/10 to-amber-500/5",
    iconColor: "text-amber-500",
  },
];

export default function OnboardingPage() {
  const [step, setStep] = useState<"welcome" | "create">("welcome");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const supabase = createClient();
  const router = useRouter();

  async function handleCreateOrganization(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("You must be logged in");
        setLoading(false);
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const accessToken = session?.access_token;

      if (!accessToken) {
        setError("Your session expired. Please sign in again.");
        setLoading(false);
        return;
      }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const response = await fetch(`${apiUrl}/api/onboarding/create-organization`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: orgName }),
      });

      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(payload?.message || "Failed to create organization");
        setLoading(false);
        return;
      }

      trackEvent("onboarding_completed", { org_name: orgName });
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background">
      <div className="w-full max-w-lg space-y-8 p-6">
        {/* Progress indicator */}
        <div className="flex items-center justify-center gap-2">
          <motion.div
            className="h-1.5 w-16 rounded-full bg-primary"
            layoutId="progress-1"
          />
          <motion.div
            className={`h-1.5 w-16 rounded-full ${step === "create" ? "bg-primary" : "bg-muted"}`}
            animate={{ backgroundColor: step === "create" ? undefined : undefined }}
            transition={{ duration: 0.3 }}
          />
        </div>

        <AnimatePresence mode="wait">
          {step === "welcome" ? (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={spring.gentle}
              className="space-y-8"
            >
              {/* Welcome step */}
              <div className="text-center">
                <motion.div
                  className="mx-auto mb-5 flex size-18 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-[oklch(0.60_0.26_310)]/10"
                  animate={{ y: [0, -4, 0] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                >
                  <Sparkles className="size-9 text-primary" />
                </motion.div>
                <h1 className="text-3xl font-bold tracking-tight">
                  Welcome to <span className="gradient-text">MaximaCoach</span>
                </h1>
                <p className="mt-3 text-muted-foreground leading-relaxed">
                  The AI-powered platform that turns every rep into a top performer.
                </p>
              </div>

              {/* Feature cards */}
              <StaggerContainer className="grid gap-3 sm:grid-cols-2">
                {FEATURES.map((feature) => {
                  const Icon = feature.icon;
                  return (
                    <StaggerItem key={feature.title}>
                      <ScaleOnHover>
                        <div className="flex items-start gap-3 rounded-xl border p-3.5 transition-shadow hover:shadow-sm">
                          <div className={`flex size-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${feature.gradient}`}>
                            <Icon className={`size-5 ${feature.iconColor}`} />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{feature.title}</p>
                            <p className="text-xs text-muted-foreground leading-relaxed">
                              {feature.description}
                            </p>
                          </div>
                        </div>
                      </ScaleOnHover>
                    </StaggerItem>
                  );
                })}
              </StaggerContainer>

              {/* Trial info */}
              <FadeIn delay={0.3}>
                <div className="rounded-xl border border-primary/15 bg-gradient-to-r from-primary/5 to-transparent p-4 text-center">
                  <p className="text-sm font-semibold">14-day free trial</p>
                  <p className="text-xs text-muted-foreground">
                    5 practice sessions included. No credit card required.
                  </p>
                </div>
              </FadeIn>

              <FadeIn delay={0.4}>
                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => {
                    trackEvent("onboarding_started");
                    setStep("create");
                  }}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 transition-colors"
                >
                  Get Started
                  <ArrowRight className="size-4" />
                </motion.button>
              </FadeIn>
            </motion.div>
          ) : (
            <motion.div
              key="create"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={spring.gentle}
              className="space-y-8"
            >
              {/* Create org step */}
              <div className="text-center">
                <motion.div
                  className="mx-auto mb-5 flex size-18 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/15 to-primary/5"
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  transition={spring.bouncy}
                >
                  <Building2 className="size-9 text-primary" />
                </motion.div>
                <h1 className="text-2xl font-bold tracking-tight">
                  Create Your Organization
                </h1>
                <p className="mt-2 text-muted-foreground">
                  Set up your team workspace to get started.
                </p>
              </div>

              <form onSubmit={handleCreateOrganization} className="space-y-5">
                <div>
                  <label htmlFor="orgName" className="block text-sm font-semibold mb-1.5">
                    Organization name
                  </label>
                  <input
                    id="orgName"
                    type="text"
                    value={orgName}
                    onChange={(e) => setOrgName(e.target.value)}
                    placeholder="Acme Corp"
                    required
                    autoFocus
                    className="block w-full rounded-xl border border-input bg-background px-4 py-3 text-sm shadow-sm transition-all focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring/20"
                  />
                </div>

                {error && (
                  <motion.div
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-xl border border-destructive/20 bg-destructive/5 px-4 py-3"
                  >
                    <p className="text-sm text-destructive">{error}</p>
                  </motion.div>
                )}

                <motion.button
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  disabled={loading || !orgName.trim()}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 transition-all"
                >
                  {loading ? (
                    <div className="size-4 animate-spin rounded-full border-2 border-primary-foreground border-t-transparent" />
                  ) : (
                    <CheckCircle2 className="size-4" />
                  )}
                  {loading ? "Creating..." : "Start Free Trial"}
                </motion.button>

                <button
                  type="button"
                  onClick={() => setStep("welcome")}
                  className="flex w-full items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="size-3.5" />
                  Back
                </button>
              </form>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </main>
  );
}
