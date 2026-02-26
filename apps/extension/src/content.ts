// Content script — minimal footprint
// Detects meeting platforms and notifies background service worker

const MEETING_DOMAINS = [
  "meet.google.com",
  "zoom.us",
  "teams.microsoft.com",
  "app.gong.io",
];

function isMeetingPage(): boolean {
  return MEETING_DOMAINS.some((domain) =>
    window.location.hostname.includes(domain),
  );
}

if (isMeetingPage()) {
  chrome.runtime.sendMessage({
    type: "meeting_detected",
    url: window.location.href,
    platform: window.location.hostname,
  }).catch(() => {
    // Background worker might not be listening
  });
}
