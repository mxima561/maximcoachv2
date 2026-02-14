import Link from "next/link";
import {
  Mic,
  Brain,
  Trophy,
  Database,
  Check,
  ArrowRight,
  Zap,
  Shield,
  BarChart3,
} from "lucide-react";

const FEATURES = [
  {
    icon: Mic,
    title: "Voice Simulation",
    description:
      "Practice with AI-powered prospects that sound and react like real buyers. Real-time voice conversations with Deepgram STT and ElevenLabs TTS.",
  },
  {
    icon: Brain,
    title: "AI Coaching",
    description:
      "Get scored across 5 key categories with personalized coaching tips after every session. Powered by Claude AI for nuanced feedback.",
  },
  {
    icon: Trophy,
    title: "Team Leaderboards",
    description:
      "Compete with teammates on weekly leaderboards. Challenge each other to head-to-head matches for friendly competition.",
  },
  {
    icon: Database,
    title: "CRM Integration",
    description:
      "Import real leads from Salesforce, HubSpot, or Google Sheets. Practice with personas built from actual prospect data.",
  },
] as const;

const GROWTH_FEATURES = [
  "Up to 50 sessions/month per rep",
  "5 scoring categories with coaching tips",
  "Team leaderboards",
  "Google Sheets lead import",
  "Clip sharing & team feed",
  "Email support",
];

const PRO_FEATURES = [
  "Unlimited sessions per rep",
  "Everything in Growth",
  "Salesforce & HubSpot integration",
  "Head-to-head challenges",
  "Custom scenarios",
  "Adaptive difficulty (ELO-based)",
  "Manager dashboard & analytics",
  "Priority support",
];

export default function LandingPage() {
  return (
    <div className="flex min-h-screen flex-col">
      {/* Nav */}
      <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <div className="flex items-center gap-2">
            <Zap className="size-6 text-primary" />
            <span className="text-lg font-bold">MaximaCoach</span>
          </div>
          <nav className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-sm text-muted-foreground hover:text-foreground">
              Features
            </a>
            <a href="#pricing" className="text-sm text-muted-foreground hover:text-foreground">
              Pricing
            </a>
            <Link
              href="/auth/login"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Sign In
            </Link>
            <Link
              href="/auth/signup"
              className="inline-flex h-9 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start Free Trial
            </Link>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden py-24 md:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(45%_40%_at_50%_60%,hsl(var(--primary)/0.12),transparent)]" />
        <div className="mx-auto max-w-4xl px-4 text-center">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border bg-background px-4 py-1.5 text-sm">
            <Shield className="size-3.5 text-primary" />
            14-day free trial — 5 sessions included
          </div>
          <h1 className="text-4xl font-bold tracking-tight md:text-6xl">
            Train your sales team with{" "}
            <span className="text-primary">AI-powered</span> voice simulations
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground">
            Practice cold calls, handle objections, and close deals with
            realistic AI prospects. Get scored in real time with personalized
            coaching to improve every rep on your team.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/auth/signup"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-primary px-6 text-base font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Start Free Trial
              <ArrowRight className="size-4" />
            </Link>
            <a
              href="#features"
              className="inline-flex h-12 items-center gap-2 rounded-lg border px-6 text-base font-medium transition-colors hover:bg-accent"
            >
              Learn More
            </a>
          </div>

          {/* Animated orb preview placeholder */}
          <div className="mx-auto mt-16 flex size-32 items-center justify-center rounded-full bg-gradient-to-br from-primary/20 via-primary/10 to-transparent">
            <div className="flex size-24 items-center justify-center rounded-full bg-gradient-to-br from-primary/30 to-primary/5">
              <div className="size-16 animate-pulse rounded-full bg-primary/20" />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="border-t py-24">
        <div className="mx-auto max-w-6xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Everything you need to coach your team
            </h2>
            <p className="mt-3 text-muted-foreground">
              From realistic simulations to detailed analytics — all in one
              platform.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2">
            {FEATURES.map((feature) => {
              const Icon = feature.icon;
              return (
                <div key={feature.title} className="flex gap-4">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-primary/10">
                    <Icon className="size-6 text-primary" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold">{feature.title}</h3>
                    <p className="mt-1 text-muted-foreground">
                      {feature.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Stats */}
          <div className="mt-20 grid gap-8 rounded-2xl border bg-muted/30 p-8 md:grid-cols-3">
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">5</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Scoring Categories
              </p>
            </div>
            <div className="text-center">
              <p className="text-4xl font-bold text-primary">&lt;1s</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Voice Latency
              </p>
            </div>
            <div className="text-center">
              <p className="flex items-center justify-center gap-1 text-4xl font-bold text-primary">
                <BarChart3 className="size-8" />
                ELO
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Adaptive Difficulty
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t py-24">
        <div className="mx-auto max-w-5xl px-4">
          <div className="text-center">
            <h2 className="text-3xl font-bold tracking-tight">
              Simple, transparent pricing
            </h2>
            <p className="mt-3 text-muted-foreground">
              Start with a 14-day free trial. No credit card required.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-2">
            {/* Growth Plan */}
            <div className="rounded-2xl border p-8">
              <h3 className="text-lg font-semibold">Growth</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                For small teams getting started with AI coaching.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$69</span>
                <span className="text-muted-foreground">/rep/month</span>
              </div>
              <Link
                href="/auth/signup?plan=growth"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-accent"
              >
                Start Free Trial
              </Link>
              <ul className="mt-8 space-y-3">
                {GROWTH_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Pro Plan */}
            <div className="relative rounded-2xl border-2 border-primary p-8">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold">Pro</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                For growing teams that need advanced features and unlimited
                practice.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$99</span>
                <span className="text-muted-foreground">/rep/month</span>
              </div>
              <Link
                href="/auth/signup?plan=pro"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              >
                Start Free Trial
              </Link>
              <ul className="mt-8 space-y-3">
                {PRO_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-2">
            <Zap className="size-5 text-primary" />
            <span className="font-semibold">MaximaCoach</span>
          </div>
          <div className="flex gap-6 text-sm text-muted-foreground">
            <a href="#" className="hover:text-foreground">
              Privacy
            </a>
            <a href="#" className="hover:text-foreground">
              Terms
            </a>
            <a href="#" className="hover:text-foreground">
              Contact
            </a>
          </div>
          <p className="text-sm text-muted-foreground">
            &copy; {new Date().getFullYear()} MaximaCoach. All rights reserved.
          </p>
        </div>
      </footer>
    </div>
  );
}
