import { SignInButton } from "@clerk/react";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Home() {
  return (
    <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4">
      <div className="max-w-xl text-center space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-1000">
        <div className="flex justify-center mb-8">
          <div className="h-16 w-16 bg-primary rounded-full flex items-center justify-center shadow-md">
            <Compass className="h-8 w-8 text-primary-foreground" />
          </div>
        </div>
        <h1 className="text-5xl md:text-6xl font-serif text-foreground leading-tight" data-testid="text-hero-title">
          Stop wondering. <br/> Start wandering.
        </h1>
        <p className="text-lg md:text-xl text-muted-foreground max-w-md mx-auto" data-testid="text-hero-subtitle">
          A quiet place to gather your travel ideas and let an editorial intelligence make the final call for you.
        </p>
        <div className="pt-8">
          <SignInButton mode="modal">
            <Button size="lg" className="h-12 px-8 text-base shadow-sm" data-testid="button-start-deciding">
              Start deciding
            </Button>
          </SignInButton>
        </div>
      </div>
    </div>
  );
}
