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
      "Get scored across 5 key categories with personalized coaching tips after every session. Powered by AI for nuanced feedback.",
  },
  {
    icon: Trophy,
    title: "Team Leaderboards",
    description:
      "Compete with teammates on weekly leaderboards. Challenge each other to head-to-head matches for friendly competition.",
  },
  {
    icon: Database,
    title: "Scenario Library",
    description:
      "Run focused training with built-in and custom sales scenarios. Configure prospect context in seconds and start practicing immediately.",
  },
] as const;

const STARTER_FEATURES = [
  "Up to 5 reps",
  "15 sessions/rep/month (75 pool)",
  "Core scenarios (cold call, objection handling, discovery, closing)",
  "Basic rep dashboard with scoring",
  "Animated orb visualization",
  "Email support",
];

const GROWTH_FEATURES = [
  "Up to 15 reps",
  "15 sessions/rep/month (225 pool)",
  "Everything in Starter",
  "Weekly leaderboards",
  "Team challenges",
  "Manager dashboard with team analytics",
  "Clip sharing & team feed",
  "Slack notifications",
  "Priority support",
];

const SCALE_FEATURES = [
  "Up to 30 reps",
  "20 sessions/rep/month (600 pool)",
  "Everything in Growth",
  "Head-to-head mode",
  "Custom scenario builder",
  "Optional CRM integration (HubSpot, Salesforce)",
  "Advanced analytics & reporting",
  "Dedicated success manager",
];

const ENTERPRISE_FEATURES = [
  "30+ reps (negotiated)",
  "Unlimited sessions",
  "Everything in Scale",
  "Company-wide tournaments",
  "SSO/SAML",
  "Custom persona library",
  "API access",
  "Quarterly business reviews",
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
              href="/login"
              className="text-sm font-medium text-foreground hover:text-primary"
            >
              Sign In
            </Link>
            <Link
              href="/signup"
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
              href="/signup"
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

          <div className="mt-16 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
            {/* Starter Plan */}
            <div className="rounded-2xl border p-6">
              <h3 className="text-lg font-semibold">Starter</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Small sales teams testing AI training.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$299</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Link
                href="/signup?plan=starter"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-accent"
              >
                Start Free Trial
              </Link>
              <ul className="mt-8 space-y-3">
                {STARTER_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Growth Plan */}
            <div className="relative rounded-2xl border-2 border-primary p-6">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                Most Popular
              </div>
              <h3 className="text-lg font-semibold">Growth</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Growing teams that saw results on Starter.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$599</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Link
                href="/signup?plan=growth"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md bg-primary text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
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

            {/* Scale Plan */}
            <div className="rounded-2xl border p-6">
              <h3 className="text-lg font-semibold">Scale</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Full sales floors with advanced needs.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">$999</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <Link
                href="/signup?plan=scale"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-accent"
              >
                Start Free Trial
              </Link>
              <ul className="mt-8 space-y-3">
                {SCALE_FEATURES.map((feature) => (
                  <li key={feature} className="flex items-start gap-3 text-sm">
                    <Check className="mt-0.5 size-4 shrink-0 text-green-500" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>

            {/* Enterprise Plan */}
            <div className="rounded-2xl border p-6">
              <h3 className="text-lg font-semibold">Enterprise</h3>
              <p className="mt-1 text-sm text-muted-foreground">
                Multi-location orgs, franchise teams.
              </p>
              <div className="mt-6">
                <span className="text-4xl font-bold">Custom</span>
                <span className="text-muted-foreground">/month</span>
              </div>
              <a
                href="mailto:sales@maximacoach.com"
                className="mt-6 flex h-10 w-full items-center justify-center rounded-md border text-sm font-medium transition-colors hover:bg-accent"
              >
                Contact Sales
              </a>
              <ul className="mt-8 space-y-3">
                {ENTERPRISE_FEATURES.map((feature) => (
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
