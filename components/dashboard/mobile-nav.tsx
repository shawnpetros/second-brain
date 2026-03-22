"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { LayoutDashboard, MessageSquare, CheckSquare, Search, Sun } from "lucide-react";

const navItems = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Thoughts", href: "/dashboard/thoughts", icon: MessageSquare },
  { label: "Tasks", href: "/dashboard/tasks", icon: CheckSquare },
  { label: "Briefing", href: "/dashboard/briefing", icon: Sun },
  { label: "Search", href: "/dashboard/search", icon: Search },
];

export function MobileNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background md:hidden">
      <div className="flex items-center justify-around h-14">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex flex-col items-center gap-1 px-3 py-1.5 text-xs transition-colors",
              pathname === item.href
                ? "text-foreground"
                : "text-muted-foreground"
            )}
          >
            <item.icon className="h-5 w-5" />
            {item.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
