"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Users,
  FileText,
  CheckSquare,
  Calendar,
  Settings,
  ChevronRight,
  Building2,
  User,
  Plug,
} from "lucide-react";

type Client = {
  id: string;
  name: string;
  type: string;
  role: string;
  color: string;
};

const navItems = [
  { href: "/dashboard", label: "Přehled", icon: LayoutDashboard },
  { href: "/tasks", label: "Úkoly", icon: CheckSquare },
  { href: "/documents", label: "Dokumenty", icon: FileText },
  { href: "/calendar", label: "Kalendář daní", icon: Calendar },
  { href: "/integrations", label: "Integrace", icon: Plug },
  { href: "/settings", label: "Nastavení", icon: Settings },
];

export default function Sidebar({ clients }: { clients: Client[] }) {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0 border-r border-border bg-card flex flex-col h-full">
      {/* Logo */}
      <div className="px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <span className="text-white font-bold text-sm">A</span>
          </div>
          <div>
            <p className="font-semibold text-sm text-foreground">ALISIO</p>
            <p className="text-xs text-muted-foreground">Účetní kabinet</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="p-3 flex-1 overflow-y-auto">
        <div className="space-y-0.5">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors",
                  active
                    ? "bg-primary/10 text-primary font-medium"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                )}
              >
                <Icon className="w-4 h-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </div>

        {/* Clients section */}
        <div className="mt-6">
          <div className="flex items-center justify-between px-3 mb-2">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Klienti
            </span>
            <Link
              href="/clients/new"
              className="text-xs text-primary hover:underline"
            >
              + Přidat
            </Link>
          </div>
          <div className="space-y-0.5">
            {clients.map((client) => {
              const href = `/clients/${client.id}`;
              const active = pathname.startsWith(href);
              return (
                <Link
                  key={client.id}
                  href={href}
                  className={cn(
                    "flex items-center gap-2.5 px-3 py-2 rounded-md text-sm transition-colors group",
                    active
                      ? "bg-accent text-foreground font-medium"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground"
                  )}
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center shrink-0"
                    style={{ backgroundColor: client.color + "20" }}
                  >
                    {client.type === "company" ? (
                      <Building2
                        className="w-3.5 h-3.5"
                        style={{ color: client.color }}
                      />
                    ) : (
                      <User
                        className="w-3.5 h-3.5"
                        style={{ color: client.color }}
                      />
                    )}
                  </div>
                  <span className="truncate flex-1">{client.name}</span>
                  {active && (
                    <ChevronRight className="w-3.5 h-3.5 shrink-0 opacity-50" />
                  )}
                </Link>
              );
            })}
          </div>
        </div>
      </nav>

      {/* Bottom */}
      <div className="p-3 border-t border-border">
        <div className="flex items-center gap-2.5 px-3 py-2 rounded-md">
          <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center">
            <User className="w-4 h-4 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              Stepan
            </p>
            <p className="text-xs text-muted-foreground">Majitel</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
