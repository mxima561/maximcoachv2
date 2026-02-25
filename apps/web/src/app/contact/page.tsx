export default function ContactPage() {
  return (
    <main className="container mx-auto max-w-2xl px-4 py-16">
      <h1 className="mb-4 text-3xl font-bold tracking-tight">Contact Sales</h1>
      <p className="mb-8 text-muted-foreground">
        Questions about plans, enterprise rollout, or onboarding support?
        Reach our team directly and we will respond within one business day.
      </p>

      <div className="rounded-lg border p-6">
        <p className="text-sm text-muted-foreground">Email</p>
        <a
          href="mailto:sales@maximacoach.com"
          className="text-lg font-medium text-primary hover:underline"
        >
          sales@maximacoach.com
        </a>
      </div>
    </main>
  );
}
