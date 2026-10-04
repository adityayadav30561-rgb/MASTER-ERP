/**
 * Routes (TanStack Router, ADR-0056). Everything under the app shell needs a session; privileged people who have
 * not enrolled two-step sign-in are sent to enrol first (the server enforces the same).
 */
import { createRootRouteWithContext, createRoute, createRouter, Outlet, redirect } from "@tanstack/react-router";
import type { QueryClient } from "@tanstack/react-query";
import { currentUser } from "./lib/session.ts";
import { AppShell } from "./components/shell.tsx";
import { LoginPage } from "./pages/Login.tsx";
import { MfaSetupPage } from "./pages/MfaSetup.tsx";
import { DevicePage } from "./pages/Device.tsx";
import { HomePage } from "./pages/Home.tsx";
import { PartiesPage, PartyFormPage } from "./pages/Parties.tsx";
import { ItemFormPage, ItemsPage } from "./pages/Items.tsx";
import { ImportPage } from "./pages/Import.tsx";
import { UsersPage } from "./pages/admin/Users.tsx";
import { OrgPage } from "./pages/admin/Org.tsx";
import { DevicesPage } from "./pages/admin/Devices.tsx";
import { SettingsPage } from "./pages/admin/Settings.tsx";
import { NumberingPage } from "./pages/admin/Numbering.tsx";
import { ChecklistPage } from "./pages/admin/Checklist.tsx";

const root = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
const me = (client: QueryClient) => client.fetchQuery({ queryKey: ["me"], queryFn: currentUser, staleTime: 60_000 });

const login = createRoute({ getParentRoute: () => root, path: "/login", component: LoginPage });
const device = createRoute({ getParentRoute: () => root, path: "/device", component: DevicePage });
const setupMfa = createRoute({
  getParentRoute: () => root,
  path: "/setup-mfa",
  component: MfaSetupPage,
  beforeLoad: async ({ context }) => {
    if (!(await me(context.queryClient))) throw redirect({ to: "/login" });
  },
});

const app = createRoute({
  getParentRoute: () => root,
  id: "app",
  component: AppShell,
  beforeLoad: async ({ context }) => {
    const user = await me(context.queryClient);
    if (!user) throw redirect({ to: "/login" });
    if (user.mfaEnrolmentRequired) throw redirect({ to: "/setup-mfa" });
  },
});

const page = <P extends string>(path: P, component: () => React.ReactNode) => createRoute({ getParentRoute: () => app, path, component });
const partyRoute = createRoute({ getParentRoute: () => app, path: "/parties/$id", component: function PartyRoute() { const { id } = partyRoute.useParams(); return <PartyFormPage key={id} id={id} />; } });
const itemRoute = createRoute({ getParentRoute: () => app, path: "/items/$id", component: function ItemRoute() { const { id } = itemRoute.useParams(); return <ItemFormPage key={id} id={id} />; } });

const tree = root.addChildren([
  login,
  device,
  setupMfa,
  app.addChildren([
    page("/", HomePage),
    page("/parties", PartiesPage),
    page("/parties/new", () => <PartyFormPage />),
    partyRoute,
    page("/items", ItemsPage),
    page("/items/new", () => <ItemFormPage />),
    itemRoute,
    page("/import", ImportPage),
    page("/admin/checklist", ChecklistPage),
    page("/admin/users", UsersPage),
    page("/admin/org", OrgPage),
    page("/admin/devices", DevicesPage),
    page("/admin/settings", SettingsPage),
    page("/admin/numbering", NumberingPage),
  ]),
]);

export function makeRouter(queryClient: QueryClient) {
  return createRouter({ routeTree: tree, context: { queryClient }, defaultPreload: "intent" });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}
