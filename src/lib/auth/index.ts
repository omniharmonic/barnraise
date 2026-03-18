import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { db } from "@/lib/db";
import { accounts } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        name: { label: "Display Name", type: "text" },
        isSignUp: { label: "Sign Up", type: "text" },
      },
      async authorize(credentials) {
        const email = credentials?.email as string;
        const password = credentials?.password as string;
        const name = credentials?.name as string;
        const isSignUp = credentials?.isSignUp === "true";

        if (!email || !password) return null;

        const existing = await db.query.accounts.findFirst({
          where: eq(accounts.email, email),
        });

        if (isSignUp) {
          // Sign up flow
          if (existing) {
            throw new Error("An account with this email already exists. Please sign in.");
          }

          const displayName = name || email.split("@")[0];
          const passwordHash = await bcrypt.hash(password, 12);

          const [newAccount] = await db
            .insert(accounts)
            .values({
              email,
              displayName,
              passwordHash,
            })
            .returning();

          return {
            id: newAccount.id,
            email: newAccount.email,
            name: newAccount.displayName,
          };
        }

        // Sign in flow
        if (!existing) {
          throw new Error("No account found with this email. Please sign up first.");
        }

        if (!existing.passwordHash) {
          // Legacy account without password — allow setting one
          const passwordHash = await bcrypt.hash(password, 12);
          await db
            .update(accounts)
            .set({ passwordHash })
            .where(eq(accounts.id, existing.id));

          return {
            id: existing.id,
            email: existing.email,
            name: existing.displayName,
          };
        }

        const valid = await bcrypt.compare(password, existing.passwordHash);
        if (!valid) {
          throw new Error("Incorrect password.");
        }

        return {
          id: existing.id,
          email: existing.email,
          name: existing.displayName,
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
        // Fetch fresh avatar URL from DB
        const account = await db.query.accounts.findFirst({
          where: eq(accounts.id, token.id as string),
          columns: { avatarUrl: true, displayName: true },
        });
        if (account) {
          session.user.image = account.avatarUrl;
          session.user.name = account.displayName;
        }
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
