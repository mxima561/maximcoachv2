"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { Mic, MicOff, Square, MessageSquare, X } from "lucide-react";
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
import { AdaptiveOrb } from "@/components/voice-orb-2d";
import {
  SimulationTranscript,
  type TranscriptMessage,
} from "@/components/simulation-transcript";
import type { OrbState } from "@/components/voice-orb";

export default function SimulationPage() {
  const params = useParams();
  const router = useRouter();
  const sessionId = params.sessionId as string;

  const [orbState, setOrbState] = useState<OrbState>("idle");
  const [micActive, setMicActive] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(true);
  const [endDialogOpen, setEndDialogOpen] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [messages, setMessages] = useState<TranscriptMessage[]>([]);
  const [audioData, setAudioData] = useState<Float32Array | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const animFrameRef = useRef<number>(0);

  // Format MM:SS
  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, "0");
    const s = (secs % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  // Start timer
  useEffect(() => {
    timerRef.current = setInterval(() => {
      setElapsedSeconds((s) => s + 1);
    }, 1000);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  // Connect WebSocket
  useEffect(() => {
    const voiceUrl =
      process.env.NEXT_PUBLIC_VOICE_URL || "ws://localhost:3002";
    const ws = new WebSocket(`${voiceUrl}?session_id=${sessionId}`);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as {
          type: string;
          state?: OrbState;
          message?: TranscriptMessage;
        };

        if (data.type === "state_change" && data.state) {
          setOrbState(data.state);
        }

        if (data.type === "transcript" && data.message) {
          setMessages((prev) => {
            // Update interim message or add new
            if (data.message!.interim) {
              const existing = prev.findIndex(
                (m) => m.interim && m.role === data.message!.role,
              );
              if (existing >= 0) {
                const updated = [...prev];
                updated[existing] = data.message!;
                return updated;
              }
            }
            // Remove interim of same role when final arrives
            if (!data.message!.interim) {
              const filtered = prev.filter(
                (m) => !(m.interim && m.role === data.message!.role),
              );
              return [...filtered, data.message!];
            }
            return [...prev, data.message!];
          });
        }
      } catch {
        // Binary audio data from TTS — ignore in transcript handler
      }
    };

    return () => {
      ws.close();
    };
  }, [sessionId]);

  // Audio capture loop for visualizer
  const updateAudioData = useCallback(() => {
    if (analyserRef.current) {
      const data = new Float32Array(analyserRef.current.frequencyBinCount);
      analyserRef.current.getFloatTimeDomainData(data);
      setAudioData(data);
    }
    animFrameRef.current = requestAnimationFrame(updateAudioData);
  }, []);

  // Toggle mic
  async function toggleMic() {
    if (micActive) {
      // Stop
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      cancelAnimationFrame(animFrameRef.current);
      setAudioData(null);
      setMicActive(false);
      setOrbState("idle");
      wsRef.current?.send(JSON.stringify({ type: "mic_off" }));
    } else {
      // Start
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { echoCancellation: true, noiseSuppression: true },
        });
        mediaStreamRef.current = stream;

        const ctx = new AudioContext({ sampleRate: 16000 });
        audioContextRef.current = ctx;
        const source = ctx.createMediaStreamSource(stream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        analyserRef.current = analyser;

        // Start audio data loop
        updateAudioData();

        setMicActive(true);
        setOrbState("listening");
        wsRef.current?.send(JSON.stringify({ type: "mic_on" }));

        // Stream audio via ScriptProcessor (PCM 16-bit)
        const processor = ctx.createScriptProcessor(4096, 1, 1);
        source.connect(processor);
        processor.connect(ctx.destination);
        processor.onaudioprocess = (e) => {
          const input = e.inputBuffer.getChannelData(0);
          const pcm = new Int16Array(input.length);
          for (let i = 0; i < input.length; i++) {
            pcm[i] = Math.max(-1, Math.min(1, input[i])) * 0x7fff;
          }
          wsRef.current?.send(pcm.buffer);
        };
      } catch {
        // Mic permission denied
      }
    }
  }

  // End session
  function handleEndSession() {
    wsRef.current?.send(JSON.stringify({ type: "end_session" }));
    mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
    cancelAnimationFrame(animFrameRef.current);
    if (timerRef.current) clearInterval(timerRef.current);
    router.push(`/sessions/${sessionId}/scorecard`);
  }

  return (
    <div className="fixed inset-0 flex bg-gray-950">
      {/* Main area — orb */}
      <div
        className={`flex flex-1 items-center justify-center transition-all ${
          drawerOpen ? "mr-80" : ""
        }`}
      >
        <div className="size-64 sm:size-80 md:size-96">
          <AdaptiveOrb state={orbState} audioData={audioData} />
        </div>
      </div>

      {/* Transcript drawer */}
      {drawerOpen && (
        <div className="fixed right-0 top-0 bottom-0 w-80 border-l border-gray-800 bg-gray-900">
          <button
            className="absolute right-3 top-3 rounded p-1 text-gray-400 hover:text-white"
            onClick={() => setDrawerOpen(false)}
          >
            <X className="size-4" />
          </button>
          <SimulationTranscript messages={messages} />
        </div>
      )}

      {/* Bottom controls */}
      <div className="fixed bottom-0 left-0 right-0 flex items-center justify-center gap-6 border-t border-gray-800 bg-gray-900/90 px-6 py-4 backdrop-blur-sm">
        {/* Transcript toggle */}
        {!drawerOpen && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDrawerOpen(true)}
            className="border-gray-700 text-gray-300"
          >
            <MessageSquare className="mr-1 size-4" />
            Transcript
          </Button>
        )}

        {/* Mic toggle */}
        <button
          onClick={toggleMic}
          className={`flex size-14 items-center justify-center rounded-full transition-colors ${
            micActive
              ? "bg-red-600 text-white hover:bg-red-700"
              : "bg-green-600 text-white hover:bg-green-700"
          }`}
        >
          {micActive ? (
            <MicOff className="size-6" />
          ) : (
            <Mic className="size-6" />
          )}
        </button>

        {/* Timer */}
        <span className="min-w-[60px] text-center font-mono text-lg text-gray-300">
          {formatTimer(elapsedSeconds)}
        </span>

        {/* End Session */}
        <Dialog open={endDialogOpen} onOpenChange={setEndDialogOpen}>
          <DialogTrigger asChild>
            <Button
              variant="destructive"
              size="sm"
              className="gap-1"
            >
              <Square className="size-3.5" />
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
                variant="outline"
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
      </div>
    </div>
  );
}
