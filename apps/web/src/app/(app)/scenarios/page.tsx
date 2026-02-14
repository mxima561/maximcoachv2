"use client";

import { useRouter } from "next/navigation";
import {
  Phone,
  Search,
  ShieldAlert,
  Handshake,
  Clock,
  BarChart3,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const SCENARIOS = [
  {
    type: "cold_call" as const,
    name: "Cold Call",
    description:
      "Practice reaching out to prospects who have never heard of you. Focus on grabbing attention, building rapport quickly, and earning the right to continue the conversation.",
    icon: Phone,
    difficulty: "Medium",
    estimatedMinutes: 8,
    skills: ["Opening", "Rapport Building", "Value Prop"],
  },
  {
    type: "discovery" as const,
    name: "Discovery",
    description:
      "Lead a discovery call to uncover the prospect's pain points, priorities, and decision-making process. Practice active listening and strategic questioning.",
    icon: Search,
    difficulty: "Medium",
    estimatedMinutes: 12,
    skills: ["Questioning", "Active Listening", "Needs Analysis"],
  },
  {
    type: "objection_handling" as const,
    name: "Objection Handling",
    description:
      "Face realistic objections like price pushback, competitor comparisons, and timing concerns. Build confidence in navigating resistance.",
    icon: ShieldAlert,
    difficulty: "Hard",
    estimatedMinutes: 10,
    skills: ["Reframing", "Empathy", "Persistence"],
  },
  {
    type: "closing" as const,
    name: "Closing",
    description:
      "Practice moving deals to commitment. Handle last-minute hesitation, negotiate terms, and secure next steps or a signed agreement.",
    icon: Handshake,
    difficulty: "Hard",
    estimatedMinutes: 10,
    skills: ["Urgency", "Negotiation", "Commitment"],
  },
] as const;

function DifficultyBadge({ level }: { level: string }) {
  const variant = level === "Hard" ? "destructive" : "secondary";
  return <Badge variant={variant}>{level}</Badge>;
}

export default function ScenariosPage() {
  const router = useRouter();

  function handleSelect(scenarioType: string) {
    router.push(`/simulations/new?scenario=${scenarioType}`);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Scenarios</h1>
        <p className="text-muted-foreground">
          Choose a scenario type to practice. Each focuses on different sales
          skills.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        {SCENARIOS.map((scenario) => {
          const Icon = scenario.icon;
          return (
            <Card
              key={scenario.type}
              className="cursor-pointer transition-shadow hover:shadow-md"
              onClick={() => handleSelect(scenario.type)}
            >
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10">
                      <Icon className="size-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">
                        {scenario.name}
                      </CardTitle>
                      <div className="mt-1 flex items-center gap-2">
                        <DifficultyBadge level={scenario.difficulty} />
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="size-3" />
                          ~{scenario.estimatedMinutes} min
                        </span>
                      </div>
                    </div>
                  </div>
                  <BarChart3 className="size-4 text-muted-foreground" />
                </div>
              </CardHeader>
              <CardContent>
                <CardDescription className="mb-3">
                  {scenario.description}
                </CardDescription>
                <div className="flex flex-wrap gap-1.5">
                  {scenario.skills.map((skill) => (
                    <Badge key={skill} variant="outline" className="text-xs">
                      {skill}
                    </Badge>
                  ))}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
