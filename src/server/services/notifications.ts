import { inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { notifications, accounts } from "@/lib/db/schema";
import { sendEmail } from "@/lib/email";

export type NotificationType =
  | "new_event"
  | "slot_claimed"
  | "event_confirmed"
  | "event_reminder"
  | "verify_request"
  | "points_earned"
  | "noshow_marked"
  | "member_joined"
  | "member_removed"
  | "invite_received"
  | "noshow_flag";

interface SendNotificationParams {
  accountId: string;
  type: NotificationType;
  title: string;
  body?: string;
  data?: Record<string, unknown>;
}

const APP_URL = process.env.NEXTAUTH_URL || "https://barnraise.app";

/** Build a deep link for a notification from its data payload. */
function linkFor(data?: Record<string, unknown>): string {
  if (data?.eventId) return `${APP_URL}/events/${data.eventId}`;
  if (data?.poolId) return `${APP_URL}/pools/${data.poolId}`;
  return APP_URL;
}

/**
 * Dispatch instant emails to the subset of recipients whose preference is
 * 'instant'. Best-effort: failures are swallowed by sendEmail.
 */
async function dispatchInstantEmails(
  accountIds: string[],
  params: Omit<SendNotificationParams, "accountId">
) {
  if (accountIds.length === 0) return;
  const recipients = await db
    .select({ id: accounts.id, email: accounts.email, emailDigest: accounts.emailDigest })
    .from(accounts)
    .where(inArray(accounts.id, accountIds));

  const link = linkFor(params.data);
  await Promise.all(
    recipients
      .filter((r) => r.email && r.emailDigest === "instant")
      .map((r) =>
        sendEmail({
          to: r.email!,
          subject: params.title,
          text: `${params.body ? params.body + "\n\n" : ""}${link}`,
        })
      )
  );
}

export async function sendNotification(params: SendNotificationParams) {
  await db.insert(notifications).values({
    accountId: params.accountId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
  });
  await dispatchInstantEmails([params.accountId], params);
}

export async function sendNotificationToMany(
  accountIds: string[],
  params: Omit<SendNotificationParams, "accountId">
) {
  if (accountIds.length === 0) return;
  await db.insert(notifications).values(
    accountIds.map((accountId) => ({
      accountId,
      type: params.type,
      title: params.title,
      body: params.body,
      data: params.data,
    }))
  );
  await dispatchInstantEmails(accountIds, params);
}
