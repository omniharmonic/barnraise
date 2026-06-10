"use client";

import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTRPC } from "@/lib/trpc/react";
import { Bell, Check } from "lucide-react";
import Link from "next/link";

export function NotificationBell() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: unreadCount } = useQuery(
    trpc.notifications.unreadCount.queryOptions()
  );
  const { data: notifData } = useQuery(
    trpc.notifications.list.queryOptions({ limit: 10 })
  );
  const markRead = useMutation({
    ...trpc.notifications.markRead.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });
  const markAllRead = useMutation({
    ...trpc.notifications.markAllRead.mutationOptions(),
    onSuccess: () => queryClient.invalidateQueries(),
  });

  // Close on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const notifications = notifData?.items ?? [];

  function getNotifLink(notif: (typeof notifications)[0]): string | null {
    const data = notif.data as Record<string, string> | null;
    if (data?.eventId) return `/events/${data.eventId}`;
    if (data?.poolId) return `/pools/${data.poolId}`;
    return null;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        className="relative p-2 rounded-lg hover:bg-stone-100 transition-colors cursor-pointer"
        onClick={() => setOpen(!open)}
      >
        <Bell className="h-5 w-5 text-stone-600" />
        {unreadCount != null && unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex items-center justify-center h-5 w-5 rounded-full bg-amber-600 text-white text-xs font-bold">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-white rounded-xl border border-stone-200 shadow-lg z-50 max-h-96 overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100">
            <span className="text-sm font-semibold text-stone-900">
              Notifications
            </span>
            {unreadCount != null && unreadCount > 0 && (
              <button
                className="text-xs text-amber-700 hover:underline cursor-pointer"
                onClick={() => markAllRead.mutate()}
              >
                Mark all read
              </button>
            )}
          </div>

          {notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">
              No notifications yet
            </div>
          ) : (
            <div>
              {notifications.map((notif) => {
                const link = getNotifLink(notif);
                const content = (
                  <div
                    className={`px-4 py-3 border-b border-stone-50 hover:bg-stone-50 transition-colors ${
                      !notif.readAt ? "bg-amber-50/50" : ""
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-stone-900 truncate">
                          {notif.title}
                        </p>
                        {notif.body && (
                          <p className="text-xs text-stone-500 mt-0.5 line-clamp-2">
                            {notif.body}
                          </p>
                        )}
                        <p className="text-xs text-stone-400 mt-1">
                          {new Date(notif.createdAt).toLocaleDateString(
                            undefined,
                            {
                              month: "short",
                              day: "numeric",
                              hour: "numeric",
                              minute: "2-digit",
                            }
                          )}
                        </p>
                      </div>
                      {!notif.readAt && (
                        <button
                          className="mt-1 p-1 rounded hover:bg-stone-200 cursor-pointer"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            markRead.mutate({
                              notificationId: notif.id,
                            });
                          }}
                        >
                          <Check className="h-3 w-3 text-stone-400" />
                        </button>
                      )}
                    </div>
                  </div>
                );

                return link ? (
                  <Link
                    key={notif.id}
                    href={link}
                    onClick={() => {
                      setOpen(false);
                      if (!notif.readAt)
                        markRead.mutate({ notificationId: notif.id });
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <div key={notif.id}>{content}</div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
