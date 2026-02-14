"use client";

import { useState, useRef } from "react";
import { Scissors, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

interface ClipCaptureProps {
  sessionId: string;
  sessionDurationSeconds: number;
  onSaved?: (clipId: string) => void;
}

const MIN_CLIP = 30;
const MAX_CLIP = 60;

export function ClipCapture({
  sessionId,
  sessionDurationSeconds,
  onSaved,
}: ClipCaptureProps) {
  const supabase = createClient();
  const [open, setOpen] = useState(false);
  const [startTime, setStartTime] = useState(0);
  const [endTime, setEndTime] = useState(Math.min(MAX_CLIP, sessionDurationSeconds));
  const [saving, setSaving] = useState(false);
  const startRef = useRef<HTMLInputElement>(null);
  const endRef = useRef<HTMLInputElement>(null);

  const clipDuration = endTime - startTime;
  const isValid = clipDuration >= MIN_CLIP && clipDuration <= MAX_CLIP;

  function formatTime(seconds: number): string {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function handleStartChange(value: number) {
    const clamped = Math.max(0, Math.min(value, sessionDurationSeconds - MIN_CLIP));
    setStartTime(clamped);
    if (endTime - clamped < MIN_CLIP) {
      setEndTime(Math.min(clamped + MIN_CLIP, sessionDurationSeconds));
    }
    if (endTime - clamped > MAX_CLIP) {
      setEndTime(clamped + MAX_CLIP);
    }
  }

  function handleEndChange(value: number) {
    const clamped = Math.max(startTime + MIN_CLIP, Math.min(value, sessionDurationSeconds));
    setEndTime(Math.min(clamped, startTime + MAX_CLIP));
  }

  async function handleSave() {
    if (!isValid) return;
    setSaving(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    // Create clip record
    const { data: clip, error } = await supabase
      .from("clips")
      .insert({
        session_id: sessionId,
        user_id: user.id,
        start_time: startTime,
        end_time: endTime,
        storage_path: `clips/${sessionId}/${startTime}-${endTime}.webm`,
      })
      .select("id")
      .single();

    if (!error && clip) {
      onSaved?.(clip.id);
      setOpen(false);
    }

    setSaving(false);
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Scissors className="mr-2 size-4" />
        Save Clip
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Save Clip</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Select a 30-60 second segment from your session.
            </p>

            {/* Timeline scrubber */}
            <div className="space-y-2">
              <div className="relative h-8 rounded-full bg-muted">
                <div
                  className="absolute top-0 h-full rounded-full bg-primary/30"
                  style={{
                    left: `${(startTime / sessionDurationSeconds) * 100}%`,
                    width: `${((endTime - startTime) / sessionDurationSeconds) * 100}%`,
                  }}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label htmlFor="start">Start ({formatTime(startTime)})</Label>
                  <input
                    ref={startRef}
                    id="start"
                    type="range"
                    min={0}
                    max={sessionDurationSeconds}
                    value={startTime}
                    onChange={(e) => handleStartChange(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="end">End ({formatTime(endTime)})</Label>
                  <input
                    ref={endRef}
                    id="end"
                    type="range"
                    min={0}
                    max={sessionDurationSeconds}
                    value={endTime}
                    onChange={(e) => handleEndChange(Number(e.target.value))}
                    className="w-full"
                  />
                </div>
              </div>

              <p className="text-center text-sm">
                Duration:{" "}
                <span
                  className={`font-medium ${isValid ? "text-primary" : "text-destructive"}`}
                >
                  {formatTime(clipDuration)}
                </span>
                {!isValid && (
                  <span className="ml-2 text-xs text-destructive">
                    (must be {MIN_CLIP}-{MAX_CLIP}s)
                  </span>
                )}
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              <X className="mr-1 size-3" />
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!isValid || saving}>
              <Save className="mr-1 size-3" />
              {saving ? "Saving..." : "Save Clip"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
