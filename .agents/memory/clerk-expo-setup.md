---
name: Clerk Expo Setup
description: How to correctly set up @clerk/clerk-expo in this workspace, including peer deps and env var wiring.
---

## Required peer dependencies
- `@clerk/clerk-expo` — main package
- `expo-auth-session` — required by clerk-expo's useSSO hook (will fail to bundle without it)
- `expo-secure-store` — token cache storage

## Env var wiring
Expo public env vars need `EXPO_PUBLIC_` prefix. Since Clerk publishable key is stored as secret `CLERK_PUBLISHABLE_KEY`, pass it via the dev script:

```
"dev": "... EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY=$CLERK_PUBLISHABLE_KEY ..."
```

Do NOT try to `setEnvVars` for this — the secret already exists, just wire it through the dev command.

**Why:** Expo strips all env vars without `EXPO_PUBLIC_` prefix from client bundles. The secret is already configured as `CLERK_PUBLISHABLE_KEY` for the API server and `VITE_CLERK_PUBLISHABLE_KEY` for the web app.

## Known web warning
`ExpoCryptoAES` native module not found — this is a Clerk/web warning, non-fatal, doesn't affect native device usage.
