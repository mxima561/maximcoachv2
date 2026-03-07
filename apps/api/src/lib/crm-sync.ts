import { createServiceClient } from "./supabase.js";

interface SalesforceContact {
  Id: string;
  FirstName: string | null;
  LastName: string;
  Email: string | null;
  Title: string | null;
  Company: string | null;
  Phone: string | null;
  Industry: string | null;
  LastModifiedDate: string;
}

interface SalesforceQueryResult {
  records: SalesforceContact[];
  totalSize: number;
}

async function refreshSalesforceToken(
  orgId: string,
  refreshToken: string,
): Promise<string | null> {
  const res = await fetch(
    "https://login.salesforce.com/services/oauth2/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.SALESFORCE_CLIENT_ID || "",
        client_secret: process.env.SALESFORCE_CLIENT_SECRET || "",
        refresh_token: refreshToken,
      }),
    },
  );

  if (!res.ok) return null;

  const data = (await res.json()) as { access_token: string };
  const supabase = createServiceClient();

  await supabase
    .from("integrations")
    .update({ access_token_encrypted: data.access_token })
    .eq("org_id", orgId)
    .eq("provider", "salesforce");

  return data.access_token;
}

export async function syncSalesforce(orgId: string) {
  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "salesforce")
    .single();

  if (!integration) throw new Error("Salesforce integration not found");

  let accessToken = integration.access_token_encrypted;
  const instanceUrl = integration.instance_url;

  // Fetch contacts from Salesforce
  let res = await fetch(
    `${instanceUrl}/services/data/v59.0/query?q=SELECT+Id,FirstName,LastName,Email,Title,Company,Phone,Industry,LastModifiedDate+FROM+Contact+ORDER+BY+LastModifiedDate+DESC+LIMIT+500`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  // Token expired — refresh
  if (res.status === 401) {
    const newToken = await refreshSalesforceToken(
      orgId,
      integration.refresh_token_encrypted,
    );
    if (!newToken) {
      await supabase
        .from("integrations")
        .update({ status: "error", sync_errors: "Token refresh failed" })
        .eq("org_id", orgId)
        .eq("provider", "salesforce");
      throw new Error("Token refresh failed");
    }
    accessToken = newToken;
    res = await fetch(
      `${instanceUrl}/services/data/v59.0/query?q=SELECT+Id,FirstName,LastName,Email,Title,Company,Phone,Industry,LastModifiedDate+FROM+Contact+ORDER+BY+LastModifiedDate+DESC+LIMIT+500`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    await supabase
      .from("integrations")
      .update({ sync_errors: errText })
      .eq("org_id", orgId)
      .eq("provider", "salesforce");
    throw new Error(`Salesforce API error: ${errText}`);
  }

  const sfData = (await res.json()) as SalesforceQueryResult;

  // Batch upsert contacts
  const rows = sfData.records.map((contact) => ({
    org_id: orgId,
    name: [contact.FirstName, contact.LastName].filter(Boolean).join(" "),
    email: contact.Email,
    title: contact.Title,
    company: contact.Company,
    phone: contact.Phone,
    industry: contact.Industry,
    crm_id: contact.Id,
    crm_source: "salesforce" as const,
  }));

  const { count: synced } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "org_id,crm_id", ignoreDuplicates: false, count: "exact" });

  // Update sync status
  await supabase
    .from("integrations")
    .update({
      last_sync: new Date().toISOString(),
      records_synced: synced ?? 0,
      sync_errors: null,
      status: "connected",
    })
    .eq("org_id", orgId)
    .eq("provider", "salesforce");

  return { synced: synced ?? 0, total: sfData.totalSize };
}

export async function syncHubSpot(orgId: string) {
  const supabase = createServiceClient();

  const { data: integration } = await supabase
    .from("integrations")
    .select("*")
    .eq("org_id", orgId)
    .eq("provider", "hubspot")
    .single();

  if (!integration) throw new Error("HubSpot integration not found");

  let accessToken = integration.access_token_encrypted;

  // Fetch contacts
  let res = await fetch(
    "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,jobtitle,company,phone,industry,hs_lastmodifieddate",
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  // Token expired — refresh
  if (res.status === 401) {
    const refreshRes = await fetch("https://api.hubapi.com/oauth/v1/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        client_id: process.env.HUBSPOT_CLIENT_ID || "",
        client_secret: process.env.HUBSPOT_CLIENT_SECRET || "",
        refresh_token: integration.refresh_token_encrypted,
      }),
    });

    if (!refreshRes.ok) {
      await supabase
        .from("integrations")
        .update({ status: "error", sync_errors: "Token refresh failed" })
        .eq("org_id", orgId)
        .eq("provider", "hubspot");
      throw new Error("HubSpot token refresh failed");
    }

    const refreshData = (await refreshRes.json()) as {
      access_token: string;
      refresh_token: string;
    };
    accessToken = refreshData.access_token;

    await supabase
      .from("integrations")
      .update({
        access_token_encrypted: refreshData.access_token,
        refresh_token_encrypted: refreshData.refresh_token,
      })
      .eq("org_id", orgId)
      .eq("provider", "hubspot");

    res = await fetch(
      "https://api.hubapi.com/crm/v3/objects/contacts?limit=100&properties=firstname,lastname,email,jobtitle,company,phone,industry,hs_lastmodifieddate",
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
  }

  if (!res.ok) {
    const errText = await res.text();
    await supabase
      .from("integrations")
      .update({ sync_errors: errText })
      .eq("org_id", orgId)
      .eq("provider", "hubspot");
    throw new Error(`HubSpot API error: ${errText}`);
  }

  const hsData = (await res.json()) as {
    results: {
      id: string;
      properties: Record<string, string | null>;
    }[];
    total: number;
  };

  // Batch upsert contacts
  const rows = hsData.results.map((contact) => {
    const props = contact.properties;
    return {
      org_id: orgId,
      name: [props.firstname, props.lastname].filter(Boolean).join(" "),
      email: props.email,
      title: props.jobtitle,
      company: props.company,
      phone: props.phone,
      industry: props.industry,
      crm_id: contact.id,
      crm_source: "hubspot" as const,
    };
  });

  const { count: synced } = await supabase
    .from("leads")
    .upsert(rows, { onConflict: "org_id,crm_id", ignoreDuplicates: false, count: "exact" });

  await supabase
    .from("integrations")
    .update({
      last_sync: new Date().toISOString(),
      records_synced: synced ?? 0,
      sync_errors: null,
      status: "connected",
    })
    .eq("org_id", orgId)
    .eq("provider", "hubspot");

  return { synced: synced ?? 0, total: hsData.total };
}
