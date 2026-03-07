"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mic, PhoneOff, AlertCircle } from "lucide-react";
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
import { motion, AnimatePresence } from "framer-motion";
import { spring } from "@/components/motion";

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
  const painPoints = Array.isArray(persona.pain_points)
    ? persona.pain_points.join("; ")
    : persona.pain_points_text || persona.pain_points || "";
  const objections = Array.isArray(persona.likely_objections)
    ? persona.likely_objections.join("; ")
    : persona.objections || persona.likely_objections || "";

  return `
    You are ${name}, ${role} at ${company}.
    Your tone is ${tone}.

    Context: ${context}

    Background: ${persona.background_summary || persona.background || "No background provided."}
    Pain Points: ${painPoints}
    Objections: ${objections}

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
  const conversationRef = useRef<Conversation | null>(null);

  useEffect(() => {
    if (transcriptRef.current) {
      transcriptRef.current.scrollTop = transcriptRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    const timer = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

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
        const pName = session.personas.persona_json?.name || "AI Buyer";
        setPersonaName(pName);
      } catch (err: unknown) {
        console.error("Error fetching session:", err);
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    }

    fetchSessionData();
  }, [sessionId]);

  useEffect(() => {
    if (!personaData || !scenarioType || sessionStartedRef.current) return;
    sessionStartedRef.current = true;

    async function startConversation() {
      try {
        setError(null);

        console.log("Acquiring microphone stream...");
        try {
          await navigator.mediaDevices.getUserMedia({ audio: true });
        } catch (micErr) {
          console.warn("Mic access failed:", micErr);
        }

        const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
        const tokenResponse = await fetch(`${apiUrl}/conversation-token`);

        if (!tokenResponse.ok) {
          throw new Error(`Failed to get signed URL: ${tokenResponse.statusText}`);
        }

        const { signed_url } = await tokenResponse.json();

        if (conversationRef.current) {
          try {
            await conversationRef.current.endSession();
          } catch (e) {
            console.warn("Error cleaning up previous session:", e);
          }
          conversationRef.current = null;
        }

        const personaPrompt = buildPersonaPrompt(personaData, scenarioType);
        const firstMsg = getFirstMessage(scenarioType, personaData.name || "Alex");

        const conv = await Conversation.startSession({
          signedUrl: signed_url,
          overrides: {
            agent: {
              prompt: { prompt: personaPrompt },
              firstMessage: firstMsg,
            },
          },
          onConnect: () => {
            setStatus("connected");
            setError(null);
          },
          onDisconnect: () => {
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
            setIsSpeaking(mode.mode === "speaking");
          },
          onError: (err) => {
            console.error("ElevenLabs error:", err);
            setError(typeof err === 'string' ? err : "Connection error occurred");
            setStatus("error");
          },
        });

        conversationRef.current = conv;
      } catch (err: unknown) {
        console.error("Failed to start conversation:", err);
        setError(err instanceof Error ? err.message : "Failed to start conversation");
        setStatus("error");
        sessionStartedRef.current = false;
      }
    }

    startConversation();

    return () => {
      if (conversationRef.current) {
        conversationRef.current.endSession().catch(() => {});
        conversationRef.current = null;
      }
    };
  }, [personaData, scenarioType]);

  async function handleEndSession() {
    if (conversationRef.current) {
      await conversationRef.current.endSession();
      conversationRef.current = null;
    }
    sessionStartedRef.current = false;
    router.push(`/sessions/${sessionId}/scorecard`);
  }

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, "0");
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

  const statusConfig = {
    connecting: { bg: "bg-amber-500/10 text-amber-600 border-amber-500/20", dot: "bg-amber-500" },
    connected: isSpeaking
      ? { bg: "bg-primary/10 text-primary border-primary/20", dot: "bg-primary" }
      : { bg: "bg-emerald-500/10 text-emerald-600 border-emerald-500/20", dot: "bg-emerald-500" },
    disconnected: { bg: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" },
    error: { bg: "bg-red-500/10 text-red-600 border-red-500/20", dot: "bg-red-500" },
  }[status] || { bg: "bg-muted text-muted-foreground border-border", dot: "bg-muted-foreground" };

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
    <div className="flex h-[calc(100vh-4rem)] flex-col gap-4 lg:flex-row">
      {/* Main Call Area */}
      <Card className="relative flex flex-1 flex-col items-center justify-center overflow-hidden p-6">
        {/* Top bar */}
        <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
          <Badge variant="outline" className={`gap-2 rounded-full px-3 py-1.5 text-sm font-medium border ${statusConfig.bg}`}>
            <span className="relative flex size-2">
              {status === 'connected' && (
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full ${statusConfig.dot} opacity-75`} />
              )}
              <span className={`relative inline-flex size-2 rounded-full ${statusConfig.dot}`} />
            </span>
            {statusText}
          </Badge>

          <div className="font-mono text-xl font-bold text-foreground/70 tabular-nums">
            {formatTimer(elapsedSeconds)}
          </div>
        </div>

        {/* Orb */}
        <div className="relative flex items-center justify-center my-auto">
          {/* Outermost ring */}
          <motion.div
            className="absolute size-80 rounded-full border border-primary/10"
            animate={{
              scale: isSpeaking ? [1, 1.08, 1] : 1,
              opacity: isSpeaking ? [0.3, 0.6, 0.3] : 0.3,
            }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />

          {/* Dashed ring */}
          <motion.div
            className="absolute size-64 rounded-full border border-dashed border-primary/20"
            animate={{ rotate: 360 }}
            transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          />

          {/* Glow */}
          <motion.div
            className="absolute size-48 rounded-full bg-primary/5 blur-3xl"
            animate={{
              scale: isSpeaking ? [1, 1.5, 1] : [1, 1.1, 1],
            }}
            transition={{ duration: isSpeaking ? 0.8 : 3, repeat: Infinity }}
          />

          {/* Core orb */}
          <motion.div
            className="relative flex size-40 items-center justify-center rounded-full bg-gradient-to-br from-primary to-[oklch(0.60_0.26_310)] shadow-2xl shadow-primary/20"
            animate={
              isSpeaking
                ? { scale: [1, 1.08, 0.96, 1.04, 1] }
                : { scale: [1, 1.04, 1] }
            }
            transition={{
              duration: isSpeaking ? 0.8 : 3,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          >
            {/* Highlight */}
            <div className="absolute left-[25%] top-[18%] size-16 rounded-full bg-white/10 blur-sm" />
            <Mic className={`size-12 text-white ${status === 'connected' ? 'opacity-100' : 'opacity-50'}`} />
          </motion.div>
        </div>

        {/* Bottom info */}
        <div className="flex flex-col items-center gap-3">
          <h2 className="text-2xl font-bold">{personaName}</h2>
          <p className="text-sm text-muted-foreground">{scenarioLabel}</p>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-xl bg-red-500/5 border border-red-500/15 px-4 py-2.5 text-sm text-red-600"
            >
              <AlertCircle className="size-4 shrink-0" />
              <span>{error}</span>
              <Button
                variant="link"
                size="sm"
                className="h-auto p-0 text-red-700 underline"
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </motion.div>
          )}

          <div className="mt-3 flex gap-3">
            <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
              <DialogTrigger asChild>
                <Button variant="destructive" size="lg" className="rounded-xl px-8 shadow-lg shadow-destructive/15 gap-2">
                  <PhoneOff className="size-4" />
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
                  <Button variant="ghost" onClick={() => setEndDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="destructive" onClick={handleEndSession}>
                    End Session
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {status !== 'connected' && status !== 'connecting' && !error && (
              <Button onClick={() => window.location.reload()} variant="outline" className="rounded-xl">
                Restart
              </Button>
            )}
          </div>
        </div>
      </Card>

      {/* Transcript Sidebar */}
      <Card className="flex h-full w-full flex-col lg:w-[400px]">
        <div className="flex items-center justify-between border-b px-5 py-4">
          <h3 className="font-semibold">Transcript</h3>
          {status === 'connected' && (
            <Badge variant="secondary" className="flex gap-1.5 rounded-full bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/10">
              <span className="relative flex size-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
              </span>
              LIVE
            </Badge>
          )}
        </div>

        <div ref={transcriptRef} className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.length === 0 && (
            <div className="flex h-full flex-col items-center justify-center text-center text-muted-foreground">
              <motion.div
                animate={{ y: [0, -4, 0] }}
                transition={{ duration: 2, repeat: Infinity }}
              >
                <Mic className="mb-3 size-8 opacity-20" />
              </motion.div>
              <p className="text-sm">Conversation will appear here...</p>
            </div>
          )}

          <AnimatePresence>
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={spring.gentle}
                className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <div
                  className={`max-w-[85%] rounded-2xl px-4 py-3 text-sm shadow-sm ${
                    msg.role === "user"
                      ? "rounded-br-md bg-gradient-to-br from-primary to-primary/90 text-white"
                      : "rounded-bl-md bg-muted/60 text-foreground"
                  }`}
                >
                  <p className="leading-relaxed">{msg.content}</p>
                  <p className="mt-1 text-[10px] opacity-60">
                    {formatTime(msg.timestamp)}
                  </p>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </Card>
    </div>
  );
}
