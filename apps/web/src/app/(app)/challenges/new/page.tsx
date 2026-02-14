"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

const GOAL_TYPES = [
  {
    value: "sessions_completed",
    label: "Sessions Completed",
    description: "Complete a target number of sessions",
  },
  {
    value: "avg_score_above",
    label: "Average Score Above",
    description: "Maintain an average score above a threshold",
  },
  {
    value: "specific_scenario_count",
    label: "Scenario Count",
    description: "Complete sessions on a specific scenario type",
  },
] as const;

const SCENARIO_OPTIONS = [
  "cold_call",
  "discovery",
  "objection_handling",
  "closing",
] as const;

const CreateChallengeSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().min(1, "Description is required"),
  goal_type: z.enum(["sessions_completed", "avg_score_above", "specific_scenario_count"]),
  goal_value: z.number().int().min(1, "Goal must be at least 1"),
  timeframe_weeks: z.number().int().min(1).max(4),
  scenario_constraints: z.array(z.string()).optional(),
  reward: z.string().optional(),
});

export default function NewChallengePage() {
  const router = useRouter();
  const supabase = createClient();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [goalType, setGoalType] = useState<string>("sessions_completed");
  const [goalValue, setGoalValue] = useState("");
  const [timeframeWeeks, setTimeframeWeeks] = useState("2");
  const [scenarioConstraints, setScenarioConstraints] = useState<string[]>([]);
  const [reward, setReward] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  function toggleScenario(scenario: string) {
    setScenarioConstraints((prev) =>
      prev.includes(scenario)
        ? prev.filter((s) => s !== scenario)
        : [...prev, scenario],
    );
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrors({});

    const parsed = CreateChallengeSchema.safeParse({
      title,
      description,
      goal_type: goalType,
      goal_value: Number(goalValue),
      timeframe_weeks: Number(timeframeWeeks),
      scenario_constraints:
        scenarioConstraints.length > 0 ? scenarioConstraints : undefined,
      reward: reward || undefined,
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const field = issue.path[0];
        if (field) fieldErrors[String(field)] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profile } = await supabase
      .from("users")
      .select("org_id, role")
      .eq("id", user.id)
      .single();

    if (!profile?.org_id) return;
    if (profile.role !== "admin" && profile.role !== "manager") {
      setErrors({ title: "Only managers and admins can create challenges" });
      setSubmitting(false);
      return;
    }

    const timeframe_weeks = Number(timeframeWeeks);
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + timeframe_weeks * 7);

    const { data, error } = await supabase
      .from("challenges")
      .insert({
        ...parsed.data,
        org_id: profile.org_id,
        status: "active",
        end_date: endDate.toISOString(),
      })
      .select("id")
      .single();

    if (error) {
      setErrors({ title: error.message });
      setSubmitting(false);
      return;
    }

    router.push(`/challenges/${data.id}`);
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Create Challenge
        </h1>
        <p className="text-muted-foreground">
          Set a goal for your team and motivate them to compete.
        </p>
      </div>

      <form onSubmit={handleSubmit}>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Challenge Details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                placeholder="e.g. February Cold Call Blitz"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              {errors.title && (
                <p className="text-sm text-destructive">{errors.title}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                placeholder="Describe the challenge and what reps should aim for..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
              />
              {errors.description && (
                <p className="text-sm text-destructive">{errors.description}</p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>Goal Type</Label>
                <Select value={goalType} onValueChange={setGoalType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GOAL_TYPES.map((gt) => (
                      <SelectItem key={gt.value} value={gt.value}>
                        {gt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="goalValue">Goal Value</Label>
                <Input
                  id="goalValue"
                  type="number"
                  min={1}
                  placeholder={
                    goalType === "avg_score_above" ? "e.g. 80" : "e.g. 10"
                  }
                  value={goalValue}
                  onChange={(e) => setGoalValue(e.target.value)}
                />
                {errors.goal_value && (
                  <p className="text-sm text-destructive">
                    {errors.goal_value}
                  </p>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <Label>Timeframe</Label>
              <Select value={timeframeWeeks} onValueChange={setTimeframeWeeks}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 week</SelectItem>
                  <SelectItem value="2">2 weeks</SelectItem>
                  <SelectItem value="3">3 weeks</SelectItem>
                  <SelectItem value="4">4 weeks</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Scenario Constraints (optional)</Label>
              <p className="text-xs text-muted-foreground">
                Limit which scenario types count toward this challenge.
              </p>
              <div className="flex flex-wrap gap-2">
                {SCENARIO_OPTIONS.map((scenario) => {
                  const isSelected = scenarioConstraints.includes(scenario);
                  return (
                    <button
                      key={scenario}
                      type="button"
                      onClick={() => toggleScenario(scenario)}
                      className={`rounded-full border px-3 py-1 text-sm transition-colors ${
                        isSelected
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border hover:border-primary"
                      }`}
                    >
                      {scenario.replace("_", " ")}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="reward">Reward (optional)</Label>
              <Input
                id="reward"
                placeholder="e.g. Team lunch, Gift card, Bragging rights"
                value={reward}
                onChange={(e) => setReward(e.target.value)}
              />
            </div>
          </CardContent>
        </Card>

        <div className="mt-4 flex justify-end gap-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.back()}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? "Creating..." : "Create Challenge"}
          </Button>
        </div>
      </form>
    </div>
  );
}
