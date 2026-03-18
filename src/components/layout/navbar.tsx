"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "./notification-bell";
import { LogOut, User } from "lucide-react";

export function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="border-b border-earth/50 bg-cream-light/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2">
            <Image
              src="/barn_raise_no_bg.png"
              alt="Barn Raise"
              width={36}
              height={36}
              className="h-9 w-9 object-contain"
            />
            <span className="text-lg font-display text-walnut hidden sm:inline tracking-tight">
              Barn Raise
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            {session?.user ? (
              <>
                <Link href="/dashboard">
                  <Button variant="ghost" size="sm">
                    My Pools
                  </Button>
                </Link>
                <NotificationBell />
                <Link
                  href="/profile"
                  className="hidden sm:flex items-center gap-2 text-sm text-walnut-muted hover:text-walnut transition-colors px-2"
                >
                  <div className="w-7 h-7 rounded-full bg-barn-light flex items-center justify-center text-barn text-xs font-semibold">
                    {(session.user.name || session.user.email)?.[0]?.toUpperCase()}
                  </div>
                  <span className="max-w-[120px] truncate">
                    {session.user.name || session.user.email}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut({ callbackUrl: "/sign-in" })}
                  className="text-walnut-muted hover:text-walnut"
                >
                  <LogOut className="h-4 w-4" />
                </Button>
              </>
            ) : (
              <Link href="/sign-in">
                <Button size="sm">Sign In</Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
