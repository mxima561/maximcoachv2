export async function GET() {
  throw new Error("Test Server Error - This should appear in Sentry!");
}
