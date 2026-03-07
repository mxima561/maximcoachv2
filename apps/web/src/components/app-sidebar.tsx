"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Mic,
  Radar,
  History,
  Settings,
  UsersRound,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
  Trophy,
  Swords,
  Flame,
  Dumbbell,
  FileText,
  Play,
} from "lucide-react";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";

const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Drills", href: "/drills", icon: Dumbbell },
      { title: "Simulations", href: "/simulations/new", icon: Mic },
      { title: "Scenarios", href: "/scenarios", icon: Radar },
    ],
  },
  {
    label: "Compete",
    items: [
      { title: "Leaderboards", href: "/leaderboards", icon: Trophy },
      { title: "Challenges", href: "/challenges", icon: Flame },
      { title: "Head-to-Head", href: "/h2h", icon: Swords },
    ],
  },
  {
    label: "Data",
    items: [
      { title: "Sessions", href: "/sessions", icon: History },
      { title: "Transcripts", href: "/transcripts", icon: FileText },
      { title: "Team Feed", href: "/feed", icon: Play },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Integrations", href: "/settings/integrations", icon: Settings },
      { title: "Team", href: "/manager", icon: UsersRound },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";
  const [userName, setUserName] = useState("User");
  const [userInitial, setUserInitial] = useState("U");

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        const name =
          (user.user_metadata?.full_name as string) ??
          user.email?.split("@")[0] ??
          "User";
        setUserName(name);
        setUserInitial(name.charAt(0).toUpperCase());
      }
    });
  }, []);

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2.5">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[oklch(0.60_0.26_310)] text-primary-foreground font-bold text-sm shadow-md shadow-primary/20">
            M
          </div>
          {!isCollapsed && (
            <span className="text-lg font-bold tracking-tight gradient-text">
              MaximaCoach
            </span>
          )}
        </Link>
      </SidebarHeader>

      <Separator className="mx-4 w-auto opacity-50" />

      <SidebarContent className="px-2 py-3">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel className="text-[11px] uppercase tracking-wider text-muted-foreground/60 font-semibold">
              {group.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {group.items.map((item) => {
                  const isActive =
                    pathname === item.href ||
                    pathname.startsWith(item.href + "/");
                  return (
                    <SidebarMenuItem key={item.href}>
                      <SidebarMenuButton
                        asChild
                        isActive={isActive}
                        tooltip={item.title}
                        className="relative"
                      >
                        <Link href={item.href}>
                          {isActive && (
                            <motion.div
                              layoutId="sidebar-active"
                              className="absolute inset-0 rounded-md bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/15"
                              transition={{ type: "spring", stiffness: 350, damping: 30 }}
                            />
                          )}
                          <item.icon className={`size-4 relative z-10 ${isActive ? "text-primary" : ""}`} />
                          <span className={`relative z-10 ${isActive ? "text-primary font-medium" : ""}`}>
                            {item.title}
                          </span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      <SidebarFooter className="px-2 pb-4">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Toggle sidebar">
              <SidebarTrigger className="w-full justify-start">
                {isCollapsed ? (
                  <ChevronsRight className="size-4" />
                ) : (
                  <ChevronsLeft className="size-4" />
                )}
                {!isCollapsed && <span>Collapse</span>}
              </SidebarTrigger>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>

        <Separator className="my-2 opacity-50" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-full cursor-pointer">
              <Avatar className="size-7">
                <AvatarFallback className="bg-gradient-to-br from-primary/20 to-primary/5 text-primary text-xs font-semibold">
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <span className="truncate text-sm font-medium">{userName}</span>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings/integrations">
                <Settings className="mr-2 size-4" />
                Settings
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <form action="/auth/signout" method="post">
                <button type="submit" className="flex w-full items-center">
                  <LogOut className="mr-2 size-4" />
                  Sign out
                </button>
              </form>
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
