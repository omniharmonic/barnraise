"use client";

import Link from "next/link";
import Image from "next/image";
import { useSession, signOut } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { AvatarCircle } from "@/components/ui/avatar-circle";
import { NotificationBell } from "./notification-bell";
import { LogOut } from "lucide-react";

export function Navbar() {
  const { data: session } = useSession();

  return (
    <nav className="border-b border-earth/50 bg-cream-light/80 backdrop-blur-md sticky top-0 z-40">
      <div className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8">
        <div className="flex h-14 sm:h-16 items-center justify-between">
          <Link href="/dashboard" className="flex items-center gap-2 shrink-0">
            <Image
              src="/barn_raise_no_bg.png"
              alt="Barn Raise"
              width={32}
              height={32}
              className="h-8 w-8 sm:h-9 sm:w-9 object-contain"
            />
            <span className="text-lg font-display text-walnut hidden sm:inline tracking-tight">
              Barn Raise
            </span>
          </Link>

          <div className="flex items-center gap-1 sm:gap-3">
            {session?.user ? (
              <>
                <Link href="/dashboard" className="hidden sm:block">
                  <Button variant="ghost" size="sm">
                    My Pools
                  </Button>
                </Link>
                <NotificationBell />
                <Link
                  href="/profile"
                  className="flex items-center gap-1.5 sm:gap-2 text-sm text-walnut-muted hover:text-walnut transition-colors px-1 sm:px-2"
                >
                  <AvatarCircle
                    src={session.user.image}
                    name={session.user.name || session.user.email || "?"}
                    size="sm"
                  />
                  <span className="hidden sm:inline max-w-[120px] truncate">
                    {session.user.name || session.user.email}
                  </span>
                </Link>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => signOut({ callbackUrl: "/sign-in" })}
                  className="text-walnut-muted hover:text-walnut h-8 w-8 sm:h-10 sm:w-10"
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
