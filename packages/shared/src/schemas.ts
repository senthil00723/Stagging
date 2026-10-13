import { z } from "zod";
import { LANDING_ROUTES, type LandingRoute, PERMISSION_KEYS } from "./permissions.ts";

export const slugSchema = z
  .string()
  .min(3)
  .max(40)
  .regex(/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/, "lowercase letters, digits and dashes");

export const passwordSchema = z.string().min(10).max(200);

export const signupSchema = z.object({
  orgName: z.string().min(2).max(120),
  slug: slugSchema,
  name: z.string().min(1).max(120),
  email: z.email().toLowerCase(),
  password: passwordSchema,
});
export type SignupInput = z.infer<typeof signupSchema>;

export const loginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
  orgSlug: slugSchema.optional(),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const inviteSchema = z.object({
  email: z.email().toLowerCase(),
  roleId: z.uuid(),
  positionId: z.uuid().optional(),
});
export type InviteInput = z.infer<typeof inviteSchema>;

export const acceptInviteSchema = z.object({
  token: z.string().min(20),
  name: z.string().min(1).max(120),
  password: passwordSchema,
});
export type AcceptInviteInput = z.infer<typeof acceptInviteSchema>;

export const roleSchema = z.object({
  name: z.string().min(2).max(80),
  landingRoute: z.enum(LANDING_ROUTES),
  permissions: z.array(z.enum(PERMISSION_KEYS as [string, ...string[]])).min(1),
});
export type RoleInput = z.infer<typeof roleSchema>;

export const positionSchema = z.object({ name: z.string().min(2).max(80) });

export const contactSchema = z.object({
  name: z.string().min(1).max(160),
  email: z.email().toLowerCase().optional(),
  phone: z.string().max(20).optional(),
  ownerId: z.uuid().optional(),
});
export type ContactInput = z.infer<typeof contactSchema>;

export const adminLoginSchema = z.object({
  email: z.email().toLowerCase(),
  password: z.string().min(1),
});

export const totpSchema = z.object({
  challenge: z.string().min(10),
  code: z.string().regex(/^\d{6}$/),
});

/** Shape returned by GET /api/v1/me */
export interface Session {
  user: { id: string; name: string; email: string };
  org: { id: string; name: string; slug: string };
  role: { id: string; name: string; landingRoute: LandingRoute };
  position: { id: string; name: string } | null;
  permissions: string[];
}
