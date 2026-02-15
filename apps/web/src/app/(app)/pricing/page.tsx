import { PLAN_DETAILS } from "@maxima/shared";
import Link from "next/link";

export default function PricingPage() {
  const plans = ["starter", "growth", "scale", "enterprise"] as const;

  return (
    <div className="container mx-auto px-4 py-16">
      <div className="mb-12 text-center">
        <h1 className="mb-4 text-4xl font-bold tracking-tight">
          Choose Your Plan
        </h1>
        <p className="text-lg text-muted-foreground">
          Start with a 14-day trial, then upgrade to unlock unlimited sessions
        </p>
      </div>

      <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-4">
        {plans.map((planKey) => {
          const plan = PLAN_DETAILS[planKey];
          const isRecommended = "recommended" in plan && plan.recommended;

          return (
            <div
              key={planKey}
              className={`relative rounded-lg border-2 p-6 ${
                isRecommended
                  ? "border-primary shadow-xl"
                  : "border-border"
              }`}
            >
              {isRecommended && (
                <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                  <span className="rounded-full bg-primary px-4 py-1 text-xs font-semibold text-primary-foreground">
                    RECOMMENDED
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h2 className="mb-2 text-2xl font-bold">{plan.name}</h2>
                <div className="mb-4">
                  {plan.price !== null ? (
                    <>
                      <span className="text-4xl font-bold">${plan.price}</span>
                      <span className="text-muted-foreground">/month</span>
                    </>
                  ) : (
                    <span className="text-4xl font-bold">Custom</span>
                  )}
                </div>
              </div>

              <ul className="mb-6 space-y-3">
                {plan.features.map((feature: string, i: number) => (
                  <li key={i} className="flex items-start text-sm">
                    <svg
                      className="mr-2 mt-0.5 h-4 w-4 flex-shrink-0 text-primary"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    <span>{feature}</span>
                  </li>
                ))}
              </ul>

              <Link
                href={
                  plan.price !== null
                    ? `/api/billing/checkout?plan=${planKey}`
                    : "/contact"
                }
                className={`block w-full rounded-md px-4 py-2 text-center text-sm font-medium transition-colors ${
                  isRecommended
                    ? "bg-primary text-primary-foreground hover:bg-primary/90"
                    : "border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                }`}
              >
                {plan.price !== null ? "Get Started" : "Contact Sales"}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="mt-16 text-center">
        <p className="text-sm text-muted-foreground">
          All plans include a 14-day free trial with 5 practice sessions.
          <br />
          No credit card required to start.
        </p>
      </div>
    </div>
  );
}
