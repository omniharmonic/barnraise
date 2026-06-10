import { db } from "@/lib/db";
import { notifications } from "@/lib/db/schema";

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

export async function sendNotification(params: SendNotificationParams) {
  await db.insert(notifications).values({
    accountId: params.accountId,
    type: params.type,
    title: params.title,
    body: params.body,
    data: params.data,
  });
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
}
