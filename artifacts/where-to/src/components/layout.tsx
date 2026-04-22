import { ReactNode } from "react";
import { Link, useLocation } from "wouter";
import { useUser, useClerk } from "@clerk/react";
import { Compass, Bookmark, CheckCircle, History, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

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
    <div className="min-h-screen bg-background flex flex-col md:flex-row">
      {/* Mobile header */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-border bg-card">
        <Link href="/saves" className="flex items-center gap-2">
          <Compass className="h-6 w-6 text-primary" />
          <span className="font-serif font-bold text-lg">Where To</span>
        </Link>
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" data-testid="button-mobile-menu">
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[240px] flex flex-col p-6">
            <div className="flex items-center gap-2 mb-8">
              <Compass className="h-6 w-6 text-primary" />
              <span className="font-serif font-bold text-lg">Where To</span>
            </div>
            <nav className="flex flex-col gap-2 flex-1">
              {navigation.map((item) => {
                const isActive = location === item.href;
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                      isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
                    }`}
                    data-testid={`link-mobile-${item.name.toLowerCase()}`}
                  >
                    <item.icon className="h-4 w-4" />
                    <span className="font-medium">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
            <div className="mt-auto pt-6 border-t border-border">
              <div className="flex items-center gap-3 mb-4">
                <img src={user?.imageUrl} alt={user?.fullName || "User"} className="h-8 w-8 rounded-full" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium leading-none">{user?.firstName}</span>
                </div>
              </div>
              <Button 
                variant="ghost" 
                className="w-full justify-start text-muted-foreground" 
                onClick={() => signOut()}
                data-testid="button-sign-out"
              >
                <LogOut className="h-4 w-4 mr-2" />
                Sign Out
              </Button>
            </div>
          </SheetContent>
        </Sheet>
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
                className={`flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                  isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
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
            <img src={user?.imageUrl} alt={user?.fullName || "User"} className="h-8 w-8 rounded-full" data-testid="img-avatar" />
            <div className="flex flex-col overflow-hidden">
              <span className="text-sm font-medium truncate" data-testid="text-username">{user?.firstName}</span>
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

      {/* Main content */}
      <div className="flex-1 md:pl-64 flex flex-col min-h-[100dvh]">
        <main className="flex-1 p-4 md:p-8 max-w-4xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
