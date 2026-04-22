import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Compass, Bookmark, CheckCircle, History, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();

  const navigation = [
    { name: "Saves", href: "/saves", icon: Bookmark },
    { name: "Decide", href: "/decide", icon: CheckCircle },
    { name: "History", href: "/history", icon: History },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">

      {/* Mobile top bar — minimal, no hamburger */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <Link href="/saves" className="flex items-center gap-2">
          <Compass className="h-5 w-5 text-primary" />
          <span className="font-serif font-bold text-base">Where To</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground gap-1.5 h-8 px-2"
          onClick={() => signOut()}
          data-testid="button-sign-out"
        >
          <LogOut className="h-3.5 w-3.5" />
          Out
        </Button>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden md:flex w-64 flex-col border-r border-border bg-card fixed inset-y-0 left-0">
        <div className="p-6">
          <Link href="/saves" className="flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary" />
            <span className="font-serif font-bold text-xl">Where To</span>
          </Link>
        </div>
        <nav className="flex flex-col gap-2 px-4 flex-1">
          {navigation.map((item) => {
            const isActive = location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2 transition-colors ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                data-testid={`link-desktop-${item.name.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4" />
                <span className="font-medium">{item.name}</span>
              </Link>
            );
          })}
        </nav>
        <div className="p-4 border-t border-border mt-auto">
          <div className="flex items-center gap-3 px-3 py-2 mb-2">
            <img
              src={user?.imageUrl}
              alt={user?.fullName || "User"}
              className="h-8 w-8 rounded-full"
              data-testid="img-avatar"
            />
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate" data-testid="text-username">
                {user?.firstName}
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            className="w-full justify-start text-muted-foreground hover:text-foreground"
            onClick={() => signOut()}
            data-testid="button-sign-out"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Sign Out
          </Button>
        </div>
      </div>

      {/* Main content — extra bottom padding on mobile for the tab bar */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh]">
        <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {navigation.map((item) => {
          const isActive = location === item.href;
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`relative flex-1 flex flex-col items-center justify-center py-2 gap-0.5 min-h-[56px] transition-colors ${
                isActive ? "text-primary" : "text-muted-foreground"
              }`}
              data-testid={`link-mobile-${item.name.toLowerCase()}`}
            >
              <item.icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
              <span className={`text-[10px] font-medium tracking-wide ${isActive ? "text-primary" : ""}`}>
                {item.name}
              </span>
              {isActive && (
                <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
