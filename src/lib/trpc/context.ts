import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import type { TRPCContext } from "./init";

export async function createTRPCContext(): Promise<TRPCContext> {
  const session = await auth();
  return { db, session };
}
