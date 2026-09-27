import { Link } from "@tanstack/react-router";
import { CalendarDays, Dumbbell, UserRound } from "lucide-react";

const TABS = [
  { to: "/home", label: "Home", Icon: Dumbbell },
  { to: "/history", label: "History", Icon: CalendarDays },
  { to: "/profile", label: "Profile", Icon: UserRound },
] as const;

export function BottomNav() {
  return (
    <nav
      aria-label="Main navigation"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-background/95 backdrop-blur"
    >
      <ul className="mx-auto flex w-full max-w-lg items-stretch pb-[env(safe-area-inset-bottom)]">
        {TABS.map(({ to, label, Icon }) => (
          <li key={to} className="flex-1">
            <Link
              to={to}
              preload="intent"
              activeProps={{ className: "text-primary", "aria-current": "page" }}
              inactiveProps={{ className: "text-muted-foreground" }}
              className="flex h-16 flex-col items-center justify-center gap-1 transition-colors hover:text-foreground"
            >
              <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
              <span className="text-[0.7rem] font-medium tracking-wide">{label}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
