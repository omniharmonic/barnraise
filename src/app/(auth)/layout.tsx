export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto max-w-6xl px-4 sm:px-6 lg:px-8 py-8">
      {children}
    </main>
  );
}
