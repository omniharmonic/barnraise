import { Navbar } from "@/components/layout/navbar";

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Navbar />
      <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
        {children}
      </main>
    </>
  );
}
