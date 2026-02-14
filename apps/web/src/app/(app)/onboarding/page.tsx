"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Building2,
  Users,
  Database,
  Mic,
  ChevronRight,
  ChevronLeft,
  Check,
  X,
  Plus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { createClient } from "@/lib/supabase/client";

const STEPS = [
  { label: "Organization", icon: Building2 },
  { label: "Team", icon: Users },
  { label: "Data", icon: Database },
  { label: "First Sim", icon: Mic },
] as const;

const INDUSTRIES = [
  "SaaS / Software",
  "Financial Services",
  "Healthcare",
  "Real Estate",
  "Insurance",
  "Manufacturing",
  "Retail / E-Commerce",
  "Professional Services",
  "Other",
];

const TEAM_SIZES = [
  { value: "1-5", label: "1-5 reps" },
  { value: "6-20", label: "6-20 reps" },
  { value: "21-50", label: "21-50 reps" },
  { value: "51+", label: "51+ reps" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Step 1: Org
  const [orgName, setOrgName] = useState("");
  const [industry, setIndustry] = useState("");
  const [teamSize, setTeamSize] = useState("");

  // Step 2: Invite
  const [emails, setEmails] = useState<string[]>([]);
  const [emailInput, setEmailInput] = useState("");

  function addEmail() {
    const email = emailInput.trim();
    if (email && email.includes("@") && !emails.includes(email)) {
      setEmails([...emails, email]);
      setEmailInput("");
    }
  }

  function removeEmail(email: string) {
    setEmails(emails.filter((e) => e !== email));
  }

  // Step 3: Data source
  const [dataSource, setDataSource] = useState<
    "salesforce" | "hubspot" | "sheets" | "skip" | null
  >(null);

  async function handleComplete() {
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Create or update org
    const { data: profile } = await supabase
      .from("users")
      .select("org_id")
      .eq("id", user.id)
      .single();

    let orgId = profile?.org_id;

    if (!orgId) {
      const { data: newOrg } = await supabase
        .from("organizations")
        .insert({ name: orgName })
        .select("id")
        .single();

      if (newOrg) {
        orgId = newOrg.id;
        await supabase
          .from("users")
          .update({ org_id: orgId, role: "admin" })
          .eq("id", user.id);
      }
    } else {
      await supabase
        .from("organizations")
        .update({ name: orgName })
        .eq("id", orgId);
    }

    // Mark onboarding complete
    await supabase
      .from("users")
      .update({ onboarding_completed: true } as Record<string, unknown>)
      .eq("id", user.id);

    setSaving(false);
    router.push("/simulations/new?scenario=cold_call");
  }

  function canNext(): boolean {
    if (step === 0) return orgName.trim().length > 0;
    return true; // steps 1-3 can be skipped
  }

  return (
    <div className="mx-auto max-w-2xl space-y-8 py-8">
      {/* Progress indicator */}
      <div className="flex items-center justify-center gap-2">
        {STEPS.map((s, i) => {
          const Icon = s.icon;
          const isActive = i === step;
          const isDone = i < step;

          return (
            <div key={s.label} className="flex items-center gap-2">
              <div
                className={`flex size-10 items-center justify-center rounded-full border-2 transition-colors ${
                  isActive
                    ? "border-primary bg-primary text-primary-foreground"
                    : isDone
                      ? "border-green-500 bg-green-500 text-white"
                      : "border-muted bg-muted text-muted-foreground"
                }`}
              >
                {isDone ? (
                  <Check className="size-4" />
                ) : (
                  <Icon className="size-4" />
                )}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`h-0.5 w-8 ${isDone ? "bg-green-500" : "bg-muted"}`}
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="text-center">
        <h1 className="text-2xl font-semibold">
          {step === 0 && "Set up your organization"}
          {step === 1 && "Invite your team"}
          {step === 2 && "Connect your data"}
          {step === 3 && "Start your first simulation"}
        </h1>
        <p className="mt-1 text-muted-foreground">
          {step === 0 && "Tell us about your team so we can personalize your experience."}
          {step === 1 && "Add your sales reps to start coaching together."}
          {step === 2 && "Import leads to create realistic practice scenarios."}
          {step === 3 && "You're all set! Jump into a cold call simulation."}
        </p>
      </div>

      {/* Step 1: Organization setup */}
      {step === 0 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="space-y-2">
              <Label htmlFor="orgName">Organization Name</Label>
              <Input
                id="orgName"
                placeholder="Acme Corp"
                value={orgName}
                onChange={(e) => setOrgName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Industry</Label>
              <Select value={industry} onValueChange={setIndustry}>
                <SelectTrigger>
                  <SelectValue placeholder="Select industry" />
                </SelectTrigger>
                <SelectContent>
                  {INDUSTRIES.map((ind) => (
                    <SelectItem key={ind} value={ind}>
                      {ind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Team Size</Label>
              <Select value={teamSize} onValueChange={setTeamSize}>
                <SelectTrigger>
                  <SelectValue placeholder="Select team size" />
                </SelectTrigger>
                <SelectContent>
                  {TEAM_SIZES.map((ts) => (
                    <SelectItem key={ts.value} value={ts.value}>
                      {ts.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Step 2: Invite team */}
      {step === 1 && (
        <Card>
          <CardContent className="space-y-4 pt-6">
            <div className="flex gap-2">
              <Input
                placeholder="teammate@company.com"
                type="email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addEmail();
                  }
                }}
              />
              <Button variant="outline" onClick={addEmail}>
                <Plus className="mr-1 size-4" />
                Add
              </Button>
            </div>

            {emails.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {emails.map((email) => (
                  <Badge
                    key={email}
                    variant="secondary"
                    className="gap-1 py-1.5 pl-3 pr-1.5"
                  >
                    {email}
                    <button
                      onClick={() => removeEmail(email)}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted"
                    >
                      <X className="size-3" />
                    </button>
                  </Badge>
                ))}
              </div>
            )}

            {emails.length === 0 && (
              <p className="py-4 text-center text-sm text-muted-foreground">
                No invites added yet. You can skip this step and add teammates
                later.
              </p>
            )}
          </CardContent>
        </Card>
      )}

      {/* Step 3: Data source */}
      {step === 2 && (
        <div className="grid gap-4 sm:grid-cols-2">
          {(
            [
              {
                key: "salesforce" as const,
                name: "Salesforce",
                desc: "Connect your Salesforce CRM to import contacts and deals.",
              },
              {
                key: "hubspot" as const,
                name: "HubSpot",
                desc: "Connect HubSpot CRM to import contacts.",
              },
              {
                key: "sheets" as const,
                name: "Google Sheets",
                desc: "Import leads from a Google Sheets spreadsheet.",
              },
              {
                key: "skip" as const,
                name: "Skip for now",
                desc: "Use sample leads to get started.",
              },
            ] as const
          ).map((option) => (
            <Card
              key={option.key}
              className={`cursor-pointer transition-all ${
                dataSource === option.key
                  ? "border-primary ring-2 ring-primary/20"
                  : "hover:border-primary/50"
              }`}
              onClick={() => setDataSource(option.key)}
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{option.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>{option.desc}</CardDescription>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Step 4: First simulation prompt */}
      {step === 3 && (
        <Card className="border-primary/30 bg-primary/5">
          <CardContent className="space-y-4 py-8 text-center">
            <div className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary/10">
              <Mic className="size-8 text-primary" />
            </div>
            <h2 className="text-xl font-semibold">You&apos;re all set!</h2>
            <p className="text-muted-foreground">
              Jump into a cold call simulation with a sample lead. Practice your
              opening, handle objections, and get scored by AI in real time.
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              <Badge variant="outline">Cold Call Scenario</Badge>
              <Badge variant="outline">AI-Generated Persona</Badge>
              <Badge variant="outline">~8 min session</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="ghost"
          onClick={() => setStep(Math.max(0, step - 1))}
          disabled={step === 0}
        >
          <ChevronLeft className="mr-1 size-4" />
          Back
        </Button>

        <span className="text-sm text-muted-foreground">
          Step {step + 1} of {STEPS.length}
        </span>

        {step < STEPS.length - 1 ? (
          <div className="flex gap-2">
            {step > 0 && (
              <Button
                variant="ghost"
                onClick={() => setStep(step + 1)}
              >
                Skip
              </Button>
            )}
            <Button
              onClick={() => setStep(step + 1)}
              disabled={!canNext()}
            >
              Next
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        ) : (
          <Button onClick={handleComplete} disabled={saving}>
            {saving ? "Setting up..." : "Start Your First Simulation"}
            <ChevronRight className="ml-1 size-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
