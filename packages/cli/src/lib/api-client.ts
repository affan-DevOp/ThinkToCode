import { hc } from "hono/client";
import type { AppType } from "@thinktocode/server";
import { clearAuth, getAuth } from "./auth";

export const apiClient = hc<AppType>(
  process.env.API_URL ?? "http://localhost:3000",
  {
    fetch: async (
      input: Parameters<typeof fetch>[0],
      init?: Parameters<typeof fetch>[1],
    ) => {
      const auth = getAuth();
      const headers = new Headers(init?.headers);

      if (auth?.token) {
        headers.set("Authorization", `Bearer ${auth.token}`);
      }

      const res = await fetch(input, {
        ...init,
        headers,
      });

      if (res.status === 401) {
        clearAuth();
      }

      return res;
    },
  },
);
