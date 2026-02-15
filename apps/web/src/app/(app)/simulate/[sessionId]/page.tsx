"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Square, Mic, MicOff, PhoneOff, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";
import { Conversation } from "@elevenlabs/client";
import type { TranscriptMessage } from "@/components/simulation-transcript";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

// Module-level singleton to survive React Strict Mode double-mount & HMR
let activeConversation: Conversation | null = null;

function buildPersonaPrompt(persona: any, scenario: string): string {
  if (!persona) return "";

  const scenarioMap: Record<string, string> = {
    cold_call: "This is a cold call. The user is a sales representative trying to book a meeting with you. You did not expect this call.",
    discovery: "This is a discovery call. The user is trying to understand your needs and pain points. Be open but professional.",
    objection_handling: "This is an objection handling exercise. You should be skeptical and raise common objections related to price, timing, or competitors.",
    closing: "This is a closing call. The user is trying to get you to sign the contract. Focus on final details and risk aversion.",
  };

  const context = scenarioMap[scenario] || "Simulation conversation.";
  const name = persona.name || "Alex";
  const role = persona.role || "Director";
  const company = persona.company || "Tech Corp";
  const tone = persona.tone || "Professional";

  // Construct the prompt carefully
  return `
    You are ${name}, ${role} at ${company}.
    Your tone is ${tone}.
    
    Context: ${context}
    
    Background: ${persona.background_summary || persona.background || "No background provided."}
    Pain Points: ${persona.pain_points || ""}
    Objections: ${persona.objections || ""}
    
    Instructions:
    - Act naturally according to your role and tone.
    - Keep responses concise (spoken conversation).
    - Do not be overly helpful unless the user earns it.
    - If the user is rude or incompetent, react accordingly.
  `.trim();
}

function getFirstMessage(scenario: string, name: string): string {
  const map: Record<string, string> = {
    cold_call: "Hello? Who is this?",
    discovery: `Hi, this is ${name}. Thanks for hopping on the call.`,
    objection_handling: "Yeah, I saw your proposal but I have some concerns.",
    closing: `Hi ${name} here. I've reviewed the contract.`,
  };
  return map[scenario] || "Hello?";
}

