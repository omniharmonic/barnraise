import { type Page, expect } from "@playwright/test";
import postgres from "postgres";

const TEST_DB_URL = "postgresql://localhost:5432/barnraise_test";

export async function resetDatabase() {
  const sql = postgres(TEST_DB_URL);
  await sql`TRUNCATE
    notifications, audit_log, point_transactions, event_claims,
    events, vouchers, pool_memberships, pools,
    sessions, verification_tokens, auth_accounts, accounts
    CASCADE`;
  await sql.end();
}

export async function getTestDb() {
  return postgres(TEST_DB_URL);
}

export async function signIn(page: Page, email: string, name?: string) {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");

  // If we need to create a new account, switch to sign-up mode
  if (name) {
    const toggle = page.locator("text=New here? Create an account");
    if (await toggle.isVisible()) {
      await toggle.click();
      await page.fill('input[placeholder="Your name"]', name);
    }
  }

  await page.fill('input[placeholder="you@example.com"]', email);
  await page.click('button[type="submit"]');

  // Wait for redirect to dashboard and session to load
  await page.waitForURL("**/dashboard", { timeout: 15000 });
  // Wait for the nav to show "My Pools" (means session loaded)
  await page.waitForSelector('a:has-text("My Pools")', { timeout: 10000 });
}

export async function signOut(page: Page) {
  await page.goto("/sign-in");
  await page.waitForLoadState("networkidle");
}

export async function createPool(
  page: Page,
  opts: { name: string; description?: string; joinPolicy?: string }
) {
  await page.goto("/pools/new");
  await page.waitForLoadState("networkidle");

  // Step 1: Details
  await page.fill('input[placeholder="e.g., North Boulder Neighbors"]', opts.name);
  if (opts.description) {
    await page.fill("textarea", opts.description);
  }
  await page.click("button:has-text('Next')");
  await page.waitForTimeout(300);

  // Step 2: Settings
  if (opts.joinPolicy === "open") {
    await page.click("text=Anyone can join");
  } else if (opts.joinPolicy === "approval") {
    await page.click("text=Steward approves");
  }
  await page.click("button:has-text('Review')");
  await page.waitForTimeout(300);

  // Step 3: Create
  await page.click("button:has-text('Create Pool')");

  // Wait for redirect to pool dashboard
  await page.waitForURL(/\/pools\/[0-9a-f-]+$/, { timeout: 15000 });

  const url = page.url();
  const match = url.match(/\/pools\/([0-9a-f-]+)/);
  return match?.[1] ?? "";
}

export async function createEvent(
  page: Page,
  poolId: string,
  opts: {
    title: string;
    description?: string;
    totalHours?: number;
    maxParticipants?: number;
  }
) {
  await page.goto(`/pools/${poolId}/events/new`);
  await page.waitForLoadState("networkidle");

  await page.fill('input[placeholder="e.g., Saturday Garden Build, Help Us Move!"]', opts.title);

  if (opts.description) {
    await page.locator("textarea").first().fill(opts.description);
  }

  if (opts.totalHours) {
    await page.locator('input[type="number"]').first().fill(String(opts.totalHours));
  }

  if (opts.maxParticipants) {
    await page.locator('input[type="number"]').nth(1).fill(String(opts.maxParticipants));
  }

  await page.click("button:has-text('Create Event')");

  // Wait for redirect to event page
  await page.waitForURL(/\/events\/[0-9a-f-]+$/, { timeout: 15000 });

  const url = page.url();
  const match = url.match(/\/events\/([0-9a-f-]+)/);
  return match?.[1] ?? "";
}

export async function setEventCompleted(eventId: string) {
  const sql = postgres(TEST_DB_URL);
  await sql`
    UPDATE events SET
      date_start = now() - interval '2 days',
      date_end = now() - interval '1 day',
      status = 'completed'
    WHERE id = ${eventId}::uuid
  `;
  await sql.end();
}
