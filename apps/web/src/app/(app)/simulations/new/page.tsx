"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
  Building2,
  Phone,
  Search,
  ShieldAlert,
  Handshake,
  Mic,
  Clock,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

// ── Types ─────────────────────────────────────────────────────

interface ProspectProfile {
  name: string;
  company: string;
  title: string;
  industry: string;
  primaryChallenge: string;
}

interface PersonaResult {
  id: string;
  persona_json: Record<string, unknown>;
}

type ScenarioType = "cold_call" | "discovery" | "objection_handling" | "closing";

const SCENARIOS: {
  type: ScenarioType;
  name: string;
  description: string;
  icon: typeof Phone;
  difficulty: string;
  estimatedMinutes: number;
}[] = [
    {
      type: "cold_call",
      name: "Cold Call",
      description: "Practice cold outreach and grabbing attention quickly.",
      icon: Phone,
      difficulty: "Medium",
      estimatedMinutes: 8,
    },
    {
      type: "discovery",
      name: "Discovery",
      description: "Uncover pain points with strategic questioning.",
      icon: Search,
      difficulty: "Medium",
      estimatedMinutes: 12,
    },
    {
      type: "objection_handling",
      name: "Objection Handling",
      description: "Navigate price, competitor, and timing objections.",
      icon: ShieldAlert,
      difficulty: "Hard",
      estimatedMinutes: 10,
    },
    {
      type: "closing",
      name: "Closing",
      description: "Secure commitment and handle last-minute hesitation.",
      icon: Handshake,
      difficulty: "Hard",
      estimatedMinutes: 10,
    },
  ];

// ── Component ─────────────────────────────────────────────────

