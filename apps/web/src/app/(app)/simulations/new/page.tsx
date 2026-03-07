"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  MicOff,
  Clock,
  AlertCircle,
  RotateCcw,
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
import { motion } from "framer-motion";
import { spring, FadeIn, ScaleOnHover } from "@/components/motion";

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
type MicPermission = "pending" | "granted" | "denied";

interface SetupStep {
  label: string;
  doneLabel: string;
  status: "pending" | "loading" | "done" | "error";
}

const SCENARIOS: {
  type: ScenarioType;
  name: string;
  description: string;
  icon: typeof Phone;
  difficulty: string;
  estimatedMinutes: number;
  gradient: string;
  iconColor: string;
}[] = [
    {
      type: "cold_call",
      name: "Cold Call",
      description: "Practice cold outreach and grabbing attention quickly.",
      icon: Phone,
      difficulty: "Medium",
      estimatedMinutes: 8,
      gradient: "from-blue-500/10 to-blue-500/5",
      iconColor: "text-blue-500",
    },
    {
      type: "discovery",
      name: "Discovery",
      description: "Uncover pain points with strategic questioning.",
      icon: Search,
      difficulty: "Medium",
      estimatedMinutes: 12,
      gradient: "from-emerald-500/10 to-emerald-500/5",
      iconColor: "text-emerald-500",
    },
    {
      type: "objection_handling",
      name: "Objection Handling",
      description: "Navigate price, competitor, and timing objections.",
      icon: ShieldAlert,
      difficulty: "Hard",
      estimatedMinutes: 10,
      gradient: "from-orange-500/10 to-orange-500/5",
      iconColor: "text-orange-500",
    },
    {
      type: "closing",
      name: "Closing",
      description: "Secure commitment and handle last-minute hesitation.",
      icon: Handshake,
      difficulty: "Hard",
      estimatedMinutes: 10,
      gradient: "from-violet-500/10 to-violet-500/5",
      iconColor: "text-violet-500",
    },
  ];

