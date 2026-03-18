import { Navbar } from "@/components/layout/navbar";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        {children}
      </main>
    </>
  );
}
