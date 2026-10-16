import { z } from "zod";

export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}
export function jsonError(error: unknown): Response {
  if (error instanceof AppError)
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  if (error instanceof z.ZodError)
    return Response.json(
      {
        error: {
          code: "INVALID_INPUT",
          message: "Please check the submitted information.",
          details: error.issues,
        },
      },
      { status: 400 },
    );
  console.error(
    "[mentor] Request failed:",
    error instanceof Error ? error.message : "Unknown error",
  );
  return Response.json(
    {
      error: {
        code: "INTERNAL_ERROR",
        message: "Something went wrong. Please try again.",
      },
    },
    { status: 500 },
  );
}
export async function readJson<T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 8192,
): Promise<T> {
  const length = Number(request.headers.get("content-length") || "0");
  if (length > maxBytes)
    throw new AppError("REQUEST_TOO_LARGE", "This request is too large.", 413);
  if (!request.headers.get("content-type")?.includes("application/json"))
    throw new AppError(
      "INVALID_INPUT",
      "Send JSON with the application/json content type.",
      415,
    );
  const reader = request.body?.getReader();
  if (!reader)
    throw new AppError("INVALID_INPUT", "A request body is required.");
  let size = 0;
  const chunks: Uint8Array[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new AppError(
        "REQUEST_TOO_LARGE",
        "This request is too large.",
        413,
      );
    }
    chunks.push(value);
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const part of chunks) {
    joined.set(part, offset);
    offset += part.length;
  }
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder().decode(joined));
  } catch {
    throw new AppError(
      "INVALID_INPUT",
      "The request body must contain valid JSON.",
    );
  }
  return schema.parse(value);
}