const STEP_LABELS = ["Prospect Profile", "Pick Scenario", "Mic Check", "Setting Up"];

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
  const [selectedScenario, setSelectedScenario] = useState<ScenarioType | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [micPermission, setMicPermission] = useState<MicPermission>("pending");
  const [audioLevel, setAudioLevel] = useState(0);
  const [micTestPassed, setMicTestPassed] = useState(false);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const passedTimerRef = useRef<number>(0);

  const [setupSteps, setSetupSteps] = useState<SetupStep[]>([
    { label: "Checking account...", doneLabel: "Account verified", status: "pending" },
    { label: "Creating AI persona...", doneLabel: "Persona ready", status: "pending" },
    { label: "Preparing call session...", doneLabel: "Session ready", status: "pending" },
  ]);
  const [setupError, setSetupError] = useState<string | null>(null);
  const setupStartedRef = useRef(false);

  const profileReady = Boolean(profile.company.trim());

  useEffect(() => {
    const scenario = searchParams.get("scenario") as ScenarioType | null;
    if (scenario && SCENARIOS.some((s) => s.type === scenario)) {
      setSelectedScenario(scenario);
      if (profileReady) setStep(2);
    }
  }, [searchParams, profileReady]);

  // ── Mic Check Logic ────────────────────────────────────────

  const startMicCheck = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      setMicPermission("granted");

      const ctx = new AudioContext();
      audioContextRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let aboveThresholdMs = 0;
      let lastTime = performance.now();

      function tick() {
        analyser.getByteFrequencyData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          sum += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sum / dataArray.length);
        const level = Math.min(100, Math.round((rms / 128) * 100));
        setAudioLevel(level);

        const now = performance.now();
        const dt = now - lastTime;
        lastTime = now;

        if (level > 15) {
          aboveThresholdMs += dt;
          if (aboveThresholdMs >= 500) {
            setMicTestPassed(true);
            passedTimerRef.current = 1;
          }
        } else {
          aboveThresholdMs = Math.max(0, aboveThresholdMs - dt * 0.5);
        }

        animFrameRef.current = requestAnimationFrame(tick);
      }

      animFrameRef.current = requestAnimationFrame(tick);
    } catch {
      setMicPermission("denied");
    }
  }, []);

  useEffect(() => {
    if (step === 3 && micPermission === "pending") {
      startMicCheck();
    }
  }, [step, micPermission, startMicCheck]);

  // Stop mic analysis when leaving step 3
  useEffect(() => {
    if (step !== 3 && animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = 0;
    }
  }, [step]);

  useEffect(() => {
    return () => {
      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);

  // ── Setup Logic (Step 4) ───────────────────────────────────

  const updateSetupStep = useCallback((index: number, status: SetupStep["status"]) => {
    setSetupSteps((prev) => prev.map((s, i) => (i === index ? { ...s, status } : s)));
  }, []);

  const runSetup = useCallback(async () => {
    if (setupStartedRef.current) return;
    setupStartedRef.current = true;
    setSetupError(null);
    setSetupSteps([
      { label: "Checking account...", doneLabel: "Account verified", status: "pending" },
      { label: "Creating AI persona...", doneLabel: "Persona ready", status: "pending" },
      { label: "Preparing call session...", doneLabel: "Session ready", status: "pending" },
    ]);

    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const authHeaders: Record<string, string> = { "Content-Type": "application/json" };
      if (authSession?.access_token) {
        authHeaders.Authorization = `Bearer ${authSession.access_token}`;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("You must be logged in to start a session.");

      const { data: orgUsers } = await supabase
        .from("organization_users")
        .select("organization_id")
        .eq("user_id", user.id)
        .limit(1);

      if (!orgUsers || orgUsers.length === 0) {
        throw new Error("You must belong to an organization to start a session.");
      }
      const org_id = orgUsers[0].organization_id;

      let ipAddress: string | undefined;
      try {
        const ipRes = await fetch("https://api.ipify.org?format=json");
        const ipData = await ipRes.json();
        ipAddress = ipData.ip;
      } catch { /* optional */ }

      const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

      updateSetupStep(0, "loading");
      updateSetupStep(1, "loading");

      const [trialRes, personaRes] = await Promise.all([
        fetch(`${apiUrl}/api/sessions/check-trial`, {
          method: "POST",
          headers: authHeaders,
          body: JSON.stringify(ipAddress ? { ip_address: ipAddress } : {}),
        }),
        fetch(`${apiUrl}/api/personas/generate`, {
          method: "POST",
          headers: authHeaders,
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
        }),
      ]);

      const trialData = await trialRes.json();
      if (!trialData.allowed) {
        updateSetupStep(0, "error");
        const messages: Record<string, string> = {
          trial_expired: "Your trial has expired. Please upgrade to continue.",
          trial_admin_only: "Only admins can create sessions during the trial period.",
          ip_limit_reached: "Trial session limit reached. Please upgrade to continue.",
          upgrade_required: "Please upgrade your plan to create sessions.",
          no_organization: "You must belong to an organization.",
        };
        throw new Error(messages[trialData.reason as string] || "Cannot create session at this time.");
      }
      updateSetupStep(0, "done");

      if (!personaRes.ok) {
        updateSetupStep(1, "error");
        const errData = await personaRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to generate persona.");
      }
      const personaData = (await personaRes.json()) as PersonaResult;
      updateSetupStep(1, "done");

      updateSetupStep(2, "loading");
      const sessionRes = await fetch(`${apiUrl}/api/sessions/create`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          org_id,
          persona_id: personaData.id,
          scenario_type: selectedScenario,
          ...(ipAddress ? { ip_address: ipAddress } : {}),
        }),
      });

      if (!sessionRes.ok) {
        updateSetupStep(2, "error");
        const errData = await sessionRes.json().catch(() => ({}));
        throw new Error(errData.message || "Failed to create session.");
      }
      const sessionData = await sessionRes.json();
      updateSetupStep(2, "done");

      if (micStreamRef.current) {
        micStreamRef.current.getTracks().forEach((t) => t.stop());
        micStreamRef.current = null;
      }

      await new Promise((r) => setTimeout(r, 600));
      router.push(`/simulate/${sessionData.id}`);
    } catch (err: unknown) {
      console.error("Setup error:", err);
      setSetupError(err instanceof Error ? err.message : "An error occurred during setup.");
      setupStartedRef.current = false;
    }
  }, [supabase, selectedScenario, profile, updateSetupStep, router]);

  useEffect(() => {
    if (step === 4) {
      runSetup();
    }
  }, [step, runSetup]);

  // ── Render ─────────────────────────────────────────────────

  const completedSteps = setupSteps.filter((s) => s.status === "done").length;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <FadeIn>
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="sm" asChild className="rounded-lg">
            <Link href="/dashboard">
              <ArrowLeft className="mr-1 size-4" />
              Back
            </Link>
          </Button>
          <h1 className="text-2xl font-bold tracking-tight">
            New Simulation
          </h1>
        </div>
      </FadeIn>

      {/* Step indicator */}
      <FadeIn delay={0.05}>
        <div className="flex items-center gap-1">
          {STEP_LABELS.map((label, i) => {
            const s = i + 1;
            const isComplete = s < step;
            const isCurrent = s === step;
            return (
              <div key={s} className="flex flex-1 items-center gap-1">
                <div className="flex flex-1 flex-col items-center gap-1.5">
                  <div className="flex w-full items-center gap-1">
                    <motion.div
                      className={`flex size-8 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                        isComplete
                          ? "bg-primary text-primary-foreground"
                          : isCurrent
                            ? "bg-primary text-primary-foreground shadow-md shadow-primary/25"
                            : "bg-muted text-muted-foreground"
                      }`}
                      animate={isCurrent ? { scale: [1, 1.05, 1] } : {}}
                      transition={{ duration: 1.5, repeat: Infinity }}
                    >
                      {isComplete ? <Check className="size-3.5" /> : s}
                    </motion.div>
                    {s < STEP_LABELS.length && (
                      <div className="flex-1 h-0.5 rounded-full bg-muted overflow-hidden">
                        <motion.div
                          className="h-full bg-primary"
                          initial={{ width: 0 }}
                          animate={{ width: isComplete ? "100%" : "0%" }}
                          transition={{ duration: 0.4 }}
                        />
                      </div>
                    )}
                  </div>
                  <span className={`text-[11px] ${isCurrent ? "font-semibold text-primary" : "text-muted-foreground"}`}>
                    {label}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </FadeIn>

      {error && step < 4 && (
        <motion.div
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive"
        >
          {error}
        </motion.div>
      )}

      {/* ─── Step 1: Prospect Profile ─── */}
        {step === 1 && (
          <motion.div
            key="step1"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring.gentle}
          >
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Building2 className="size-5 text-primary" />
                  Prospect Profile
                </CardTitle>
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
                      onChange={(e) => setProfile((prev) => ({ ...prev, name: e.target.value }))}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-company">Company *</Label>
                    <Input
                      id="prospect-company"
                      placeholder="Acme Corp"
                      value={profile.company}
                      onChange={(e) => setProfile((prev) => ({ ...prev, company: e.target.value }))}
                      className="rounded-lg"
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
                      onChange={(e) => setProfile((prev) => ({ ...prev, title: e.target.value }))}
                      className="rounded-lg"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="prospect-industry">Industry</Label>
                    <Input
                      id="prospect-industry"
                      placeholder="SaaS"
                      value={profile.industry}
                      onChange={(e) => setProfile((prev) => ({ ...prev, industry: e.target.value }))}
                      className="rounded-lg"
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
                    onChange={(e) => setProfile((prev) => ({ ...prev, primaryChallenge: e.target.value }))}
                    className="rounded-lg"
                  />
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!profileReady} className="rounded-lg gap-1">
                    Next: Pick Scenario
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step 2: Pick Scenario ─── */}
        {step === 2 && (
          <motion.div
            key="step2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring.gentle}
          >
            <Card className="overflow-hidden">
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
                      <ScaleOnHover key={scenario.type}>
                        <div
                          className={`cursor-pointer rounded-xl border p-4 transition-all ${
                            isSelected
                              ? "border-primary bg-primary/5 shadow-sm shadow-primary/10"
                              : "hover:border-primary/30 hover:bg-accent/50"
                          }`}
                          onClick={() => setSelectedScenario(scenario.type)}
                        >
                          <div className="flex items-center gap-3">
                            <div className={`flex size-10 items-center justify-center rounded-xl bg-gradient-to-br ${scenario.gradient}`}>
                              <Icon className={`size-5 ${scenario.iconColor}`} />
                            </div>
                            <div className="flex-1">
                              <span className="font-semibold text-sm">{scenario.name}</span>
                            </div>
                            {isSelected && (
                              <motion.div
                                initial={{ scale: 0 }}
                                animate={{ scale: 1 }}
                                transition={spring.bouncy}
                              >
                                <Check className="size-5 text-primary" />
                              </motion.div>
                            )}
                          </div>
                          <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                            {scenario.description}
                          </p>
                          <div className="mt-3 flex items-center gap-2">
                            <Badge
                              variant={scenario.difficulty === "Hard" ? "destructive" : "secondary"}
                              className="text-[10px] rounded-full"
                            >
                              {scenario.difficulty}
                            </Badge>
                            <span className="flex items-center gap-1 text-[11px] text-muted-foreground">
                              <Clock className="size-3" />~{scenario.estimatedMinutes}m
                            </span>
                          </div>
                        </div>
                      </ScaleOnHover>
                    );
                  })}
                </div>
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)} className="rounded-lg">
                    <ArrowLeft className="mr-1 size-4" />
                    Back
                  </Button>
                  <Button onClick={() => setStep(3)} disabled={!selectedScenario} className="rounded-lg gap-1">
                    Next: Mic Check
                    <ArrowRight className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step 3: Mic Check ─── */}
        {step === 3 && (
          <motion.div
            key="step3"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={spring.gentle}
          >
            <Card className="overflow-hidden">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mic className="size-5 text-primary" />
                  Mic Check
                </CardTitle>
                <CardDescription>
                  Make sure your microphone is working before the call.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {micPermission === "pending" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <Loader2 className="size-8 animate-spin text-primary" />
                    <p className="text-sm text-muted-foreground">
                      Requesting microphone access...
                    </p>
                  </div>
                )}

                {micPermission === "denied" && (
                  <div className="flex flex-col items-center gap-4 py-8">
                    <div className="flex size-18 items-center justify-center rounded-2xl bg-destructive/10">
                      <MicOff className="size-9 text-destructive" />
                    </div>
                    <div className="text-center">
                      <p className="font-semibold text-destructive">Microphone access denied</p>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Please allow microphone access in your browser settings and reload.
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => window.location.reload()} className="rounded-lg">
                      <RotateCcw className="mr-2 size-4" />
                      Reload Page
                    </Button>
                  </div>
                )}

                {micPermission === "granted" && (
                  <div className="flex flex-col items-center gap-6 py-6">
                    {/* Audio level meter - 5 bars with animation */}
                    <div className="flex items-end gap-2" style={{ height: 72 }}>
                      {[0, 1, 2, 3, 4].map((i) => {
                        const threshold = (i + 1) * 20;
                        const active = audioLevel >= threshold;
                        const barHeight = 20 + i * 13;
                        return (
                          <motion.div
                            key={i}
                            className={`w-5 rounded-md transition-colors duration-100 ${
                              active
                                ? micTestPassed
                                  ? "bg-gradient-to-t from-emerald-500 to-emerald-400"
                                  : "bg-gradient-to-t from-primary to-primary/70"
                                : "bg-muted"
                            }`}
                            animate={{
                              height: active ? barHeight + 4 : barHeight,
                              scaleX: active ? 1.05 : 1,
                            }}
                            transition={{ duration: 0.1 }}
                            style={{ height: barHeight }}
                          />
                        );
                      })}
                    </div>

                    <p className="text-sm text-muted-foreground">
                      {micTestPassed
                        ? "Your microphone is working!"
                        : "Say something to test your mic..."}
                    </p>

                    {micTestPassed && (
                      <motion.div
                        initial={{ scale: 0.5, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        transition={spring.bouncy}
                      >
                        <Badge variant="outline" className="gap-1.5 rounded-full border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-400 px-3 py-1">
                          <Check className="size-3.5" />
                          Mic working
                        </Badge>
                      </motion.div>
                    )}
                  </div>
                )}

                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(2)} className="rounded-lg">
                    <ArrowLeft className="mr-1 size-4" />
                    Back
                  </Button>
                  <Button
                    onClick={() => setStep(4)}
                    disabled={!micTestPassed}
                    className="rounded-lg gap-1 shadow-lg shadow-primary/20"
                  >
                    <Mic className="size-4" />
                    Mic sounds good — Start Call
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* ─── Step 4: Setting Up Call ─── */}
        {step === 4 && (
          <motion.div
            key="step4"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={spring.gentle}
          >
            <Card className="overflow-hidden">
              <CardContent className="flex flex-col items-center gap-8 py-14">
                {/* Animated orb */}
                <div className="relative flex items-center justify-center">
                  <motion.div
                    className="absolute size-40 rounded-full border border-dashed border-primary/20"
                    animate={{ rotate: 360 }}
                    transition={{ duration: 8, repeat: Infinity, ease: "linear" }}
                  />
                  <motion.div
                    className="absolute size-32 rounded-full bg-primary/5 blur-2xl"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                  />
                  <motion.div
                    className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.60_0.26_310)] shadow-xl shadow-primary/20"
                    animate={setupError ? {} : { scale: [1, 1.08, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity }}
                  >
                    {setupError ? (
                      <AlertCircle className="size-10 text-white" />
                    ) : (
                      <Loader2 className="size-10 animate-spin text-white" />
                    )}
                  </motion.div>
                </div>

                <h2 className="text-xl font-bold">
                  {setupError ? "Setup Failed" : "Setting up your call..."}
                </h2>

                {/* Status checklist */}
                <div className="w-full max-w-sm space-y-2.5">
                  {setupSteps.map((s, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.1, ...spring.gentle }}
                      className={`flex items-center gap-3 rounded-xl border px-4 py-3.5 transition-all ${
                        s.status === "done"
                          ? "border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950"
                          : s.status === "error"
                            ? "border-destructive/30 bg-destructive/5"
                            : s.status === "loading"
                              ? "border-primary/20 bg-primary/5"
                              : "border-muted bg-muted/20"
                      }`}
                    >
                      {s.status === "done" ? (
                        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={spring.bouncy}>
                          <Check className="size-5 text-emerald-600" />
                        </motion.div>
                      ) : s.status === "loading" ? (
                        <Loader2 className="size-5 animate-spin text-primary" />
                      ) : s.status === "error" ? (
                        <AlertCircle className="size-5 text-destructive" />
                      ) : (
                        <div className="size-5 rounded-full border-2 border-muted-foreground/20" />
                      )}
                      <span
                        className={`text-sm ${
                          s.status === "done"
                            ? "font-medium text-emerald-700 dark:text-emerald-400"
                            : s.status === "error"
                              ? "font-medium text-destructive"
                              : s.status === "loading"
                                ? "font-medium text-primary"
                                : "text-muted-foreground"
                        }`}
                      >
                        {s.status === "done" ? s.doneLabel : s.label}
                      </span>
                    </motion.div>
                  ))}
                </div>

                {/* Progress bar */}
                {!setupError && (
                  <div className="h-2 w-full max-w-sm overflow-hidden rounded-full bg-muted">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-[oklch(0.60_0.26_310)]"
                      initial={{ width: 0 }}
                      animate={{ width: `${(completedSteps / setupSteps.length) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                )}

                {setupError && (
                  <div className="flex flex-col items-center gap-3">
                    <p className="text-sm text-destructive">{setupError}</p>
                    <Button
                      onClick={() => {
                        setupStartedRef.current = false;
                        runSetup();
                      }}
                      variant="outline"
                      className="rounded-lg"
                    >
                      <RotateCcw className="mr-2 size-4" />
                      Try Again
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        )}
    </div>
  );
}
