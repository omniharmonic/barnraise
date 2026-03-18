import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    // Simple credentials provider for prototype
    // In production, replace with magic link via Resend
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Display Name", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const name = credentials?.name as string;

        if (!email) return null;

        // Find or create user
        const existing = await db.query.accounts.findFirst({
          where: eq(accounts.email, email),
        });

        if (existing) {
          return {
            id: existing.id,
            email: existing.email,
            name: existing.displayName,
          };
        }

        // Create new account
        const displayName = name || email.split("@")[0];
        const [newAccount] = await db
          .insert(accounts)
          .values({
            email,
            displayName,
          })
          .returning();

        return {
          id: newAccount.id,
          email: newAccount.email,
          name: newAccount.displayName,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      if (token.id) {
        session.user.id = token.id as string;
      }
      return session;
    },
  },
  pages: {
    signIn: "/sign-in",
  },
  session: {
    strategy: "jwt",
  },
});
