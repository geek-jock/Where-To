---
name: Expo API Client Auth Token Setup
description: How to wire Clerk's getToken into the API client's setAuthTokenGetter inside an Expo app.
---

## Pattern
Create an `AuthSetup` component inside ClerkProvider that calls `setAuthTokenGetter` in a useEffect:

```tsx
function AuthSetup({ children }) {
  const { getToken } = useAuth();
  useEffect(() => {
    setAuthTokenGetter(async () => {
      try { return await getToken(); }
      catch { return null; }
    });
  }, [getToken]);
  return <>{children}</>;
}
```

Place `<AuthSetup>` inside `<ClerkProvider>` but wrapping the navigation stack.

**Why:** `setAuthTokenGetter` from `@workspace/api-client-react` is a module-level setter. It cannot call hooks itself. Must be called from a component that is already inside ClerkProvider so `useAuth` is available.

## Root index.tsx required
Expo Router needs an `app/index.tsx` to define the initial route. Without it, the app shows "This screen doesn't exist". The index should redirect to sign-in or tabs based on `useAuth().isSignedIn`.
