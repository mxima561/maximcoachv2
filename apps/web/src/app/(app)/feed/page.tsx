"use client";

import { useEffect, useState, useCallback } from "react";
import { Play, Flame, HandMetal, Brain, Trophy, ThumbsUp } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/posthog";
import {
  FadeIn,
  StaggerContainer,
  StaggerItem,
  ScaleOnHover,
  motion,
} from "@/components/motion";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const REACTION_ICONS: Record<string, typeof Flame> = {
  fire: Flame,
  clap: HandMetal,
  mind_blown: Brain,
  trophy: Trophy,
  thumbs_up: ThumbsUp,
};

interface ClipItem {
  id: string;
  title: string;
  description: string;
  ai_note: string | null;
  storage_path: string;
  start_time: number;
  end_time: number;
  created_at: string;
  users: { name: string };
  reaction_counts: Record<string, number>;
  my_reactions: string[];
}

export default function FeedPage() {
  const supabase = createClient();
  const [clips, setClips] = useState<ClipItem[]>([]);

  const getHeaders = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    return {
      Authorization: `Bearer ${session?.access_token}`,
      "Content-Type": "application/json",
    };
  }, [supabase]);

  const fetchFeed = useCallback(async () => {
    const headers = await getHeaders();
    const res = await fetch(`${API_URL}/api/clips/feed`, { headers });
    if (res.ok) setClips(await res.json());
  }, [getHeaders]);

  useEffect(() => {
    fetchFeed();
    trackEvent("feed_page_viewed");
  }, [fetchFeed]);

  const handleReact = async (clipId: string, reaction: string) => {
    const headers = await getHeaders();
    await fetch(`${API_URL}/api/clips/${clipId}/react`, {
      method: "POST",
      headers,
      body: JSON.stringify({ reaction }),
    });
    fetchFeed();
  };

  return (
    <div className="space-y-6">
      <FadeIn>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Team Feed</h1>
          <p className="text-muted-foreground">
            Highlights and clips shared by your team.
          </p>
        </div>
      </FadeIn>

      {clips.length === 0 && (
        <FadeIn delay={0.1}>
          <Card className="overflow-hidden">
            <CardContent className="flex flex-col items-center py-16 text-center">
              <motion.div
                className="mb-5 flex size-18 items-center justify-center rounded-2xl bg-gradient-to-br from-primary/12 to-primary/5"
                animate={{ y: [0, -6, 0] }}
                transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              >
                <Play className="size-8 text-primary" />
              </motion.div>
              <p className="text-lg font-semibold">No Clips Yet</p>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground leading-relaxed">
                After a coaching session, save your best moments as clips to share with
                the team. React to each other&apos;s highlights to build team spirit.
              </p>
            </CardContent>
          </Card>
        </FadeIn>
      )}

      <StaggerContainer className="space-y-4">
        {clips.map((clip) => (
          <StaggerItem key={clip.id}>
            <ScaleOnHover scale={1.005}>
              <Card className="overflow-hidden transition-shadow hover:shadow-md">
                <CardContent className="space-y-3 pt-5">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-9 ring-2 ring-primary/10">
                      <AvatarFallback className="bg-gradient-to-br from-primary/15 to-primary/5 text-primary text-xs font-semibold">
                        {clip.users?.name?.charAt(0) ?? "?"}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="text-sm font-semibold">{clip.users?.name ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">
                        {new Date(clip.created_at).toLocaleDateString()} · {Math.round(clip.end_time - clip.start_time)}s clip
                      </p>
                    </div>
                  </div>

                  {(clip.title || clip.ai_note) && (
                    <p className="text-sm leading-relaxed">{clip.title || clip.ai_note}</p>
                  )}

                  {/* Reaction bar */}
                  <div className="flex items-center gap-1.5 pt-1">
                    {Object.entries(REACTION_ICONS).map(([key, Icon]) => {
                      const count = clip.reaction_counts[key] ?? 0;
                      const isActive = clip.my_reactions.includes(key);
                      return (
                        <motion.div key={key} whileTap={{ scale: 0.9 }}>
                          <Button
                            variant={isActive ? "default" : "ghost"}
                            size="sm"
                            className={`h-8 gap-1 rounded-full px-2.5 text-xs ${
                              isActive ? "shadow-sm" : "hover:bg-muted"
                            }`}
                            onClick={() => handleReact(clip.id, key)}
                          >
                            <Icon className="size-3.5" />
                            {count > 0 && <span className="tabular-nums">{count}</span>}
                          </Button>
                        </motion.div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </ScaleOnHover>
          </StaggerItem>
        ))}
      </StaggerContainer>
    </div>
  );
}
