"use client";

import { useEffect, useState, useCallback } from "react";
import { ThumbsUp, Flame, Lightbulb, Play, Pause } from "lucide-react";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface ClipEntry {
  id: string;
  session_id: string;
  user_id: string;
  start_time: number;
  end_time: number;
  storage_path: string;
  coaching_note: string | null;
  reactions: Record<string, number> | null;
  created_at: string;
  users: { name: string } | null;
  sessions: { scenario_type: string } | null;
  scorecards: { overall_score: number }[] | null;
}

const REACTIONS = [
  { key: "thumbs_up", icon: ThumbsUp, label: "Nice" },
  { key: "fire", icon: Flame, label: "Fire" },
  { key: "lightbulb", icon: Lightbulb, label: "Insight" },
] as const;

const PAGE_SIZE = 20;

export default function FeedPage() {
  const supabase = createClient();
  const [clips, setClips] = useState<ClipEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [page, setPage] = useState(0);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setCurrentUserId(data.user?.id ?? null);
    });
  }, []);

  const loadClips = useCallback(
    async (pageNum: number) => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from("users")
        .select("org_id")
        .eq("id", user.id)
        .single();

      if (!profile?.org_id) return;

      // Get all org user IDs
      const { data: orgUsers } = await supabase
        .from("users")
        .select("id")
        .eq("org_id", profile.org_id);

      if (!orgUsers?.length) {
        setLoading(false);
        return;
      }

      const userIds = orgUsers.map((u) => u.id);

      const { data } = await supabase
        .from("clips")
        .select(
          "*, users(name), sessions(scenario_type), scorecards:sessions(scorecards(overall_score))",
        )
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .range(pageNum * PAGE_SIZE, (pageNum + 1) * PAGE_SIZE - 1);

      if (data) {
        if (pageNum === 0) {
          setClips(data as unknown as ClipEntry[]);
        } else {
          setClips((prev) => [
            ...prev,
            ...(data as unknown as ClipEntry[]),
          ]);
        }
        setHasMore(data.length === PAGE_SIZE);
      }
      setLoading(false);
    },
    [supabase],
  );

  useEffect(() => {
    loadClips(0);
  }, [loadClips]);

  function loadMore() {
    const nextPage = page + 1;
    setPage(nextPage);
    loadClips(nextPage);
  }

  async function handleReaction(clipId: string, reactionKey: string) {
    const clip = clips.find((c) => c.id === clipId);
    if (!clip) return;

    const currentReactions = clip.reactions ?? {};
    const currentCount = currentReactions[reactionKey] ?? 0;

    const updatedReactions = {
      ...currentReactions,
      [reactionKey]: currentCount + 1,
    };

    await supabase
      .from("clips")
      .update({ reactions: updatedReactions })
      .eq("id", clipId);

    setClips((prev) =>
      prev.map((c) =>
        c.id === clipId ? { ...c, reactions: updatedReactions } : c,
      ),
    );
  }

  function formatTime(seconds: number) {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  function formatDate(dateStr: string) {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffH = Math.floor(diffMs / (1000 * 60 * 60));

    if (diffH < 1) return "Just now";
    if (diffH < 24) return `${diffH}h ago`;
    const diffD = Math.floor(diffH / 24);
    if (diffD < 7) return `${diffD}d ago`;
    return d.toLocaleDateString();
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Team Feed</h1>
        <p className="text-muted-foreground">
          Best moments from your team&apos;s practice sessions.
        </p>
      </div>

      {loading && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Loading...
        </p>
      )}

      {!loading && clips.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-lg font-medium">No clips yet</p>
            <p className="text-sm text-muted-foreground">
              Save clips from your scorecards to share with the team.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        {clips.map((clip) => {
          const duration = clip.end_time - clip.start_time;
          const isPlaying = playingId === clip.id;

          return (
            <Card key={clip.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
                      {(clip.users?.name ?? "?").charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="text-sm font-medium">
                        {clip.users?.name ?? "Unknown"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatDate(clip.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {clip.sessions?.scenario_type && (
                      <Badge variant="outline" className="text-xs">
                        {clip.sessions.scenario_type.replace("_", " ")}
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Audio player */}
                <div className="flex items-center gap-3 rounded-lg bg-muted p-3">
                  <button
                    onClick={() =>
                      setPlayingId(isPlaying ? null : clip.id)
                    }
                    className="flex size-8 items-center justify-center rounded-full bg-primary text-primary-foreground"
                  >
                    {isPlaying ? (
                      <Pause className="size-4" />
                    ) : (
                      <Play className="ml-0.5 size-4" />
                    )}
                  </button>
                  <div className="flex-1">
                    <div className="h-1.5 rounded-full bg-muted-foreground/20">
                      <div
                        className="h-full rounded-full bg-primary transition-all"
                        style={{ width: isPlaying ? "45%" : "0%" }}
                      />
                    </div>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {formatTime(duration)}
                  </span>
                </div>

                {/* Coaching note */}
                {clip.coaching_note && (
                  <p className="text-sm italic text-muted-foreground">
                    &ldquo;{clip.coaching_note}&rdquo;
                  </p>
                )}

                {/* Reactions */}
                <div className="flex items-center gap-2">
                  {REACTIONS.map(({ key, icon: Icon, label }) => {
                    const count =
                      (clip.reactions as Record<string, number> | null)?.[
                        key
                      ] ?? 0;
                    return (
                      <Button
                        key={key}
                        variant="ghost"
                        size="sm"
                        className="h-8 gap-1 text-xs"
                        onClick={() => handleReaction(clip.id, key)}
                      >
                        <Icon className="size-3.5" />
                        {count > 0 && (
                          <span className="font-medium">{count}</span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {hasMore && clips.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" onClick={loadMore}>
            Load More
          </Button>
        </div>
      )}
    </div>
  );
}
