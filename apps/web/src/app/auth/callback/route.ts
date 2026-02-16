import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Check if user has an organization
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data: orgMembership } = await supabase
          .from("organization_users")
          .select("organization_id")
          .eq("user_id", user.id)
          .maybeSingle();

        // If no org, redirect to onboarding
        if (!orgMembership) {
          return NextResponse.redirect(`${origin}/onboarding`);
        }
      }

      // If has org or next param specified, use that
      const destination = next ?? "/dashboard";
      return NextResponse.redirect(`${origin}${destination}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
}
