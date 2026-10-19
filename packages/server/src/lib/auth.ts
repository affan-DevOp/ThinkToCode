import { createClerkClient } from "@clerk/backend";

const hasClerkKeys = Boolean(process.env.CLERK_SECRET_KEY && process.env.CLERK_PUBLISHABLE_KEY);

const clerkClient = hasClerkKeys
  ? createClerkClient({
      secretKey: process.env.CLERK_SECRET_KEY,
      publishableKey: process.env.CLERK_PUBLISHABLE_KEY,
    })
  : null;

export async function authenticateOAuthRequest(request: Request) {
  // If Clerk is not configured yet, allow local development seamlessly
  if (!clerkClient) {
    return { userId: "mock-user" };
  }

  try {
    const requestState = await clerkClient.authenticateRequest(request, {
      acceptsToken: "oauth_token",
    });

    if (!requestState.isAuthenticated) {
      return null;
    }

    const auth = requestState.toAuth();
    if (auth.tokenType !== "oauth_token" || !auth.userId) {
      return null;
    }

    return { userId: auth.userId };
  } catch {
    return null;
  }
}
