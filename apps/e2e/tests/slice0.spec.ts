/**
 * Slice 0 exit criteria (ROADMAP-AND-MVP §4), as one story on the demo tenant:
 * 1. a demo tenant is created from packages (global setup) and the owner must use two-step sign-in;
 * 2. masters are kept and imported from Excel;
 * 3. a store keeper on a tablet sees only their screens.
 * Cross-tenant and authorization rules are covered by the API and kernel tests.
 */
import { expect, test } from "@playwright/test";
import type { Browser, Page } from "@playwright/test";
import { writeWorkbook } from "@master-erp/kernel/importer";
import { totpCode } from "@master-erp/kernel/testing";
import { E2E } from "../env.ts";

test.describe.configure({ mode: "serial" });

let totpKey = "";
let owner: Page;
let deviceToken = "";

async function signInOwner(browser: Browser): Promise<Page> {
  const page = await (await browser.newContext()).newPage();
  await page.goto("/login");
  await page.getByLabel("E-mail").fill(E2E.owner.email);
  await page.getByLabel("Password").fill(E2E.owner.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  return page;
}

test("the owner must set up two-step sign-in before using the demo business", async ({ browser }) => {
  owner = await signInOwner(browser);
  await expect(owner).toHaveURL(/\/setup-mfa$/);
  await owner.getByLabel("Your password").fill(E2E.owner.password);
  await owner.getByRole("button", { name: "Continue" }).click();
  await expect(owner.getByLabel("QR code for the authenticator app")).toBeVisible();
  totpKey = (await owner.locator("code").first().textContent()) ?? "";
  await owner.getByLabel("2. Enter the 6-digit code it shows").fill(totpCode(totpKey));
  await owner.getByRole("button", { name: "Turn on" }).click();
  await expect(owner.getByText("Two-step sign-in is on.")).toBeVisible();
  await owner.getByRole("button", { name: /continue/ }).click();
  await expect(owner.getByRole("heading", { name: "Welcome, Demo Owner" })).toBeVisible();
  await expect(owner.getByText("DEMO", { exact: true })).toBeVisible();
  await expect(owner.getByRole("progressbar", { name: "Checklist progress" })).toBeVisible();
});

test("next time, the owner signs in with password and authenticator code", async ({ browser }) => {
  const page = await signInOwner(browser);
  await expect(page.getByLabel(/6-digit code/)).toBeVisible();
  await page.getByLabel(/6-digit code/).fill("000000");
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("alert")).toBeVisible(); // a wrong code is refused
  await page.getByLabel(/6-digit code/).fill(totpCode(totpKey));
  await page.getByRole("button", { name: "Verify" }).click();
  await expect(page.getByRole("heading", { name: "Welcome, Demo Owner" })).toBeVisible();
  await page.context().close();
});

test("demo masters are there, and a board item gets its attributes, sheet weight and kg ↔ sheet conversion", async () => {
  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Parties" }).click();
  await expect(owner.getByRole("link", { name: "Sunrise Pharma Ltd" })).toBeVisible();
  await owner.getByLabel("Role").selectOption("vendor");
  await expect(owner.getByRole("link", { name: "Sunrise Pharma Ltd" })).toBeHidden();
  await expect(owner.getByRole("link", { name: "Shree Paper Mills Pvt Ltd" })).toBeVisible();

  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Items" }).click();
  await owner.getByRole("link", { name: "New" }).click();
  await owner.getByLabel("Name").fill("SBS 350 GSM 720 × 1020 mm");
  await owner.getByLabel(/^Category/).selectOption("board");
  await expect(owner.getByLabel("GSM")).toBeVisible();
  await expect(owner.getByLabel("Ink colour")).toHaveCount(0); // ink attributes do not apply to board
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("is required").first()).toBeVisible(); // GSM is required for board

  await owner.getByLabel("GSM").fill("350");
  await owner.getByLabel("Sheet length (mm)").fill("720");
  await owner.getByLabel("Sheet width (mm)").fill("1020");
  await owner.getByLabel("Board type").selectOption("sbs");
  await owner.getByRole("button", { name: "Save" }).click();
  await expect(owner.getByText("BOARD-0001")).toBeVisible();
  await expect(owner.getByLabel("Sheet weight (g)")).toHaveText("257.04");
  await expect(owner.getByText(/1 kg = 3\.89\d* sheet/)).toBeVisible();
  await expect(owner.getByLabel("HSN / SAC")).toHaveValue("4810"); // the tenant's category default
});

