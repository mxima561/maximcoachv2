"use client";

import { Clock, Zap, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface DrillCardProps {
  title: string;
  skillCategory: string;
  difficulty: number;
  status: "pending" | "completed";
  xpReward?: number;
  onStart?: () => void;
  onComplete?: () => void;
}

const difficultyLabel = (d: number) => {
  if (d <= 3) return { text: "Easy", variant: "secondary" as const };
  if (d <= 6) return { text: "Medium", variant: "default" as const };
  return { text: "Hard", variant: "destructive" as const };
};

export function DrillCard({
  title,
  skillCategory,
  difficulty,
  status,
  xpReward = 50,
  onStart,
  onComplete,
}: DrillCardProps) {
  const isCompleted = status === "completed";
  const diff = difficultyLabel(difficulty);

  return (
    <Card className={isCompleted ? "border-primary/30 bg-primary/5" : ""}>
      <CardContent className="flex items-center gap-4 pt-6">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            isCompleted
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground"
          }`}
        >
          {isCompleted ? (
            <CheckCircle2 className="size-5" />
          ) : (
            <Zap className="size-5" />
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className={`font-medium ${isCompleted ? "line-through opacity-60" : ""}`}>
            {title}
          </p>
          <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
            <span>{skillCategory}</span>
            <span>·</span>
            <Badge variant={diff.variant} className="text-[10px] px-1.5 py-0">
              {diff.text}
            </Badge>
            <span>·</span>
            <span className="flex items-center gap-0.5">
              <Clock className="size-3" /> {difficulty * 30}s
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!isCompleted && (
            <span className="text-xs text-muted-foreground">+{xpReward} XP</span>
          )}
          {isCompleted ? (
            <Badge variant="outline" className="text-primary">
              Done
            </Badge>
          ) : (
            <Button size="sm" onClick={onStart ?? onComplete}>
              Start
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
