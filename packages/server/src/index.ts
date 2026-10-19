import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.resolve(import.meta.dirname, "../../../.env"), override: true });

import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { sentry } from "@sentry/hono/bun";
import * as Sentry from "@sentry/bun";

import auth from "./routes/auth";
import sessions from "./routes/sessions";
import chat from "./routes/chat";
import billing from "./routes/billing";
import { requireAuth } from "./middleware/require-auth";

const app = new Hono();

if (process.env.SENTRY_DSN) {
  app.use(
    "*",
    sentry(app, {
      dsn: process.env.SENTRY_DSN,
      tracesSampleRate: 1.0,
    })
  );
}

app.onError((error, c) => {
  if (error instanceof HTTPException) {
    return c.json({ 
      error: error.message || "Request failed",
    }, error.status);
  };

  console.error("Unhandled server error", error);
  if (process.env.SENTRY_DSN) {
    Sentry.captureException(error);
  }
  return c.json({ error: "Internal server error" }, 500);
});

// Test route to verify Sentry onboarding
app.get("/sentry-test", () => {
  throw new Error("ThinkToCode test exception for Sentry onboarding!");
});

app.use("/sessions/*", requireAuth);
app.use("/chat/*", requireAuth);
app.use("/billing/checkout", requireAuth);
app.use("/billing/portal", requireAuth);

const routes = app
  .route("/billing", billing)
  .route("/auth", auth)
  .route("/sessions", sessions)
  .route("/chat", chat);

export type AppType = typeof routes;
// idleTimeout must be high, otherwise LLM tool calls might not complete
const port = Number(process.env.PORT) || 3000;
export default { port, fetch: app.fetch, idleTimeout: 255 };