export default function SimulationLaunchPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const [step, setStep] = useState(1);
  const [profile, setProfile] = useState<ProspectProfile>({
    name: "",
    company: "",
    title: "",
    industry: "",
    primaryChallenge: "",
  });
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(
    null,
  );
  const [persona, setPersona] = useState<PersonaResult | null>(null);
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [startingSession, setStartingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const profileReady = Boolean(profile.company.trim());

  // Pre-select from query params
  useEffect(() => {
    const scenario = searchParams.get("scenario") as ScenarioType | null;

    if (scenario && SCENARIOS.some((s) => s.type === scenario)) {
      setSelectedScenario(scenario);
      setStep(profileReady ? 3 : 2);
    }
  }, [searchParams, profileReady]);

  async function handleGeneratePersona() {
    if (!selectedScenario || !profileReady) return;
    setGeneratingPersona(true);
    setError(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
      const res = await fetch(`${apiUrl}/api/personas/generate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token
            ? { Authorization: `Bearer ${session.access_token}` }
            : {}),
        },
        body: JSON.stringify({
          scenario_type: selectedScenario,
          prospect_profile: {
            name: profile.name.trim() || undefined,
            company: profile.company.trim(),
            title: profile.title.trim() || undefined,
            industry: profile.industry.trim() || undefined,
            primary_challenge: profile.primaryChallenge.trim() || undefined,
          },
        }),
      });

      if (res.ok) {
        const data = (await res.json()) as PersonaResult;
        setPersona(data);

        // Auto-start the session after persona generation
        setGeneratingPersona(false);
        await handleStartSession(data);
      } else {
        const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
        const message =
          typeof errorData?.message === "string"
            ? errorData.message
            : "Failed to generate persona. Please try again.";
        setError(message);
        console.error("Persona generation failed:", {
          status: res.status,
          statusText: res.statusText,
          error: errorData,
          scenario: selectedScenario,
        });
        setGeneratingPersona(false);
      }
    } catch (error) {
      console.error("Persona generation exception:", error);
      setError("Could not generate persona. Please try again.");
      setGeneratingPersona(false);
    }
  }

  async function handleStartSession(personaData?: PersonaResult) {
    const personaToUse = personaData || persona;
    if (!selectedScenario || !personaToUse) return;
    setStartingSession(true);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = {};
      if (authSession?.access_token) {
        authHeaders.Authorization = `Bearer ${authSession.access_token}`;
      }

      // Get user
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        alert("You must be logged in to start a session");
        setStartingSession(false);
        return;
      }

      // Get organization_id from organization_users
      const { data: orgUsers } = await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!orgUsers || orgUsers.length === 0) {
        alert("You must belong to an organization to start a session");
        setStartingSession(false);
        return;
      }

      const org_id = orgUsers[0].organization_id;

      // Check trial status before creating session
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      // Get user's IP address for trial tracking (optional; API can fall back)
      let ipAddress: string | undefined;
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        ipAddress = ipData.ip;
      } catch {
        ipAddress = undefined;
      }

      const trialCheckRes = await fetch(`${apiUrl}/api/sessions/check-trial`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          ...(ipAddress ? { ip_address: ipAddress } : {}),
        }),
      });

      const trialCheck = await trialCheckRes.json();

      if (!trialCheck.allowed) {
        if (
          ["trial_expired", "ip_limit_reached", "upgrade_required"].includes(
            trialCheck.reason as string
          )
        ) {
          try {
            await fetch(`${apiUrl}/track-upgrade-click`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                ...authHeaders,
              },
              body: JSON.stringify({
                org_id,
                source: "session_blocked",
              }),
            });
          } catch (err) {
            console.error("Failed to track upgrade click:", err);
          }
        }

        const messages: Record<string, string> = {
          trial_expired: "Your trial has expired. Please upgrade to continue creating sessions.",
          trial_admin_only: "Only admins can create sessions during the trial period. Please contact your organization admin.",
          ip_limit_reached: "Trial session limit reached (5 sessions per IP). Please upgrade to continue.",
          upgrade_required: "Please upgrade your plan to create sessions.",
          no_organization: "You must belong to an organization to create sessions.",
        };

        const message = messages[trialCheck.reason as string] || "Cannot create session at this time.";
        setError(message);
        alert(message);
        setStartingSession(false);
        return;
      }

      // Create session via API to ensure trial tracking
      const sessionRes = await fetch(`${apiUrl}/api/sessions/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...authHeaders,
        },
        body: JSON.stringify({
          org_id,
          persona_id: personaToUse.id,
          scenario_type: selectedScenario,
          ...(ipAddress ? { ip_address: ipAddress } : {}),
        }),
      });

      if (sessionRes.ok) {
        const session = await sessionRes.json();
        router.push(`/simulate/${session.id}`);
      } else {
        setError("Failed to create session. Please try again.");
        alert("Failed to create session. Please try again.");
        setStartingSession(false);
      }
    } catch (error) {
      console.error("Session creation error:", error);
      setError("An error occurred while creating the session.");
      alert("An error occurred while creating the session. Please try again.");
      setStartingSession(false);
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/dashboard">
            <ArrowLeft className="mr-1 size-4" />
            Back
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold tracking-tight">
          New Simulation
        </h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div
              className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${s < step
                ? "bg-primary text-primary-foreground"
                : s === step
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground"
                }`}
            >
              {s < step ? <Check className="size-4" /> : s}
            </div>
            <span
              className={`text-sm ${s === step ? "font-medium" : "text-muted-foreground"}`}
            >
              {s === 1 ? "Prospect Profile" : s === 2 ? "Pick Scenario" : "Review & Start"}
            </span>
            {s < 3 && (
              <ArrowRight className="size-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {error && (
        <div className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </div>
      )}

      {/* Step 1: Prospect profile */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Prospect Profile</CardTitle>
            <CardDescription>
              Add a quick buyer profile. No lead import required.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prospect-name">Prospect Name</Label>
                <Input
                  id="prospect-name"
                  placeholder="Optional"
                  value={profile.name}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, name: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prospect-company">Company *</Label>
                <Input
                  id="prospect-company"
                  placeholder="Acme Corp"
                  value={profile.company}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, company: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="prospect-title">Role</Label>
                <Input
                  id="prospect-title"
                  placeholder="VP Sales"
                  value={profile.title}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, title: e.target.value }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="prospect-industry">Industry</Label>
                <Input
                  id="prospect-industry"
                  placeholder="SaaS"
                  value={profile.industry}
                  onChange={(e) =>
                    setProfile((prev) => ({ ...prev, industry: e.target.value }))
                  }
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="prospect-challenge">Primary Challenge</Label>
              <Textarea
                id="prospect-challenge"
                placeholder="What challenge is this prospect dealing with?"
                value={profile.primaryChallenge}
                rows={3}
                onChange={(e) =>
                  setProfile((prev) => ({
                    ...prev,
                    primaryChallenge: e.target.value,
                  }))
                }
              />
            </div>

            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={!profileReady}
              >
                Next: Pick Scenario
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Pick Scenario */}
      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle>Pick a Scenario</CardTitle>
            <CardDescription>
              What type of conversation do you want to practice?
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              {SCENARIOS.map((scenario) => {
                const Icon = scenario.icon;
                const isSelected = selectedScenario === scenario.type;
                return (
                  <div
                    key={scenario.type}
                    className={`cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent ${isSelected ? "border-primary bg-primary/5" : ""
                      }`}
                    onClick={() => setSelectedScenario(scenario.type)}
                  >
                    <div className="flex items-center gap-2">
                      <Icon className="size-5 text-primary" />
                      <span className="font-medium">{scenario.name}</span>
                      {isSelected && (
                        <Check className="ml-auto size-4 text-primary" />
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {scenario.description}
                    </p>
                    <div className="mt-2 flex items-center gap-2">
                      <Badge
                        variant={
                          scenario.difficulty === "Hard"
                            ? "destructive"
                            : "secondary"
                        }
                        className="text-xs"
                      >
                        {scenario.difficulty}
                      </Badge>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="size-3" />~
                        {scenario.estimatedMinutes}m
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(1)}>
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
              <Button
                onClick={() => setStep(3)}
                disabled={!selectedScenario}
              >
                Next: Review
                <ArrowRight className="ml-1 size-4" />
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 3: Review & Start */}
      {step === 3 && selectedScenario && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Start</CardTitle>
            <CardDescription>
              Confirm your setup and generate an AI buyer persona for training.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Prospect
                </p>
                <p className="mt-1 font-medium">
                  {profile.name.trim() || "AI Prospect"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {profile.title.trim() ? `${profile.title.trim()} at ` : ""}
                  {profile.company.trim()}
                </p>
                {profile.industry.trim() && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    {profile.industry.trim()}
                  </p>
                )}
                {profile.primaryChallenge.trim() && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {profile.primaryChallenge.trim()}
                  </p>
                )}
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Scenario
                </p>
                <p className="mt-1 font-medium">
                  <Building2 className="mr-1 inline size-4 text-primary" />
                  {SCENARIOS.find((s) => s.type === selectedScenario)?.name}
                </p>
                <p className="text-sm text-muted-foreground">
                  {
                    SCENARIOS.find((s) => s.type === selectedScenario)
                      ?.description
                  }
                </p>
              </div>
            </div>

            {!persona && (
              <Button
                className="w-full"
                onClick={handleGeneratePersona}
                disabled={generatingPersona || startingSession}
              >
                {generatingPersona ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating AI buyer persona...
                  </>
                ) : startingSession ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Starting call...
                  </>
                ) : (
                  <>
                    <Mic className="mr-2 size-4" />
                    Generate Persona & Start Call
                  </>
                )}
              </Button>
            )}

            {persona && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 dark:border-green-900 dark:bg-green-950">
                <div className="flex items-center gap-2">
                  <Check className="size-5 text-green-600" />
                  <p className="font-medium text-green-800 dark:text-green-200">
                    Persona generated successfully
                  </p>
                </div>
              </div>
            )}

            {persona && (
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setStep(2)}>
                  <ArrowLeft className="mr-1 size-4" />
                  Back
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
