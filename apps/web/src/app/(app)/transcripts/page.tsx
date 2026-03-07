"use client";

import { useEffect, useState, useCallback } from "react";
import { Upload, FileText, Loader2, CheckCircle2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/posthog";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface TranscriptItem {
  id: string;
  title: string;
  source: string;
  status: string;
  duration_seconds: number | null;
  created_at: string;
  analysis: {
    summary: string;
    overall_rating: number;
    weakness_count: number;
  } | null;
}

export default function TranscriptsPage() {
  const supabase = createClient();
  const [transcripts, setTranscripts] = useState<TranscriptItem[]>([]);
  const [uploading, setUploading] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [title, setTitle] = useState("");
  const [showUpload, setShowUpload] = useState(false);

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${session?.access_token}`,
      "Content-Type": "application/json",
    };
  }, [supabase]);

  const fetchTranscripts = useCallback(async () => {
    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/transcripts`, { headers });
    if (res.ok) setTranscripts(await res.json());
  }, [getHeaders]);

  useEffect(() => {
    fetchTranscripts();
    trackEvent("transcripts_page_viewed");
  }, [fetchTranscripts]);

  const handleUpload = async () => {
    if (pasteText.length < 50) return;
    setUploading(true);

    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/transcripts`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        title: title || "Pasted Call Transcript",
        raw_text: pasteText,
        source: "paste",
      }),
    });

    if (res.ok) {
      trackEvent("transcript_uploaded", { source: "paste", char_count: pasteText.length });
      setPasteText("");
      setTitle("");
      setShowUpload(false);
      fetchTranscripts();
    }
    setUploading(false);
  };

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending":
      case "processing":
        return <Loader2 className="size-4 animate-spin text-muted-foreground" />;
      case "analyzed":
        return <CheckCircle2 className="size-4 text-green-500" />;
      case "failed":
        return <XCircle className="size-4 text-red-500" />;
      default:
        return null;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-2">
            <FileText className="size-6" />
            Call Transcripts
          </h1>
          <p className="text-muted-foreground">
            Upload real call recordings for AI analysis and targeted drill generation.
          </p>
        </div>
        <Button onClick={() => setShowUpload(!showUpload)}>
          <Upload className="mr-1 size-4" />
          Upload Transcript
        </Button>
      </div>

      {/* Upload form */}
      {showUpload && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Paste Call Transcript</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Call title (optional)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            <Textarea
              placeholder="Paste your call transcript here (minimum 50 characters)..."
              value={pasteText}
              onChange={(e) => setPasteText(e.target.value)}
              rows={10}
              className="font-mono text-sm"
            />
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                {pasteText.length} characters
              </span>
              <Button
                onClick={handleUpload}
                disabled={pasteText.length < 50 || uploading}
              >
                {uploading ? (
                  <Loader2 className="mr-1 size-4 animate-spin" />
                ) : (
                  <Upload className="mr-1 size-4" />
                )}
                Analyze
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Transcript list */}
      <div className="space-y-3">
        {transcripts.length === 0 && !showUpload && (
          <Card>
            <CardContent className="flex flex-col items-center py-12 text-center">
              <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
                <FileText className="size-8 text-primary" />
              </div>
              <p className="text-lg font-medium">No Transcripts Yet</p>
              <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                Paste a real sales call transcript and our AI will analyze it —
                identifying strengths, weaknesses, and generating targeted drills.
              </p>
              <Button className="mt-4" onClick={() => setShowUpload(true)}>
                <Upload className="mr-1 size-4" />
                Upload Your First Transcript
              </Button>
            </CardContent>
          </Card>
        )}

        {transcripts.map((t) => (
          <Card key={t.id} className="transition-colors hover:bg-accent/50">
            <CardContent className="flex items-center gap-4 pt-6">
              {statusIcon(t.status)}
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{t.title}</p>
                <p className="text-xs text-muted-foreground">
                  {new Date(t.created_at).toLocaleDateString()} · {t.source}
                </p>
              </div>
              {t.analysis && (
                <div className="flex items-center gap-2">
                  <Badge variant={t.analysis.overall_rating >= 70 ? "default" : "secondary"}>
                    Score: {t.analysis.overall_rating}
                  </Badge>
                  {t.analysis.weakness_count > 0 && (
                    <Badge variant="outline">
                      {t.analysis.weakness_count} areas to improve
                    </Badge>
                  )}
                </div>
              )}
              {t.status === "processing" && (
                <Badge variant="outline">Analyzing...</Badge>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
