"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { ColumnDef } from "@tanstack/react-table";
import { Eye, Mic } from "lucide-react";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/client";

interface SessionRow {
  id: string;
  scenario_type: string;
  overall_score: number | null;
  started_at: string;
  ended_at: string | null;
  persona_name: string | null;
}

const SCENARIO_LABELS: Record<string, string> = {
  cold_call: "Cold Call",
  discovery: "Discovery",
  objection_handling: "Objection Handling",
  closing: "Closing",
};

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge variant="outline">-</Badge>;
  const variant =
    score >= 80 ? "default" : score >= 60 ? "secondary" : "destructive";
  return <Badge variant={variant}>{score}</Badge>;
}

function formatDuration(start: string, end: string | null): string {
  if (!end) return "-";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  const secs = Math.floor(ms / 1000);
  const m = Math.floor(secs / 60).toString().padStart(2, "0");
  const s = (secs % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

const columns: ColumnDef<SessionRow>[] = [
  {
    accessorKey: "started_at",
    header: "Date",
    cell: ({ row }) =>
      new Date(row.original.started_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }),
    enableSorting: true,
  },
  {
    accessorKey: "scenario_type",
    header: "Scenario",
    cell: ({ row }) =>
      SCENARIO_LABELS[row.original.scenario_type] ?? row.original.scenario_type,
  },
  {
    id: "persona",
    header: "Persona",
    cell: ({ row }) => row.original.persona_name ?? "N/A",
  },
  {
    accessorKey: "overall_score",
    header: "Score",
    cell: ({ row }) => <ScoreBadge score={row.original.overall_score} />,
    enableSorting: true,
  },
  {
    id: "duration",
    header: "Duration",
    cell: ({ row }) =>
      formatDuration(row.original.started_at, row.original.ended_at),
    enableSorting: true,
  },
  {
    id: "actions",
    header: "Actions",
    cell: ({ row }) => (
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/sessions/${row.original.id}/scorecard`}>
            <Eye className="mr-1 size-3" />
            Scorecard
          </Link>
        </Button>
      </div>
    ),
  },
];

export default function SessionsPage() {
  const supabase = createClient();
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      const { data } = await supabase
        .from("sessions")
        .select(
          "id, scenario_type, started_at, ended_at, personas(persona_json), scorecards(overall_score)",
        )
        .order("started_at", { ascending: false })
        .limit(100);

      if (data) {
        const rows: SessionRow[] = data.map((s: Record<string, unknown>) => {
          const persona = s.personas as Record<string, unknown> | null;
          const scorecard = s.scorecards as Record<string, unknown> | null;
          const personaJson = persona?.persona_json as Record<
            string,
            unknown
          > | null;

          return {
            id: s.id as string,
            scenario_type: s.scenario_type as string,
            started_at: s.started_at as string,
            ended_at: s.ended_at as string | null,
            persona_name: personaJson?.background_summary
              ? String(personaJson.background_summary).split(".")[0]
              : null,
            overall_score: scorecard?.overall_score as number | null ?? null,
          };
        });
        setSessions(rows);
      }
      setLoading(false);
    }
    load();
  }, []);

  if (!loading && sessions.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-24">
        <p className="text-muted-foreground">No sessions yet.</p>
        <Button asChild>
          <Link href="/simulations/new">
            <Mic className="mr-1 size-4" />
            Start Your First Simulation
          </Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Sessions</h1>
          <p className="text-muted-foreground">
            Your simulation history and scores.
          </p>
        </div>
        <Button asChild>
          <Link href="/simulations/new">
            <Mic className="mr-1 size-4" />
            New Simulation
          </Link>
        </Button>
      </div>

      <DataTable columns={columns} data={sessions} loading={loading} />
    </div>
  );
}
