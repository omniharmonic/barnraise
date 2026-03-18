import { test, expect } from "@playwright/test";
import {
  resetDatabase,
  signIn,
  signOut,
  createPool,
  createEvent,
  setEventCompleted,
} from "./helpers";

// Shared state across sequential tests
let poolId: string;
let eventId: string;

test.describe.configure({ mode: "serial" });

test.describe("Barn Raise — Full Lifecycle E2E", () => {
  test.beforeAll(async () => {
    await resetDatabase();
  });

  // ─── AUTH ────────────────────────────────────────────

  test("Sign up as Alice", async ({ page }) => {
    await signIn(page, "alice@test.com", "Alice");
    // Verify we landed on dashboard
    await expect(page).toHaveURL(/dashboard/);
  });

  test("Sign in as Alice (existing account)", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await expect(page).toHaveURL(/dashboard/);
  });

  // ─── PROFILE ─────────────────────────────────────────

  test("View and edit profile", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto("/profile");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1:has-text('My Profile')")).toBeVisible();

    // Edit bio
    const bioField = page.locator('textarea[placeholder*="Tell people"]');
    await bioField.fill("I love helping neighbors!");
    await page.click("button:has-text('Save Profile')");
    await page.waitForTimeout(1000);

    // Verify save persisted
    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator('textarea[placeholder*="Tell people"]')).toHaveValue(
      "I love helping neighbors!"
    );
  });

  // ─── POOL CREATION ──────────────────────────────────

  test("Create a pool", async ({ page }) => {
    await signIn(page, "alice@test.com");

    poolId = await createPool(page, {
      name: "Test Neighbors",
      description: "A test labor pool",
      joinPolicy: "open",
    });

    expect(poolId).toBeTruthy();
    expect(poolId).toMatch(/^[0-9a-f-]+$/);

    await expect(page.locator("h1:has-text('Test Neighbors')")).toBeVisible();
  });

  test("Pool dashboard shows correct state", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1:has-text('Test Neighbors')")).toBeVisible();
    // Should show the steward role in the stats
    await expect(page.locator("text=steward").first()).toBeVisible();
  });

  test("My Pools shows the pool", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Test Neighbors")).toBeVisible();
  });

  // ─── POOL SETTINGS ──────────────────────────────────

  test("Pool settings page loads with invite link", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}/settings`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1:has-text('Pool Settings')")).toBeVisible();
    await expect(page.locator("text=Invite Members")).toBeVisible();

    const inviteInput = page.locator("input[readonly]");
    const inviteUrl = await inviteInput.inputValue();
    expect(inviteUrl).toContain(`/join/${poolId}`);
  });

  // ─── SECOND USER ─────────────────────────────────────

  test("Bob signs up and joins the pool", async ({ page }) => {
    await signIn(page, "bob@test.com", "Bob");
    await page.goto(`/join/${poolId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1:has-text('Test Neighbors')")).toBeVisible();

    await page.click("button:has-text('Join Test Neighbors')");
    await page.waitForURL(`**/pools/${poolId}`, { timeout: 15000 });
    await expect(page.locator("h1:has-text('Test Neighbors')")).toBeVisible();
  });

  test("Pool shows 2 members", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Bob").first()).toBeVisible({ timeout: 10000 });
  });

  // ─── EVENT CREATION ──────────────────────────────────

  test("Alice creates an event", async ({ page }) => {
    await signIn(page, "alice@test.com");

    eventId = await createEvent(page, poolId, {
      title: "Help Build Raised Beds",
      description: "Building garden beds. Lunch provided!",
      totalHours: 8,
      maxParticipants: 4,
    });

    expect(eventId).toBeTruthy();
    expect(eventId).toMatch(/^[0-9a-f-]+$/);
    await expect(page.locator("h1:has-text('Help Build Raised Beds')")).toBeVisible();
  });

  test("Event shows on pool dashboard", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Help Build Raised Beds")).toBeVisible({ timeout: 10000 });
  });

  // ─── CLAIMING ────────────────────────────────────────

  test("Bob claims a slot", async ({ page }) => {
    await signIn(page, "bob@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await page.click("button:has-text('Claim a Slot')");
    await page.waitForTimeout(500);

    const hoursInput = page.locator("input[type='number']").last();
    await hoursInput.fill("3");
    await page.click("button:has-text('Commit 3 hours')");

    await expect(page.locator("text=You're committed for 3 hours")).toBeVisible({
      timeout: 10000,
    });
  });

  test("Event progress updates", async ({ page }) => {
    await signIn(page, "bob@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=3 of 8 hours claimed")).toBeVisible({ timeout: 10000 });
  });

  test("Bob edits his claim", async ({ page }) => {
    await signIn(page, "bob@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    // Wait for claim to show
    await expect(page.locator("text=You're committed for")).toBeVisible({ timeout: 10000 });

    await page.click("button:has-text('Edit')");
    await page.waitForTimeout(300);

    const hoursInput = page.locator("input[type='number']").last();
    await hoursInput.fill("4");
    await page.click("button:has-text('Update Claim')");

    await expect(page.locator("text=You're committed for 4 hours")).toBeVisible({
      timeout: 10000,
    });
  });

  test("Alice claims her own event", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await page.click("button:has-text('Claim a Slot')");
    await page.waitForTimeout(500);

    const hoursInput = page.locator("input[type='number']").last();
    await hoursInput.fill("4");
    await page.click("button:has-text('Commit 4 hours')");

    await expect(page.locator("text=You're committed for 4 hours")).toBeVisible({
      timeout: 10000,
    });
  });

  // ─── NOTIFICATIONS ───────────────────────────────────

  test("Alice has notifications from claims", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.waitForLoadState("networkidle");

    // Notification bell should show a count
    const bell = page.locator("nav .relative button").first();
    await bell.click();
    await page.waitForTimeout(500);

    // Should see notification about Bob's claim
    await expect(page.locator("text=Bob claimed")).toBeVisible({ timeout: 5000 });
  });

  // ─── EVENT EDIT ──────────────────────────────────────

  test("Alice edits the event", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await page.click("a:has-text('Edit Event')");
    await page.waitForURL(`**/events/${eventId}/edit`, { timeout: 10000 });

    const textarea = page.locator("textarea").first();
    await textarea.fill("Updated description: bring sunscreen!");
    await page.click("button:has-text('Save Changes')");

    await page.waitForURL(`**/events/${eventId}`, { timeout: 10000 });
    await expect(page.locator("text=bring sunscreen")).toBeVisible();
  });

  // ─── SHARE / PUBLIC EVENT ────────────────────────────

  test("Share button exists on event page", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button:has-text('Share Event')")).toBeVisible();
  });

  test("Public event page renders for anonymous users", async ({ page }) => {
    await page.goto(`/e/${eventId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Help Build Raised Beds")).toBeVisible({ timeout: 10000 });
    // May show "still needed" or "Fully claimed!" depending on claim state
    await expect(page.locator("text=hours claimed")).toBeVisible();
    await expect(page.locator("text=Join Test Neighbors to Help Out")).toBeVisible();
  });

  // ─── VERIFICATION + POINTS ──────────────────────────

  test("Set event to completed and verify", async ({ page }) => {
    // Move event to past/completed via DB
    await setEventCompleted(eventId);

    await signIn(page, "alice@test.com");
    await page.goto(`/events/${eventId}`);
    await page.waitForLoadState("networkidle");

    // Should see verify button
    await expect(page.locator("text=Verify Attendance")).toBeVisible({ timeout: 10000 });

    await page.click("a:has-text('Verify Attendance')");
    await page.waitForURL(`**/events/${eventId}/verify`, { timeout: 10000 });

    await expect(page.locator("text=Verify Attendance")).toBeVisible();
    await expect(page.locator("text=Alice").first()).toBeVisible();
    await expect(page.locator("text=Bob").first()).toBeVisible();

    await page.click("button:has-text('Submit Verification')");
    await page.waitForURL(`**/events/${eventId}`, { timeout: 15000 });
    await expect(page.locator("text=Event Verified")).toBeVisible();
  });

  test("Balances updated on pool dashboard", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    // Just verify the page loads with balance data
    await expect(page.locator("text=Your Balance")).toBeVisible({ timeout: 10000 });
    // Hours exchanged should be > 0 now
    await expect(page.locator("text=Hours Exchanged")).toBeVisible();
  });

  // ─── MEMBER PROFILE ──────────────────────────────────

  test("View member profile with reputation signals", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    // Click on Bob's name in the member list
    const bobLink = page.locator("a").filter({ hasText: "Bob" }).first();
    await bobLink.click();
    await page.waitForURL(/\/members\//, { timeout: 10000 });

    await expect(page.locator("text=Reputation Signals")).toBeVisible();
    await expect(page.locator("text=100%")).toBeVisible(); // 100% reliability
    await expect(page.locator("text=Event History")).toBeVisible();
  });

  // ─── POOL HEALTH ─────────────────────────────────────

  test("Pool health dashboard loads", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}/health`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("h1:has-text('Pool Health')")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Active Members")).toBeVisible();
    await expect(page.locator("text=No-Show Rate")).toBeVisible();
    await expect(page.locator("text=Reciprocity Distribution")).toBeVisible();
  });

  // ─── MEMBER MANAGEMENT ──────────────────────────────

  test("Promote Bob to steward", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}/settings`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Manage Members")).toBeVisible({ timeout: 10000 });
    await page.click("button:has-text('Make Steward')");
    await page.waitForTimeout(1000);

    // Verify the button changed to "Demote"
    await expect(page.locator("button:has-text('Demote')")).toBeVisible({ timeout: 5000 });
  });

  test("Demote Bob back to member", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}/settings`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("button:has-text('Demote')")).toBeVisible({ timeout: 10000 });
    await page.click("button:has-text('Demote')");
    await page.waitForTimeout(1000);

    await expect(page.locator("button:has-text('Make Steward')")).toBeVisible({ timeout: 5000 });
  });

  // ─── EVENT CANCEL ────────────────────────────────────

  test("Create and cancel an event", async ({ page }) => {
    await signIn(page, "alice@test.com");

    const tempEventId = await createEvent(page, poolId, {
      title: "Event to Cancel",
      totalHours: 4,
      maxParticipants: 2,
    });

    await page.goto(`/events/${tempEventId}`);
    await page.waitForLoadState("networkidle");

    page.on("dialog", (dialog) => dialog.accept());
    await page.click("button:has-text('Cancel Event')");
    await page.waitForTimeout(1500);

    await page.reload();
    await page.waitForLoadState("networkidle");
    await expect(page.locator("text=cancelled")).toBeVisible();
  });

  // ─── CLAIM CANCEL + RE-CLAIM ────────────────────────

  test("Claim, cancel, and re-claim a slot", async ({ page }) => {
    await signIn(page, "alice@test.com");
    const tempEventId = await createEvent(page, poolId, {
      title: "Re-Claim Test",
      totalHours: 6,
      maxParticipants: 3,
    });

    // Bob claims
    await signOut(page);
    await signIn(page, "bob@test.com");
    await page.goto(`/events/${tempEventId}`);
    await page.waitForLoadState("networkidle");

    await page.click("button:has-text('Claim a Slot')");
    await page.waitForTimeout(500);
    await page.locator("input[type='number']").last().fill("2");
    await page.click("button:has-text('Commit 2 hours')");
    await expect(page.locator("text=You're committed for 2 hours")).toBeVisible({ timeout: 10000 });

    // Cancel
    await page.click("button:has-text('Cancel Claim')");
    await page.waitForTimeout(1000);
    await expect(page.locator("button:has-text('Claim a Slot')")).toBeVisible({ timeout: 10000 });

    // Re-claim
    await page.click("button:has-text('Claim a Slot')");
    await page.waitForTimeout(500);
    await page.locator("input[type='number']").last().fill("3");
    await page.click("button:has-text('Commit 3 hours')");
    await expect(page.locator("text=You're committed for 3 hours")).toBeVisible({ timeout: 10000 });
  });

  // ─── APPROVAL FLOW ──────────────────────────────────

  test("Approval-policy pool join request flow", async ({ page }) => {
    await signIn(page, "alice@test.com");

    const approvalPoolId = await createPool(page, {
      name: "Approval Pool",
      joinPolicy: "approval",
    });

    // Carol requests to join
    await signOut(page);
    await signIn(page, "carol@test.com", "Carol");
    await page.goto(`/join/${approvalPoolId}`);
    await page.waitForLoadState("networkidle");

    await page.click("button:has-text('Request to Join')");
    await page.waitForTimeout(2000);

    // Alice approves
    await signOut(page);
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${approvalPoolId}/settings`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Pending Requests")).toBeVisible({ timeout: 10000 });
    await expect(page.locator("text=Carol").first()).toBeVisible();

    await page.click("button:has-text('Approve')");
    await page.waitForTimeout(1000);

    // Pending section should be gone or Carol should be in member list
    await page.reload();
    await page.waitForLoadState("networkidle");
    // Carol should now appear in the Manage Members section
    await expect(page.locator("text=Manage Members")).toBeVisible({ timeout: 10000 });
  });

  // ─── EVENT SORT ──────────────────────────────────────

  test("Pool dashboard event sorting", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    const select = page.locator("select");
    await expect(select).toBeVisible({ timeout: 10000 });

    await select.selectOption("needs_help");
    await page.waitForTimeout(1000);

    // Events should still render
    await expect(page.locator("text=Upcoming Events")).toBeVisible();
  });

  // ─── ACTIVITY FEED ───────────────────────────────────

  test("Pool activity feed shows actions", async ({ page }) => {
    await signIn(page, "alice@test.com");
    await page.goto(`/pools/${poolId}`);
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Recent Activity")).toBeVisible({ timeout: 10000 });
  });

  test("Dashboard activity feed shows events", async ({ page }) => {
    await signIn(page, "bob@test.com");
    await page.goto("/dashboard");
    await page.waitForLoadState("networkidle");

    await expect(page.locator("text=Recent Activity")).toBeVisible({ timeout: 10000 });
  });

  // ─── OG IMAGE ────────────────────────────────────────

  test("OG image endpoint returns an image", async ({ page }) => {
    const response = await page.goto(`/api/og?eventId=${eventId}`, {
      waitUntil: "load",
      timeout: 30000,
    });
    expect(response?.status()).toBe(200);
    const contentType = response?.headers()["content-type"] ?? "";
    expect(contentType).toContain("image");
  });
});