export default function SimulationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;
  const supabase = createClient();

  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [personaData, setPersonaData] = useState<any>(null);
  const [scenarioType, setScenarioType] = useState<string>("");
  const [status, setStatus] = useState<string>("connecting");
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [personaName, setPersonaName] = useState<string>("");
  const [error, setError] = useState<string | null>(null);

  const sessionStartedRef = useRef(false);
  const transcriptRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript
  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  // Timer
  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch session data
  useEffect(() => {
    async function fetchSessionData() {
      try {
        const { data: session, error } = await supabase
          .from("sessions")
          .select(`
            *,
            personas (
              id,
              persona_json
            )
          `)
          .eq("id", sessionId)
          .single();

        if (error) throw error;
        if (!session || !session.personas) {
          throw new Error("Session or persona not found");
        }

        setPersonaData(session.personas.persona_json);
        setScenarioType(session.scenario_type);

        // Try to get name from persona_json, fallback to AI Buyer
        const pName = session.personas.persona_json?.name || "AI Buyer";
        setPersonaName(pName);

      } catch (err: any) {
        console.error("Error fetching session:", err);
        setError(err.message);
      }
    }

    fetchSessionData();
  }, [sessionId]);

  // Start conversation when persona data is loaded
  useEffect(() => {
    if (!personaData || !scenarioType || sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    async function startConversation() {
      try {
        // Clear any previous error
        setError(null);

        console.log("Requesting microphone access...");
        await navigator.mediaDevices.getUserMedia({ audio: true });

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        console.log("Fetching conversation token from:", apiUrl);
        const tokenResponse = await fetch(`${apiUrl}/conversation-token`);

        if (!tokenResponse.ok) {
          throw new Error(`Failed to get signed URL: ${tokenResponse.statusText}`);
        }

        const { signed_url } = await tokenResponse.json();
        console.log("Starting ElevenLabs session...");

        // Safety cleanup if existing session exists
        if (activeConversation) {
          try {
            await activeConversation.endSession();
          } catch (e) {
            console.warn("Error cleaning up previous session:", e);
          }
          activeConversation = null;
        }

        const personaPrompt = buildPersonaPrompt(personaData, scenarioType);
        const firstMsg = getFirstMessage(scenarioType, personaData.name || "Alex");

        console.log("Using Persona Prompt:", personaPrompt);
        console.log("Using First Message:", firstMsg);

        const conv = await Conversation.startSession({
          signedUrl: signed_url,
          // Attempt to override agent configuration
          overrides: {
            agent: {
              prompt: {
                prompt: personaPrompt,
              },
              firstMessage: firstMsg,
            },
          },
          onConnect: () => {
            console.log("ElevenLabs: Connected!");
            setStatus("connected");
            setError(null);
          },
          onDisconnect: (details) => {
            console.log("ElevenLabs: Disconnected", details);
            setStatus("disconnected");
          },
          onMessage: (message) => {
            const transcriptMsg: TranscriptMessage = {
              id: crypto.randomUUID(),
              timestamp: new Date().toISOString(),
              role: message.source === "user" ? "user" : "assistant",
              content: message.message,
              interim: false,
            };
            setMessages((prev) => [...prev, transcriptMsg]);
          },
          onModeChange: (mode) => {
            console.log("ElevenLabs mode:", mode.mode);
            setIsSpeaking(mode.mode === "speaking");
          },
          onError: (err) => {
            console.error("ElevenLabs error:", err);
            setError(typeof err === 'string' ? err : "Connection error occurred");
            setStatus("error");
          },
        });

        activeConversation = conv;
        console.log("Session started successfully, ID:", conv.getId());
      } catch (err: any) {
        console.error("Failed to start conversation:", err);
        setError(err.message || "Failed to start conversation");
        setStatus("error");
        sessionStartedRef.current = false; // Allow retry
      }
    }

    startConversation();
  }, [personaData, scenarioType]);

  async function handleEndSession() {
    if (activeConversation) {
      await activeConversation.endSession();
      activeConversation = null;
    }
    sessionStartedRef.current = false;
    router.push(`/sessions/${sessionId}/scorecard`);
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const scenarioLabel = {
    cold_call: "Cold Call",
    discovery: "Discovery",
    objection_handling: "Objection Handling",
    closing: "Closing",
  }[scenarioType] || "Simulation";

  const statusText = {
    connecting: "Connecting...",
    connected: isSpeaking ? "AI is Speaking" : "Listening",
    disconnected: "Disconnected",
    error: "Connection Failed",
  }[status] || "Connecting...";

  const statusColor = {
    connecting: "bg-yellow-100 text-yellow-700 border-yellow-200",
    connected: isSpeaking
      ? "bg-indigo-100 text-indigo-700 border-indigo-200"
      : "bg-emerald-100 text-emerald-700 border-emerald-200",
    disconnected: "bg-gray-100 text-gray-700 border-gray-200",
    error: "bg-red-100 text-red-700 border-red-200",
  }[status] || "bg-gray-100 text-gray-700 border-gray-200";

  function formatTime(iso: string): string {
    const d = new Date(iso);
    return d.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  }

  return (
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-6 lg:flex-row">
      <style jsx>{`
        @keyframes orb-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.05); opacity: 0.9; }
        }
        @keyframes orb-speak {
          0%, 100% { transform: scale(1); }
          25% { transform: scale(1.1); }
          50% { transform: scale(0.95); }
          75% { transform: scale(1.05); }
        }
        @keyframes ring-rotate {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
         .orb-idle { animation: orb-pulse 3s ease-in-out infinite; }
         .orb-speaking { animation: orb-speak 0.8s ease-in-out infinite; }
         .ring-spin { animation: ring-rotate 20s linear infinite; }
      `}</style>

      {/* Main Call Area */}
      <Card className="relative flex flex-1 flex-col items-center justify-center overflow-hidden border-border bg-white p-6 shadow-sm dark:bg-gray-950">
        <div className="flex w-full items-start justify-between">
          <Badge variant="outline" className={`gap-2 px-3 py-1.5 text-sm font-normal border ${statusColor}`}>
            <div className={`size-2 rounded-full ${status === 'connected' ? 'bg-emerald-500 animate-pulse' :
                status === 'connecting' ? 'bg-yellow-500' : 'bg-red-500'
              }`} />
            {statusText}
          </Badge>

          <div className="font-mono text-xl font-medium text-gray-600 dark:text-gray-300">
            {formatTimer(elapsedSeconds)}
          </div>
        </div>

        {/* Branding Light Mode Orb */}
        <div className="relative my-auto flex items-center justify-center">
          {/* Outer Ring */}
          <div className={`absolute size-80 rounded-full border border-indigo-100 opacity-60 dark:border-indigo-900/30 ${isSpeaking ? 'scale-110 opacity-40' : 'scale-100'} transition-all duration-500`} />

          {/* Middle Ring with Spin */}
          <div className={`absolute size-64 rounded-full border border-dashed border-indigo-200 dark:border-indigo-800/50 ring-spin ${isSpeaking ? 'opacity-80' : 'opacity-40'}`} />

          {/* Inner Glow */}
          <div className={`absolute size-48 rounded-full bg-indigo-500/5 blur-3xl dark:bg-indigo-500/10 ${isSpeaking ? 'scale-150' : 'scale-100'} transition-all duration-300`} />

          {/* Core Orb */}
          <div
            className={`relative flex size-40 items-center justify-center rounded-full bg-gradient-to-br from-indigo-500 to-indigo-600 shadow-2xl shadow-indigo-200 dark:shadow-indigo-900/50 ${isSpeaking ? 'orb-speaking' : 'orb-idle'}`}
          >
            {/* Inner Highlight */}
            <div className="absolute left-[25%] top-[20%] size-16 rounded-full bg-white/10 blur-sm" />

            <Mic className={`size-12 text-white ${status === 'connected' ? 'opacity-100' : 'opacity-50'}`} />
          </div>
        </div>

        <div className="mt-8 flex flex-col items-center gap-4">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-gray-50">
            {personaName}
          </h2>
          <p className="text-muted-foreground">{scenarioLabel}</p>

          {error && (
            <div className="flex items-center gap-2 rounded-md bg-red-50 p-3 text-sm text-red-600 dark:bg-red-900/20 dark:text-red-400">
              <AlertCircle className="size-4" />
              <span>{error}</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-red-700 underline dark:text-red-300"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          )}

          <div className="mt-4 flex gap-4">
            <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="lg" className="px-8 shadow-sm">
                  <PhoneOff className="mr-2 size-4" />
                  End Session
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>End Simulation?</DialogTitle>
                  <DialogDescription>
                    This will stop the simulation and generate your scorecard.
                  </DialogDescription>
                </DialogHeader>
                <DialogFooter>
                  <Button
                    variant="ghost"
                    onClick={() => setEndDialogOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleEndSession}>
                    End Session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {status !== 'connected' && status !== 'connecting' && !error && (
              <Button onClick={() => window.location.reload()} variant="outline">
                Restart
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Transcript Sidebar */}
      <Card className="flex h-full w-full flex-col border-border bg-gray-50/50 shadow-sm dark:bg-gray-900/50 lg:w-96">
        <div className="flex items-center justify-between border-b bg-white p-4 dark:bg-gray-950">
          <h3 className="font-semibold text-gray-900 dark:text-gray-50">Transcript</h3>
          {status === 'connected' && (
            <Badge variant="secondary" className="flex gap-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500"></span>
              </span>
              LIVE
            </Badge>
          )}
        </div>

        <div ref={transcriptRef} className="flex-1 space-y-4 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <Mic className="mb-2 size-8 opacity-20" />
              <p>Conversation will appear here...</p>
            </div>
          )}

          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${msg.role === "user"
                    ? "rounded-br-sm bg-indigo-600 text-white"
                    : "rounded-bl-sm bg-white text-gray-800 dark:bg-gray-800 dark:text-gray-100"
                  }`}
              >
                <p className="leading-relaxed">{msg.content}</p>
                <p className={`mt-1 text-[10px] opacity-70`}>
                  {formatTime(msg.timestamp)}
                </p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
