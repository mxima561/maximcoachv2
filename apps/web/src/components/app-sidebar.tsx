"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import {
  LayoutDashboard,
  Mic,
  Users,
  History,
  ClipboardCheck,
  Settings,
  UsersRound,
  LogOut,
  ChevronsLeft,
  ChevronsRight,
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

const NAV_GROUPS = [
  {
    label: "Main",
    items: [
      { title: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
      { title: "Simulations", href: "/simulations", icon: Mic },
    ],
  },
  {
    label: "Data",
    items: [
      { title: "Leads", href: "/leads", icon: Users },
      { title: "Sessions", href: "/sessions", icon: History },
      { title: "Scorecards", href: "/scorecards", icon: ClipboardCheck },
    ],
  },
  {
    label: "Admin",
    items: [
      { title: "Settings", href: "/settings", icon: Settings },
      { title: "Team", href: "/manager/team", icon: UsersRound },
    ],
  },
];

export function AppSidebar() {
  const pathname = usePathname();
  const { state } = useSidebar();
  const isCollapsed = state === "collapsed";

  return (
    <Sidebar collapsible="icon" className="border-r border-sidebar-border">
      <SidebarHeader className="px-4 py-4">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground font-bold text-sm">
            M
          </div>
          {!isCollapsed && (
            <span className="text-lg font-semibold tracking-tight">
              MaximaCoach
            </span>
          )}
        </Link>
      </SidebarHeader>

      <Separator className="mx-4 w-auto" />

      <SidebarContent className="px-2 py-2">
        {NAV_GROUPS.map((group) => (
          <SidebarGroup key={group.label}>
            <SidebarGroupLabel>{group.label}</SidebarGroupLabel>
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
                      >
                        <Link href={item.href}>
                          <item.icon className="size-4" />
                          <span>{item.title}</span>
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

        <Separator className="my-2" />

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton className="w-full cursor-pointer">
              <Avatar className="size-6">
                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                  U
                </AvatarFallback>
              </Avatar>
              {!isCollapsed && (
                <span className="truncate text-sm">User</span>
              )}
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" align="start" className="w-48">
            <DropdownMenuItem asChild>
              <Link href="/settings">
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
