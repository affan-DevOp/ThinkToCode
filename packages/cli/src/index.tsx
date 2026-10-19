import { existsSync } from "node:fs";
import { dirname, join } from "node:path";

function autoAnchorWorkspaceRoot() {
  let curr = process.cwd();
  while (curr !== dirname(curr)) {
    if (
      existsSync(join(curr, ".git")) ||
      (existsSync(join(curr, "packages")) && existsSync(join(curr, "package.json")))
    ) {
      if (curr !== process.cwd()) {
        try {
          process.chdir(curr);
        } catch {
          // Ignore if chdir is disallowed
        }
      }
      return;
    }
    curr = dirname(curr);
  }
}

autoAnchorWorkspaceRoot();

import { createCliRenderer } from "@opentui/core";
import { createRoot } from "@opentui/react";
import { createMemoryRouter, RouterProvider } from "react-router";
import { RootLayout } from "./layouts/root-layout";
import { Home } from "./screens/home";
import { NewSession } from "./screens/new-session";
import { Session } from "./screens/session";

const router = createMemoryRouter([
  {
    path: "/",
    element: <RootLayout />,
    children: [
      { index: true, element: <Home /> },
      { path: "sessions/new", element: <NewSession /> },
      { path: "sessions/:id", element: <Session /> },
    ]
  }
]);

function App() {
  return <RouterProvider router={router} />;
}

const renderer = await createCliRenderer({
  targetFps: 60,
  exitOnCtrlC: false,
});
try {
  renderer.enableKittyKeyboard(5);
} catch {
  // Ignored if unsupported
}
createRoot(renderer).render(<App />);
