import { OpenAPIHono, z } from "@hono/zod-openapi";
import type { Env } from "hono";
import { HTTPException } from "hono/http-exception";

export const ErrorSchema = z.object({ error: z.string() }).openapi("Error");
export const OkSchema = z.object({ ok: z.literal(true) }).openapi("Ok");

/** OpenAPIHono with a uniform 400 for schema validation failures. */
export function router<E extends Env>() {
  return new OpenAPIHono<E>({
    defaultHook: (result, c) => {
      if (!result.success) {
        return c.json({ error: "Invalid request", issues: result.error.issues }, 400);
      }
    },
  });
}

export const jsonBody = <T extends z.ZodType>(schema: T) => ({
  body: { content: { "application/json": { schema } }, required: true },
});

export const jsonRes = <T extends z.ZodType>(schema: T, description = "OK") => ({
  content: { "application/json": { schema } },
  description,
});

export const errors = {
  400: jsonRes(ErrorSchema, "Invalid request"),
  401: jsonRes(ErrorSchema, "Not authenticated"),
  403: jsonRes(ErrorSchema, "Forbidden"),
} as const;

export const fail = (status: 400 | 401 | 403 | 404 | 409 | 429, message: string): never => {
  throw new HTTPException(status, { message });
};
