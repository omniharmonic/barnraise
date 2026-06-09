import { accounts, type pools } from "@/lib/db/schema";

/**
 * Field projections for `accounts`. Client-facing queries must select one of
 * these instead of the whole row, so that secret/PII columns (email,
 * password credentials, chain identifiers) can never be serialized to a
 * client — including the unauthenticated public event endpoint.
 */

/** Minimal identity — safe for any caller, including anonymous. */
export const publicAccountColumns = {
  id: accounts.id,
  displayName: accounts.displayName,
  avatarUrl: accounts.avatarUrl,
} as const;

/** Richer profile fields for member/profile views. Still no email/credentials. */
export const memberAccountColumns = {
  ...publicAccountColumns,
  bio: accounts.bio,
  locationName: accounts.locationName,
  skills: accounts.skills,
  createdAt: accounts.createdAt,
} as const;

/** Self-view: what a user may see about their own account. Still no credentials. */
export const selfAccountColumns = {
  ...memberAccountColumns,
  email: accounts.email,
  updatedAt: accounts.updatedAt,
} as const;

export type PublicAccount = {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string | null;
  locationName: string | null;
  skills: string[] | null;
  createdAt: Date;
};

/**
 * Pool fields safe to expose through the public (unauthenticated) event
 * endpoint. Drops chain bridge addresses, fee internals, and creator id.
 */
export function publicPoolView(pool: typeof pools.$inferSelect) {
  return {
    id: pool.id,
    name: pool.name,
    symbol: pool.symbol,
    description: pool.description,
    locationName: pool.locationName,
    websiteUrl: pool.websiteUrl,
    groupChatUrl: pool.groupChatUrl,
    customLinks: pool.customLinks,
    skillTags: pool.skillTags,
    joinPolicy: pool.joinPolicy,
    startingBalance: pool.startingBalance,
    maxNegativeBalance: pool.maxNegativeBalance,
  };
}
