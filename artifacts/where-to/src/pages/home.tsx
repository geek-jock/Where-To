import { useSignIn } from "@clerk/react/legacy";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Home() {
  const { signIn, isLoaded } = useSignIn();

  async function handleGoogleSignIn() {
    if (!isLoaded || !signIn) return;
    await signIn.authenticateWithRedirect({
      strategy: "oauth_google",
      redirectUrl: `${window.location.origin}${basePath}/sso-callback`,
      redirectUrlComplete: `${window.location.origin}${basePath}/saves`,
    });
  }

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
          <Button
            size="lg"
            className="h-12 px-8 text-base shadow-sm"
            data-testid="button-start-deciding"
            onClick={handleGoogleSignIn}
            disabled={!isLoaded}
          >
            Continue with Google
          </Button>
        </div>
      </div>
    </div>
  );
}
