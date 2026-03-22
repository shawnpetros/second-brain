"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { UserButton } from "@clerk/nextjs";
import { cn } from "@/lib/utils";
import { Brain, LayoutDashboard, MessageSquare, CheckSquare, Search, Sun, Inbox } from "lucide-react";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Thoughts", href: "/dashboard/thoughts", icon: MessageSquare },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Queue", href: "/dashboard/queue", icon: Inbox },
  { label: "Briefing", href: "/dashboard/briefing", icon: Sun },
  { label: "Search", href: "/dashboard/search", icon: Search },
];

export function NavBar() {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="flex h-14 items-center px-4 md:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 mr-6">
          <Brain className="h-5 w-5 text-violet-400" />
          <span className="font-semibold hidden sm:inline">Open Brain</span>
        </Link>
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors",
                pathname === item.href
                  ? "bg-accent text-accent-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto">
          <UserButton />
        </div>
      </div>
    </header>
  );
}
