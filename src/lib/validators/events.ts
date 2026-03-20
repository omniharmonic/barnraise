import { z } from "zod";

const workAreaSchema = z.object({
  name: z.string().min(1).max(100),
  targetHours: z.number().int().min(1).nullish(),
});

export const createEventSchema = z.object({
  poolId: z.string().uuid(),
  title: z.string().min(2).max(200),
  description: z.string().max(5000).optional(),
  dateStart: z.string().datetime(),
  dateEnd: z.string().datetime(),
  locationName: z.string().max(500).optional(),
  totalHoursNeeded: z.number().int().min(1).max(1000),
  maxParticipants: z.number().int().min(1).max(100),
  minParticipants: z.number().int().min(1).max(100).default(1),
  flexibleHours: z.boolean().default(true),
  skillTags: z.array(z.string()).max(10).optional(),
  potluckUrl: z.string().url().optional(),
  bannerImageUrl: z.string().max(2000).optional(),
  hostingType: z.enum(["solo", "group"]).default("solo"),
  hostPledgeHours: z.number().int().min(1).optional(),
  workAreas: z.array(workAreaSchema).max(10).optional(),
});

export const updateEventSchema = z.object({
  eventId: z.string().uuid(),
  title: z.string().min(2).max(200).optional(),
  description: z.string().max(5000).optional(),
  dateStart: z.string().datetime().optional(),
  dateEnd: z.string().datetime().optional(),
  locationName: z.string().max(500).optional(),
  totalHoursNeeded: z.number().int().min(1).max(1000).optional(),
  maxParticipants: z.number().int().min(1).max(100).optional(),
  minParticipants: z.number().int().min(1).max(100).optional(),
  flexibleHours: z.boolean().optional(),
  skillTags: z.array(z.string()).max(10).optional(),
  potluckUrl: z.string().url().nullish(),
  bannerImageUrl: z.string().url().max(2000).nullish(),
  workAreas: z.array(workAreaSchema).max(10).optional(),
});

export const claimEventSchema = z.object({
  eventId: z.string().uuid(),
  hoursCommitted: z.number().int().min(1),
  workAreaId: z.string().uuid().nullish(),
});

export const verifyEventSchema = z.object({
  eventId: z.string().uuid(),
  verifications: z.array(
    z.object({
      claimId: z.string().uuid(),
      accountId: z.string().uuid(),
      attended: z.boolean(),
      actualHours: z.number().min(0),
    })
  ),
});

export const pledgeEventSchema = z.object({
  eventId: z.string().uuid(),
  hoursPledged: z.number().int().min(1),
});

export const withdrawPledgeSchema = z.object({
  eventId: z.string().uuid(),
});
