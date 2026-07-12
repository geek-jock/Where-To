import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Compass, Bookmark, Sparkles, History, LogOut, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  const { user } = useUser();
  const { signOut } = useClerk();
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem("sidebar-collapsed") === "true"; } catch { return false; }
  });

  useEffect(() => {
    try { localStorage.setItem("sidebar-collapsed", String(collapsed)); } catch { /* ignore */ }
  }, [collapsed]);

  const navigation = [
    { name: "Decide", href: "/", icon: Sparkles },
    { name: "Library", href: "/saves", icon: Bookmark },
    { name: "History", href: "/history", icon: History },
  ];

  return (
    <div className="min-h-[100dvh] bg-background flex flex-col md:flex-row">

      {/* Mobile top bar */}
      <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <Link href="/" className="flex items-center gap-2">
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
      <div
        className={`hidden md:flex flex-col border-r border-border bg-card fixed inset-y-0 left-0 transition-all duration-200 ${
          collapsed ? "w-16" : "w-64"
        }`}
      >
        {/* Logo */}
        <div className={`flex items-center gap-2 p-4 h-[72px] ${collapsed ? "justify-center" : "px-6"}`}>
          <Link href="/" className="flex items-center gap-2">
            <Compass className="h-6 w-6 text-primary flex-shrink-0" />
            {!collapsed && <span className="font-serif font-bold text-xl">Where To</span>}
          </Link>
        </div>

        {/* Nav items */}
        <nav className="flex flex-col gap-1 px-2 flex-1">
          {navigation.map((item) => {
            const isActive = item.href === "/" ? location === "/" : location === item.href;
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                  collapsed ? "justify-center" : ""
                } ${
                  isActive
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                }`}
                title={collapsed ? item.name : undefined}
                data-testid={`link-desktop-${item.name.toLowerCase()}`}
              >
                <item.icon className="h-4 w-4 flex-shrink-0" />
                {!collapsed && <span className="font-medium">{item.name}</span>}
              </Link>
            );
          })}
        </nav>

        {/* User + sign out */}
        {!collapsed && (
          <div className="px-4 pt-4 border-t border-border">
            <div className="flex items-center gap-3 px-3 py-2 mb-1">
              <img
                src={user?.imageUrl}
                alt={user?.fullName || "User"}
                className="h-8 w-8 rounded-full flex-shrink-0"
                data-testid="img-avatar"
              />
              <div className="flex flex-col overflow-hidden min-w-0">
                <span className="text-sm font-medium truncate" data-testid="text-username">
                  {user?.firstName}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              className="w-full justify-start text-muted-foreground hover:text-foreground mb-2"
              onClick={() => signOut()}
              data-testid="button-sign-out"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        )}

        {collapsed && (
          <div className="pb-4 flex flex-col items-center gap-2 border-t border-border pt-3">
            <img
              src={user?.imageUrl}
              alt={user?.fullName || "User"}
              className="h-7 w-7 rounded-full"
              data-testid="img-avatar"
            />
          </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(c => !c)}
          className={`flex items-center justify-center h-10 border-t border-border text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors ${
            collapsed ? "w-full" : "w-full"
          }`}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      {/* Main content */}
      <div className={`flex-1 flex flex-col min-h-[100dvh] transition-all duration-200 ${collapsed ? "md:pl-16" : "md:pl-64"}`}>
        <main className="flex-1 p-4 md:p-8 max-w-5xl mx-auto w-full pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-8">
          {children}
        </main>
      </div>

      {/* Mobile bottom tab bar */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-card border-t border-border flex"
        style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      >
        {navigation.map((item) => {
          const isActive = item.href === "/" ? location === "/" : location === item.href;
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
