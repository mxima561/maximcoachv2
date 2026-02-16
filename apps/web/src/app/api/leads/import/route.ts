import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

const ImportRequestSchema = z.object({
  sheet_id: z.string().min(1),
  range: z.string().default("Sheet1"),
});

const LeadRowSchema = z.object({
  name: z.string().min(1),
  company: z.string().min(1),
  title: z.string().min(1),
  industry: z.string().min(1),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().optional().or(z.literal("")),
  notes: z.string().optional().or(z.literal("")),
});

export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json();
  const parsed = ImportRequestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  // Get Google credentials from integrations
  const { data: integration } = await supabase
    .from("integrations")
    .select("credentials_json")
    .eq("user_id", user.id)
    .eq("provider", "google_sheets")
    .eq("status", "active")
    .single();

  if (!integration?.credentials_json) {
    return NextResponse.json(
      { error: "Google Sheets not connected. Please authorize first." },
      { status: 403 }
    );
  }

  // Read the sheet
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(
    integration.credentials_json as Record<string, unknown>
  );

  const sheets = google.sheets({ version: "v4", auth: oauth2Client });

  let rows: string[][];
  try {
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: parsed.data.sheet_id,
      range: parsed.data.range,
    });
    rows = (response.data.values ?? []) as string[][];
  } catch {
    return NextResponse.json(
      { error: "Failed to read Google Sheet. Check permissions and sheet ID." },
      { status: 400 }
    );
  }

  if (rows.length < 2) {
    return NextResponse.json(
      { error: "Sheet must have a header row and at least one data row." },
      { status: 400 }
    );
  }

  // Parse header and map columns
  const headers = rows[0].map((h) => h.toLowerCase().trim());
  const dataRows = rows.slice(1);

  const colMap = {
    name: headers.indexOf("name"),
    company: headers.indexOf("company"),
    title: headers.indexOf("title"),
    industry: headers.indexOf("industry"),
    email: headers.indexOf("email"),
    phone: headers.indexOf("phone"),
    notes: headers.indexOf("notes"),
  };

  if (colMap.name === -1 || colMap.company === -1) {
    return NextResponse.json(
      { error: "Sheet must have 'name' and 'company' columns." },
      { status: 400 }
    );
  }

  // Get user's organization_id
  const { data: orgUser } = await supabase
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  const orgId = orgUser?.organization_id;

  if (!orgId) {
    return NextResponse.json(
      { error: "Organization not found for user." },
      { status: 400 }
    );
  }

  // Get existing leads for duplicate detection
  const { data: existingLeads } = await supabase
    .from("leads")
    .select("name, company")
    .eq("org_id", orgId);

  const existingSet = new Set(
    (existingLeads ?? []).map(
      (l: { name: string; company: string }) =>
        `${l.name.toLowerCase()}|${l.company.toLowerCase()}`
    )
  );

  const imported: string[] = [];
  const skipped: string[] = [];
  const errors: Array<{ row: number; message: string }> = [];

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    const rowNum = i + 2; // 1-indexed + header

    const rawData = {
      name: colMap.name >= 0 ? row[colMap.name]?.trim() : "",
      company: colMap.company >= 0 ? row[colMap.company]?.trim() : "",
      title: colMap.title >= 0 ? row[colMap.title]?.trim() : "",
      industry: colMap.industry >= 0 ? row[colMap.industry]?.trim() : "",
      email: colMap.email >= 0 ? row[colMap.email]?.trim() : "",
      phone: colMap.phone >= 0 ? row[colMap.phone]?.trim() : "",
      notes: colMap.notes >= 0 ? row[colMap.notes]?.trim() : "",
    };

    const validation = LeadRowSchema.safeParse(rawData);
    if (!validation.success) {
      errors.push({
        row: rowNum,
        message: validation.error.issues.map((e) => e.message).join(", "),
      });
      continue;
    }

    const lead = validation.data;
    const dupeKey = `${lead.name.toLowerCase()}|${lead.company.toLowerCase()}`;
    if (existingSet.has(dupeKey)) {
      skipped.push(`Row ${rowNum}: ${lead.name} at ${lead.company} (duplicate)`);
      continue;
    }

    const { error: insertError } = await supabase.from("leads").insert({
      org_id: orgId,
      name: lead.name,
      company: lead.company,
      title: lead.title,
      industry: lead.industry,
      email: lead.email || null,
      phone: lead.phone || null,
      notes: lead.notes || null,
      source: "google_sheets",
    });

    if (insertError) {
      errors.push({ row: rowNum, message: insertError.message });
    } else {
      imported.push(`${lead.name} at ${lead.company}`);
      existingSet.add(dupeKey);
    }
  }

  return NextResponse.json({
    total: dataRows.length,
    imported: imported.length,
    skipped: skipped.length,
    errors: errors.length,
    details: { imported, skipped, errors },
  });
}
