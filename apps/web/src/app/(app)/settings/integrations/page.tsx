"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Cloud,
  Link2,
  Unlink,
  RefreshCw,
  CheckCircle,
  XCircle,
  Clock,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { createClient } from "@/lib/supabase/client";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface IntegrationStatus {
  status: string;
  last_sync: string | null;
  records_synced: number;
  sync_errors?: string | null;
}

const PROVIDERS = [
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync contacts and leads bi-directionally with Salesforce CRM.",
    color: "text-blue-500",
  },
  {
    id: "hubspot",
    name: "HubSpot",
    description: "Sync contacts and deals from HubSpot CRM.",
    color: "text-orange-500",
  },
] as const;

export default function IntegrationsPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [statuses, setStatuses] = useState<Record<string, IntegrationStatus>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState<Record<string, boolean>>({});
  const [disconnectTarget, setDisconnectTarget] = useState<string | null>(null);

  useEffect(() => {
    async function init() {
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
      if (profile.role !== "admin") return;

      setOrgId(profile.org_id);

      // Fetch statuses for all providers
      const results: Record<string, IntegrationStatus> = {};
      for (const p of PROVIDERS) {
        const res = await fetch(
          `${API_BASE}/api/integrations/${p.id}/${profile.org_id}/status`,
        );
        if (res.ok) {
          results[p.id] = await res.json();
        }
      }
      setStatuses(results);
      setLoading(false);
    }
    init();
  }, []);

  const justConnected = searchParams.get("connected");

  async function handleConnect(provider: string) {
    if (!orgId) return;
    window.location.href = `${API_BASE}/api/integrations/${provider}/auth?org_id=${orgId}`;
  }

  async function handleDisconnect(provider: string) {
    if (!orgId) return;
    await fetch(`${API_BASE}/api/integrations/${provider}/${orgId}`, {
      method: "DELETE",
    });
    setStatuses((prev) => ({
      ...prev,
      [provider]: {
        status: "disconnected",
        last_sync: null,
        records_synced: 0,
      },
    }));
    setDisconnectTarget(null);
  }

  async function handleSync(provider: string) {
    if (!orgId) return;
    setSyncing((prev) => ({ ...prev, [provider]: true }));
    await fetch(`${API_BASE}/api/integrations/${provider}/sync`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ org_id: orgId }),
    });
    // Poll for updated status after a delay
    setTimeout(async () => {
      const res = await fetch(
        `${API_BASE}/api/integrations/${provider}/${orgId}/status`,
      );
      if (res.ok) {
        const data = await res.json();
        setStatuses((prev) => ({ ...prev, [provider]: data }));
      }
      setSyncing((prev) => ({ ...prev, [provider]: false }));
    }, 3000);
  }

  if (loading) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        Loading...
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          CRM Integrations
        </h1>
        <p className="text-muted-foreground">
          Connect your CRM to automatically sync leads and contacts.
        </p>
      </div>

      {justConnected && (
        <div className="flex items-center gap-2 rounded-lg border border-green-200 bg-green-50 p-3 text-sm text-green-800 dark:border-green-900 dark:bg-green-950 dark:text-green-200">
          <CheckCircle className="size-4" />
          Successfully connected {justConnected}! Initial sync has been queued.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {PROVIDERS.map((provider) => {
          const status = statuses[provider.id];
          const isConnected = status?.status === "connected";
          const hasError = status?.status === "error";
          const isSyncing = syncing[provider.id];

          return (
            <Card key={provider.id}>
              <CardHeader>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <Cloud className={`size-6 ${provider.color}`} />
                    <div>
                      <CardTitle className="text-base">
                        {provider.name}
                      </CardTitle>
                      <p className="text-sm text-muted-foreground">
                        {provider.description}
                      </p>
                    </div>
                  </div>
                  <Badge
                    variant={
                      isConnected
                        ? "default"
                        : hasError
                          ? "destructive"
                          : "secondary"
                    }
                  >
                    {isConnected
                      ? "Connected"
                      : hasError
                        ? "Error"
                        : "Disconnected"}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {isConnected && (
                  <div className="space-y-2 text-sm">
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Clock className="size-3" />
                      Last sync:{" "}
                      {status.last_sync
                        ? new Date(status.last_sync).toLocaleString()
                        : "Never"}
                    </div>
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <CheckCircle className="size-3" />
                      {status.records_synced} records synced
                    </div>
                    {status.sync_errors && (
                      <div className="flex items-center gap-2 text-destructive">
                        <XCircle className="size-3" />
                        {status.sync_errors}
                      </div>
                    )}
                  </div>
                )}

                <div className="flex gap-2">
                  {isConnected ? (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleSync(provider.id)}
                        disabled={isSyncing}
                      >
                        <RefreshCw
                          className={`mr-1 size-3 ${isSyncing ? "animate-spin" : ""}`}
                        />
                        {isSyncing ? "Syncing..." : "Sync Now"}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-destructive"
                        onClick={() => setDisconnectTarget(provider.id)}
                      >
                        <Unlink className="mr-1 size-3" />
                        Disconnect
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      onClick={() => handleConnect(provider.id)}
                    >
                      <Link2 className="mr-1 size-3" />
                      Connect {provider.name}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Disconnect confirmation dialog */}
      <Dialog
        open={disconnectTarget !== null}
        onOpenChange={() => setDisconnectTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Disconnect CRM?</DialogTitle>
            <DialogDescription>
              This will remove the connection and stop automatic syncing. Your
              existing lead data will not be deleted.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDisconnectTarget(null)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() =>
                disconnectTarget && handleDisconnect(disconnectTarget)
              }
            >
              Disconnect
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