test("masters are imported from Excel: the check finds mistakes, the corrected file is saved", async () => {
  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Import from Excel" }).click();
  await owner.getByLabel("Parties (customers, vendors …)").check();
  const download = owner.waitForEvent("download");
  await owner.getByRole("button", { name: "Download template" }).click();
  expect((await download).suggestedFilename()).toBe("parties-template.xlsx");

  const sheet = (rows: string[][]) =>
    writeWorkbook([{ name: "Parties", columns: ["Name *", "Roles *", "GSTIN", "Address line 1", "City", "State", "PIN / postal code"].map((header) => ({ header })), rows }]);
  const upload = async (rows: string[][]) =>
    owner.getByLabel("Filled template").setInputFiles({ name: "parties.xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", buffer: Buffer.from(await sheet(rows)) });

  await upload([
    ["Kalpana Cartons", "customer", "27AABCK1234A1Z0", "Unit 5", "Thane", "Maharashtra", "400601"],
    ["Mehta Adhesives", "vendor", "", "Shed 2", "Vapi", "Gujarat", "39619"],
  ]);
  await owner.getByRole("button", { name: "Check file" }).click();
  await expect(owner.getByText("2 of 2 rows need correction. Nothing was saved.")).toBeVisible();
  await expect(owner.getByRole("cell", { name: "GSTIN" })).toBeVisible();
  await expect(owner.getByRole("cell", { name: "must be a 6-digit PIN code" })).toBeVisible();

  await upload([
    ["Kalpana Cartons", "customer", "", "Unit 5", "Thane", "Maharashtra", "400601"],
    ["Mehta Adhesives", "vendor", "", "Shed 2", "Vapi", "Gujarat", "396195"],
  ]);
  await owner.getByRole("button", { name: "Check file" }).click();
  await expect(owner.getByText(/All 2 rows are correct/)).toBeVisible();
  await owner.getByRole("button", { name: "4. Save all rows" }).click();
  await expect(owner.getByText("Saved: 2 new, 0 already existed.")).toBeVisible();

  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Parties" }).click();
  await expect(owner.getByRole("link", { name: "Mehta Adhesives" })).toBeVisible();
});

test("the owner adds a store keeper for the paper store (password asked again) and registers a tablet", async () => {
  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "People and roles" }).click();
  await owner.getByRole("button", { name: "Add a person" }).click();
  const dialog = owner.getByRole("dialog", { name: "Add a person" });
  await dialog.getByLabel("Name").fill("Ravi Patil");
  await dialog.getByLabel("E-mail").fill("ravi@demo.example");
  await dialog.getByLabel("Employee code").fill("E-014");
  await dialog.getByLabel("Role").selectOption({ label: "Store keeper" });
  await dialog.getByLabel("Where").selectOption({ label: "Paper and board store" });
  await dialog.getByLabel("First password").fill("reels of board arrive on monday");
  await dialog.getByRole("button", { name: "Add" }).click();

  const stepUp = owner.getByRole("dialog", { name: "Confirm your password" });
  await stepUp.getByLabel("Password").fill(E2E.owner.password);
  await stepUp.getByRole("button", { name: "Confirm" }).click();
  const row = owner.getByRole("row", { name: /Ravi Patil/ });
  await expect(row).toContainText("Store keeper · Paper and board store");

  await row.getByRole("button", { name: "Set PIN" }).click();
  await owner.getByRole("dialog").getByLabel("PIN").fill("482913");
  await owner.getByRole("dialog").getByRole("button", { name: "Save PIN" }).click();
  await expect(row.getByRole("button", { name: "Change PIN" })).toBeVisible();

  await owner.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Shop-floor tablets" }).click();
  await owner.getByLabel("Name").fill("Paper store tablet");
  await owner.getByRole("button", { name: "Register" }).click();
  deviceToken = (await owner.getByTestId("device-token").textContent()) ?? "";
  expect(deviceToken).toMatch(/^[0-9a-f]{64}$/);
});

test("a store keeper on a tablet sees only their screens", async ({ browser }) => {
  const tablet = await (await browser.newContext({ viewport: { width: 800, height: 1280 }, hasTouch: true })).newPage();
  await tablet.goto("/device");
  await tablet.getByLabel("Device code from the administrator").fill(deviceToken);
  await tablet.getByRole("button", { name: "Save" }).click();
  await tablet.getByLabel("Employee code").fill("e-014");
  for (const d of "482913") await tablet.getByRole("group", { name: "PIN keypad" }).getByRole("button", { name: d, exact: true }).click();
  await tablet.getByRole("button", { name: "OK" }).click();

  await expect(tablet.getByRole("heading", { name: "Hello, Ravi Patil" })).toBeVisible();
  await expect(tablet.getByRole("link", { name: "Items" })).toBeVisible();
  await expect(tablet.getByRole("link", { name: "Parties" })).toHaveCount(0);
  await expect(tablet.getByRole("navigation", { name: "Main" })).toHaveCount(0); // no office menu on the shop floor
  await expect(tablet.getByText("Administration")).toHaveCount(0);

  await tablet.goto("/parties"); // typing the address does not help: the server refuses
  await expect(tablet.getByRole("alert")).toContainText("Not allowed");
  await tablet.goto("/admin/users");
  await expect(tablet.getByRole("alert")).toContainText("Not allowed");
});
