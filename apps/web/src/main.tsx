import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import "./index.css";
import "./i18n.ts";
import { ApiError } from "./lib/api.ts";
import { makeRouter } from "./routes.tsx";
import { StepUpProvider } from "./session.tsx";

const queryClient = new QueryClient({
  defaultOptions: {
    // Do not retry what will fail again (permission, validation); retry network hiccups once.
    queries: { retry: (count, error) => !(error instanceof ApiError && error.status < 500) && count < 1, refetchOnWindowFocus: false },
  },
});
const router = makeRouter(queryClient);

const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <StepUpProvider>
          <RouterProvider router={router} />
        </StepUpProvider>
      </QueryClientProvider>
    </StrictMode>,
  );
}
