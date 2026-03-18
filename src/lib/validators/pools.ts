import { z } from "zod";

const customLinkSchema = z.object({
  label: z.string().min(1).max(50),
  url: z.string().url().max(500),
});

/** Accept empty string or valid URL, normalize empty to undefined, add protocol if missing */
const optionalUrl = z
  .string()
  .max(500)
  .optional()
  .transform((val) => {
    if (!val || val.trim() === "") return undefined;
    const trimmed = val.trim();
    // Add https:// if no protocol present
    if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
    return trimmed;
  });

export const createPoolSchema = z.object({
  name: z.string().min(2).max(100),
  description: z.string().max(1000).optional(),
  locationName: z.string().max(200).optional(),
  websiteUrl: optionalUrl,
  groupChatUrl: optionalUrl,
  customLinks: z.array(customLinkSchema).max(5).optional(),
  joinPolicy: z.enum(["open", "invite", "approval"]).default("invite"),
  startingBalance: z.number().int().min(0).max(5).default(2),
  maxNegativeBalance: z.number().int().min(-20).max(-1).default(-10),
  eventFrequencyLimit: z.number().int().min(1).max(10).optional(),
});

export const updatePoolSettingsSchema = z.object({
  poolId: z.string().uuid(),
  name: z.string().min(2).max(100).optional(),
  description: z.string().max(1000).optional(),
  locationName: z.string().max(200).optional(),
  websiteUrl: optionalUrl,
  groupChatUrl: optionalUrl,
  customLinks: z.array(customLinkSchema).max(5).nullish(),
  joinPolicy: z.enum(["open", "invite", "approval"]).optional(),
  startingBalance: z.number().int().min(0).max(5).optional(),
  maxNegativeBalance: z.number().int().min(-20).max(-1).optional(),
  eventFrequencyLimit: z.number().int().min(1).max(10).nullish(),
});
