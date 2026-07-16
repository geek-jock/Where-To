import { useEffect, useRef } from "react";
import { ClerkProvider, AuthenticateWithRedirectCallback, Show, useClerk } from '@clerk/react';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClient, QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";

import { Layout } from "./components/layout";
import Home from "./pages/home";
import Saves from "./pages/saves";
import Decide from "./pages/decide";
import History from "./pages/history";
import DecisionView from "./pages/decision-view";
import Demo from "./pages/demo";
import DemoProfile from "./pages/demo-profile";
import DemoTrip from "./pages/demo-trip";
import Trips from "./pages/trips";
import TripDetail from "./pages/trip-detail";
import TripDecision from "./pages/trip-decision";
import TripOverview from "./pages/trip-overview";
import NotFound from "./pages/not-found";

const clerkPubKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;
const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

const queryClient = new QueryClient();

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(70 30% 40%)", // Olive
    colorForeground: "hsl(40 10% 15%)",
    colorMutedForeground: "hsl(40 10% 40%)",
    colorDanger: "hsl(0 60% 50%)",
    colorBackground: "hsl(40 30% 98%)",
    colorInput: "hsl(40 20% 85%)",
    colorInputForeground: "hsl(40 10% 15%)",
    colorNeutral: "hsl(40 20% 85%)",
    colorModalBackdrop: "rgba(0,0,0,0.5)",
    fontFamily: "'Inter', sans-serif",
    borderRadius: "0rem",
  },
  elements: {
    rootBox: "w-full",
    cardBox: "bg-card rounded-none border border-border w-[440px] max-w-full overflow-hidden shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "font-serif text-2xl text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground bg-card",
    identityPreviewEditButton: "text-primary",
    formFieldSuccessText: "text-primary",
    alertText: "text-destructive",
    logoBox: "flex justify-center",
    logoImage: "h-12 object-contain",
    socialButtonsBlockButton: "border border-border hover:bg-accent rounded-none shadow-none",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 rounded-none shadow-none",
    formFieldInput: "border-border bg-transparent text-foreground rounded-none shadow-none focus-visible:ring-1 focus-visible:ring-ring",
    footerAction: "bg-transparent",
    dividerLine: "bg-border",
    alert: "bg-destructive/10 border border-destructive/20 text-destructive rounded-none",
    otpCodeFieldInput: "border-border rounded-none",
    formFieldRow: "mb-4",
    main: "gap-6",
  },
};

function SSOCallbackPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background">
      <AuthenticateWithRedirectCallback />
    </div>
  );
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function HomeRoute() {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Decide />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Home />
      </Show>
    </>
  );
}

function ProtectedRoute({ component: Component }: { component: any }) {
  return (
    <>
      <Show when="signed-in">
        <Layout>
          <Component />
        </Layout>
      </Show>
      <Show when="signed-out">
        <Redirect to="/" />
      </Show>
    </>
  );
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to access your account",
          },
        },
        signUp: {
          start: {
            title: "Create your account",
            subtitle: "Get started today",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ClerkQueryClientCacheInvalidator />
        <Switch>
          <Route path="/" component={HomeRoute} />
          <Route path="/sso-callback" component={SSOCallbackPage} />
          <Route path="/saves">
            <ProtectedRoute component={Saves} />
          </Route>
          <Route path="/decide">
            <Show when="signed-in">
              <Redirect to="/" />
            </Show>
            <Show when="signed-out">
              <Redirect to="/" />
            </Show>
          </Route>
          <Route path="/history/:id">
            <ProtectedRoute component={DecisionView} />
          </Route>
          <Route path="/history">
            <ProtectedRoute component={History} />
          </Route>
          <Route path="/trips/:id/decisions/:decId">
            <Show when="signed-in">
              <Layout>
                <TripDecision />
              </Layout>
            </Show>
            <Show when="signed-out">
              <TripDecision />
            </Show>
          </Route>
          <Route path="/trips/:id/overview">
            <Show when="signed-in">
              <Layout>
                <TripOverview />
              </Layout>
            </Show>
            <Show when="signed-out">
              <TripOverview />
            </Show>
          </Route>
          <Route path="/trips/:id">
            <Show when="signed-in">
              <Layout>
                <TripDetail />
              </Layout>
            </Show>
            <Show when="signed-out">
              <TripDetail />
            </Show>
          </Route>
          <Route path="/trips">
            <ProtectedRoute component={Trips} />
          </Route>
          <Route path="/demo/trip" component={DemoTrip} />
          <Route path="/demo/:profileId" component={DemoProfile} />
          <Route path="/demo" component={Demo} />
          <Route>
            <NotFound />
          </Route>
        </Switch>
        <Toaster />
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
