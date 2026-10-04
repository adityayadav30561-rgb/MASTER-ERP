/**
 * The app shell (UX-ARCHITECTURE §3): top bar with the business name and the person, and a menu that shows only
 * what the person's roles allow. Shop-floor sessions get a simple, touch-first layout without the menu.
 */
import { Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useTranslation } from "react-i18next";
import { Building2, ClipboardCheck, FileSpreadsheet, Hash, Home, Package, Settings, ShieldCheck, Tablet, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { setLanguage } from "../i18n.ts";
import { signOut } from "../lib/session.ts";
import { useCan, useMe } from "../session.tsx";
import { Button } from "./ui/button.tsx";

interface MenuItem {
  to: string;
  label: string;
  icon: LucideIcon;
  permission?: string | string[];
}

export function useMenu(): { main: MenuItem[]; admin: MenuItem[] } {
  const { t } = useTranslation();
  const can = useCan();
  const allowed = (m: MenuItem) => !m.permission || (Array.isArray(m.permission) ? m.permission.some(can) : can(m.permission));
  const main: MenuItem[] = [
    { to: "/", label: t("nav.home"), icon: Home },
    { to: "/parties", label: t("nav.parties"), icon: Users, permission: "foundation.party.read" },
    { to: "/items", label: t("nav.items"), icon: Package, permission: "foundation.item.read" },
    { to: "/import", label: t("nav.import"), icon: FileSpreadsheet, permission: ["foundation.party.import", "foundation.item.import"] },
  ];
  const admin: MenuItem[] = [
    { to: "/admin/checklist", label: t("nav.checklist"), icon: ClipboardCheck, permission: "admin.settings.read" },
    { to: "/admin/users", label: t("nav.users"), icon: ShieldCheck, permission: "admin.users.read" },
    { to: "/admin/org", label: t("nav.org"), icon: Building2, permission: "admin.org.read" },
    { to: "/admin/devices", label: t("nav.devices"), icon: Tablet, permission: "admin.devices.manage" },
    { to: "/admin/settings", label: t("nav.settings"), icon: Settings, permission: "admin.settings.read" },
    { to: "/admin/numbering", label: t("nav.numbering"), icon: Hash, permission: "admin.numbering.read" },
  ];
  return { main: main.filter(allowed), admin: admin.filter(allowed) };
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const menu = useMenu();
  const navigate = useNavigate();
  const client = useQueryClient();
  const shopFloor = me?.authMethod === "device-pin";

  const leave = async () => {
    await signOut();
    client.clear();
    await navigate({ to: shopFloor ? "/device" : "/login" });
  };

  return (
    <div className="min-h-screen">
      <header className="flex h-14 items-center justify-between bg-brand-900 px-4 text-white">
        <Link to="/" className="font-semibold">{me?.tenantName ?? "MASTER-ERP"}</Link>
        <div className="flex items-center gap-3 text-sm">
          {me?.tenantStatus === "demo" ? <span className="rounded bg-amber-400 px-2 py-0.5 text-xs font-semibold text-slate-900">DEMO</span> : null}
          <button className="underline-offset-2 hover:underline" onClick={() => setLanguage(i18n.language === "hi" ? "en" : "hi")} aria-label="Change language">
            {i18n.language === "hi" ? "English" : "हिन्दी"}
          </button>
          <span aria-label="Signed in as">{me?.displayName}</span>
          <Button variant="outline" size="sm" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => void leave()}>
            {t("common.signOut")}
          </Button>
        </div>
      </header>
      {shopFloor ? (
        <main className="mx-auto max-w-3xl p-4">
          <Outlet />
        </main>
      ) : (
        <div className="flex">
          <nav aria-label="Main" className="hidden w-60 shrink-0 border-r border-slate-200 bg-white p-3 md:block" style={{ minHeight: "calc(100vh - 3.5rem)" }}>
            <MenuList items={menu.main} />
            {menu.admin.length > 0 ? (
              <>
                <p className="mb-1 mt-5 px-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("nav.admin")}</p>
                <MenuList items={menu.admin} />
              </>
            ) : null}
          </nav>
          <main className="min-w-0 flex-1 p-4 md:p-6">
            <Outlet />
          </main>
        </div>
      )}
    </div>
  );
}

function MenuList({ items }: { items: MenuItem[] }) {
  return (
    <ul className="space-y-0.5">
      {items.map((m) => (
        <li key={m.to}>
          <Link
            to={m.to}
            activeOptions={{ exact: m.to === "/" }}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-100 [&.active]:bg-brand-50 [&.active]:font-medium [&.active]:text-brand-900"
          >
            <m.icon className="h-4 w-4" aria-hidden />
            {m.label}
          </Link>
        </li>
      ))}
    </ul>
  );
}
