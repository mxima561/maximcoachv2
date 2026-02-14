"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { type ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { createClient } from "@/lib/supabase/client";

interface Lead {
  id: string;
  name: string;
  company: string;
  title: string;
  industry: string;
  source: string;
  created_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  google_sheets: "bg-success text-success-foreground",
  salesforce: "bg-primary text-primary-foreground",
  hubspot: "bg-warning text-warning-foreground",
  manual: "bg-muted text-muted-foreground",
};

const SOURCE_LABELS: Record<string, string> = {
  google_sheets: "Google Sheets",
  salesforce: "Salesforce",
  hubspot: "HubSpot",
  manual: "Manual",
};

const columns: ColumnDef<Lead, unknown>[] = [
  {
    accessorKey: "name",
    header: "Name",
    enableSorting: true,
  },
  {
    accessorKey: "company",
    header: "Company",
    enableSorting: true,
  },
  {
    accessorKey: "title",
    header: "Title",
    enableSorting: true,
  },
  {
    accessorKey: "industry",
    header: "Industry",
    enableSorting: true,
  },
  {
    accessorKey: "source",
    header: "CRM Source",
    enableSorting: false,
    cell: ({ row }) => {
      const source = row.getValue("source") as string;
      return (
        <Badge
          variant="secondary"
          className={SOURCE_COLORS[source] ?? SOURCE_COLORS.manual}
        >
          {SOURCE_LABELS[source] ?? source}
        </Badge>
      );
    },
  },
  {
    accessorKey: "created_at",
    header: "Date Added",
    enableSorting: true,
    cell: ({ row }) => {
      const date = new Date(row.getValue("created_at") as string);
      return date.toLocaleDateString();
    },
  },
];

export default function LeadsPage() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [industryFilter, setIndustryFilter] = useState("all");
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function fetchLeads() {
      const { data } = await supabase
        .from("leads")
        .select("id, name, company, title, industry, source, created_at")
        .order("created_at", { ascending: false });
      setLeads((data as Lead[]) ?? []);
      setLoading(false);
    }
    fetchLeads();
  }, []);

  const industries = useMemo(() => {
    const unique = [...new Set(leads.map((l) => l.industry).filter(Boolean))];
    return unique.sort();
  }, [leads]);

  const filteredLeads = useMemo(() => {
    let result = leads;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          l.company.toLowerCase().includes(q)
      );
    }
    if (industryFilter !== "all") {
      result = result.filter((l) => l.industry === industryFilter);
    }
    return result;
  }, [leads, search, industryFilter]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Leads</h1>
        <p className="text-muted-foreground">
          Manage your imported leads and prospects.
        </p>
      </div>

      <div className="flex items-center gap-4">
        <Input
          placeholder="Search by name or company..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Select value={industryFilter} onValueChange={setIndustryFilter}>
          <SelectTrigger className="w-[200px]">
            <SelectValue placeholder="All Industries" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Industries</SelectItem>
            {industries.map((industry) => (
              <SelectItem key={industry} value={industry}>
                {industry}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <DataTable
        columns={columns}
        data={filteredLeads}
        loading={loading}
        emptyMessage="No leads found. Import leads from Google Sheets to get started."
      />
    </div>
  );
}
