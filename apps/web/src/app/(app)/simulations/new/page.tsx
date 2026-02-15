"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Loader2,
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

interface Lead {
  id: string;
  name: string;
  company: string;
  title: string | null;
  industry: string | null;
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
  const [leads, setLeads] = useState<Lead[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(
    null,
  );
  const [persona, setPersona] = useState<PersonaResult | null>(null);
  const [generatingPersona, setGeneratingPersona] = useState(false);
  const [startingSession, setStartingSession] = useState(false);

  // Pre-select from query params
  useEffect(() => {
    const leadId = searchParams.get("lead_id");
    const scenario = searchParams.get("scenario") as ScenarioType | null;

    if (scenario && SCENARIOS.some((s) => s.type === scenario)) {
      setSelectedScenario(scenario);
      if (!leadId) setStep(1);
    }

    if (leadId) {
      supabase
        .from("leads")
        .select("id, name, company, title, industry")
        .eq("id", leadId)
        .single()
        .then(({ data }) => {
          if (data) {
            setSelectedLead(data);
            if (scenario) setStep(3);
            else setStep(2);
          }
        });
    }
  }, []);

  // Fetch leads
  useEffect(() => {
    supabase
      .from("leads")
      .select("id, name, company, title, industry")
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        if (data) setLeads(data);
      });
  }, []);

  const filteredLeads = leads.filter(
    (lead) =>
      lead.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      lead.company.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  async function handleGeneratePersona() {
    if (!selectedLead) return;
    setGeneratingPersona(true);

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
        body: JSON.stringify({ lead_id: selectedLead.id }),
      });

      if (res.ok) {
        const data = (await res.json()) as PersonaResult;
        setPersona(data);
      }
    } finally {
      setGeneratingPersona(false);
    }
  }

  async function handleStartSession() {
    if (!selectedLead || !selectedScenario || !persona) return;
    setStartingSession(true);

    // Get user and org_id for session insert (required by RLS + NOT NULL)
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setStartingSession(false);
      return;
    }

    const { data: profile } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) {
      setStartingSession(false);
      return;
    }

    const { data: session } = await supabase
      .from("sessions")
      .insert({
        user_id: user.id,
        org_id: profile.org_id,
        persona_id: persona.id,
        scenario_type: selectedScenario,
        status: "active",
      })
      .select("id")
      .single();

    if (session) {
      router.push(`/simulate/${session.id}`);
    } else {
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
              className={`flex size-8 items-center justify-center rounded-full text-sm font-medium ${
                s < step
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
              {s === 1 ? "Select Lead" : s === 2 ? "Pick Scenario" : "Review & Start"}
            </span>
            {s < 3 && (
              <ArrowRight className="size-4 text-muted-foreground" />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Select Lead */}
      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Select a Lead</CardTitle>
            <CardDescription>
              Choose the lead you want to practice selling to.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              placeholder="Search leads by name or company..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {filteredLeads.map((lead) => (
                <div
                  key={lead.id}
                  className={`flex cursor-pointer items-center justify-between rounded-lg border p-3 transition-colors hover:bg-accent ${
                    selectedLead?.id === lead.id
                      ? "border-primary bg-primary/5"
                      : ""
                  }`}
                  onClick={() => setSelectedLead(lead)}
                >
                  <div>
                    <p className="font-medium">{lead.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {lead.title ? `${lead.title} at ` : ""}
                      {lead.company}
                      {lead.industry ? ` · ${lead.industry}` : ""}
                    </p>
                  </div>
                  {selectedLead?.id === lead.id && (
                    <Check className="size-5 text-primary" />
                  )}
                </div>
              ))}
              {filteredLeads.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No leads found. Import leads first.
                </p>
              )}
            </div>
            <div className="flex justify-end">
              <Button
                onClick={() => setStep(2)}
                disabled={!selectedLead}
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
                    className={`cursor-pointer rounded-lg border p-4 transition-colors hover:bg-accent ${
                      isSelected ? "border-primary bg-primary/5" : ""
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
      {step === 3 && selectedLead && selectedScenario && (
        <Card>
          <CardHeader>
            <CardTitle>Review & Start</CardTitle>
            <CardDescription>
              Confirm your setup and generate the AI buyer persona.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Lead
                </p>
                <p className="mt-1 font-medium">{selectedLead.name}</p>
                <p className="text-sm text-muted-foreground">
                  {selectedLead.title ? `${selectedLead.title} at ` : ""}
                  {selectedLead.company}
                </p>
              </div>
              <div className="rounded-lg border p-4">
                <p className="text-xs font-medium uppercase text-muted-foreground">
                  Scenario
                </p>
                <p className="mt-1 font-medium">
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
                disabled={generatingPersona}
              >
                {generatingPersona ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Generating AI buyer persona...
                  </>
                ) : (
                  "Generate Persona"
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

            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep(2)}>
                <ArrowLeft className="mr-1 size-4" />
                Back
              </Button>
              <Button
                onClick={handleStartSession}
                disabled={!persona || startingSession}
              >
                {startingSession ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Starting...
                  </>
                ) : (
                  <>
                    <Mic className="mr-1 size-4" />
                    Start Session
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
