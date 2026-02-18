"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const navItems = [
  { href: "/", label: "Dashboard", icon: "📊" },
  { href: "/clients", label: "Clients", icon: "🏢" },
  { href: "/signals", label: "Signals", icon: "📡" },
  { href: "/reports", label: "Reports", icon: "📋" },
  { href: "/niches", label: "Niches", icon: "🎯" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

export function Sidebar() {
  const pathname = usePathname();
  const { user, tenant, logout } = useAuth();

  return (
    <aside className="flex h-screen w-64 flex-col border-r bg-background">
      <div className="flex h-14 items-center border-b px-4">
        <Link href="/" className="text-lg font-bold">
          TrendClaw
        </Link>
      </div>

      <nav className="flex-1 space-y-1 p-3">
        {navItems.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              pathname === item.href
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
            )}
          >
            <span>{item.icon}</span>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="border-t p-3">
        <div className="mb-2 px-3">
          <p className="text-sm font-medium">{user?.name || user?.email}</p>
          <p className="text-xs text-muted-foreground">{tenant?.name}</p>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={logout}>
          Log out
        </Button>
      </div>
    </aside>
  );
}
