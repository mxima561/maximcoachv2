import { NextResponse, type NextRequest } from "next/server";
import { google } from "googleapis";
import { createClient } from "@/lib/supabase/server";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/google/callback`
);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  if (!code) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/leads?error=google_auth_failed`
    );
  }

  const { tokens } = await oauth2Client.getToken(code);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/login`
    );
  }

  const { data: orgUser } = await supabase
    .from("organization_users")
    .select("organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (!orgUser?.organization_id) {
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_APP_URL}/onboarding`
    );
  }

  // Store Google tokens in integrations table
  await supabase.from("integrations").upsert(
    {
      user_id: user.id,
      org_id: orgUser.organization_id,
      provider: "google_sheets",
      credentials_json: tokens,
      status: "active",
    },
    { onConflict: "user_id,provider" }
  );

  return NextResponse.redirect(
    `${process.env.NEXT_PUBLIC_APP_URL}/leads?google_connected=true`
  );
}
