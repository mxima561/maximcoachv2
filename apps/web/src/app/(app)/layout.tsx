import { Suspense } from "react";
import { redirect } from "next/navigation";
import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AppSidebar } from "@/components/app-sidebar";
import { PageTransition } from "@/components/page-transition";
import { Providers } from "@/components/providers";
import { SkeletonCard } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/server";

function PageFallback() {
  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <SkeletonCard key={i} />
      ))}
    </div>
  );
}

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return (
    <Providers>
      <TooltipProvider>
        <SidebarProvider>
          <AppSidebar />
          <SidebarInset className="flex-1 overflow-auto">
            <main className="p-6">
              <Suspense fallback={<PageFallback />}>
                <PageTransition>{children}</PageTransition>
              </Suspense>
            </main>
          </SidebarInset>
        </SidebarProvider>
      </TooltipProvider>
    </Providers>
  );
}
