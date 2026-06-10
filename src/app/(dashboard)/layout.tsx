import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Navbar } from "@/components/layout/navbar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Server-side route protection: unauthenticated users never reach the
  // authenticated shell (defense in depth alongside the tRPC gate).
  const session = await auth();
  if (!session?.user?.id) {
    redirect("/sign-in");
  }
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {children}
      </main>
    </>
  );
}
