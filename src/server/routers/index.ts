import { router } from "@/lib/trpc/init";
import { poolsRouter } from "./pools";
import { eventsRouter } from "./events";
import { usersRouter } from "./users";
import { notificationsRouter } from "./notifications";

export const appRouter = router({
  pools: poolsRouter,
  events: eventsRouter,
  users: usersRouter,
  notifications: notificationsRouter,
});

export type AppRouter = typeof appRouter;
