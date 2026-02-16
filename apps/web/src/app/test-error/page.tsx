"use client";

import * as Sentry from "@sentry/nextjs";

export default function TestErrorPage() {
  const testClientError = () => {
    throw new Error("Test Client Error - This should appear in Sentry!");
  };

  const testServerError = async () => {
    const response = await fetch("/api/test-error");
    const data = await response.json();
    console.log(data);
  };

  const testSentryCapture = () => {
    Sentry.captureException(new Error("Manual Sentry Test"));
    alert("Error sent to Sentry! Check your Sentry dashboard.");
  };

  return (
    <div className="p-8">
      <h1 className="mb-4 text-2xl font-bold">Sentry Error Testing</h1>
      <div className="space-y-4">
        <button
          onClick={testClientError}
          className="block rounded bg-red-500 px-4 py-2 text-white hover:bg-red-600"
        >
          Test Client Error (throws)
        </button>
        <button
          onClick={testServerError}
          className="block rounded bg-orange-500 px-4 py-2 text-white hover:bg-orange-600"
        >
          Test Server Error (API route)
        </button>
        <button
          onClick={testSentryCapture}
          className="block rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
        >
          Test Manual Capture
        </button>
      </div>
    </div>
  );
}
