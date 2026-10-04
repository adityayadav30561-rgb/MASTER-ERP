/** Settings shared by the global setup, the server and the tests. */
import { randomBytes } from "node:crypto";

// Fresh secrets per run: the server commands all start from the global setup, so they share these.
const authSecret = randomBytes(32).toString("hex");
const filesSecret = randomBytes(32).toString("hex");
const port = process.env.E2E_PORT ?? "3100";
const adminUrl = process.env.E2E_ADMIN_URL ?? "postgres://erp:erp@localhost:5432/postgres";
const database = process.env.E2E_DATABASE ?? "erp_e2e";
const withDatabase = (url: string, user?: string, password?: string) => {
  const u = new URL(url);
  u.pathname = `/${database}`;
  if (user) u.username = user;
  if (password) u.password = password;
  return u.toString();
};

export const E2E = {
  port,
  adminUrl,
  database,
  ownerUrl: withDatabase(adminUrl),
  appUser: "erp_e2e_app",
  appPassword: randomBytes(16).toString("hex"),
  tenantUrl: `http://demo.erp.localhost:${port}`,
  owner: { email: "owner@demo.example", password: "plates go to press two at noon" },
  get serverEnv(): Record<string, string> {
    return {
      DATABASE_URL: withDatabase(adminUrl, this.appUser, this.appPassword),
      DATABASE_OWNER_URL: this.ownerUrl,
      BASE_URL: `http://erp.localhost:${port}`,
      AUTH_SECRET: authSecret,
      FILES_SECRET: filesSecret,
      FILES_DIR: "/tmp/erp-e2e-files",
      WEB_DIR: new URL("../web/dist", import.meta.url).pathname,
      PORT: port,
      DEMO_OWNER_EMAIL: this.owner.email,
      DEMO_OWNER_PASSWORD: this.owner.password,
    };
  },
};
