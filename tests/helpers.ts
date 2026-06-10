import { createCallerFactory } from "@/lib/trpc/init";
import { appRouter } from "@/server/routers";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";

export const caller = createCallerFactory(appRouter);

export function callerFor(userId: string) {
  return caller({
    db,
    session: { user: { id: userId }, expires: "" } as never,
  });
}

let seq = 0;
export async function mkUser(name: string) {
  seq += 1;
  const email = `u${Date.now()}-${seq}-${Math.random().toString(36).slice(2)}@t.co`;
  const [a] = await db.insert(accounts).values({ email, displayName: name }).returning();
  return a.id;
}
