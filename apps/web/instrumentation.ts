export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (
  err: Error,
  request: {
    method: string;
    url: string;
    headers: Headers;
  }
) => {
  // This will be called for all errors in the application
  console.error("Request error:", err);
};
