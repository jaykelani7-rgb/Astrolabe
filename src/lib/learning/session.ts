import "server-only";
import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const COOKIE = "mentor_session";
let cachedSecret: string | undefined;

function secret(): string {
  if (cachedSecret) return cachedSecret;
  if (
    process.env.MENTOR_SESSION_SECRET &&
    process.env.MENTOR_SESSION_SECRET.length >= 32
  ) {
    cachedSecret = process.env.MENTOR_SESSION_SECRET;
    return cachedSecret;
  }
  const directory = process.env.MENTOR_DATA_DIR || join(process.cwd(), ".data");
  mkdirSync(directory, { recursive: true });
  const path = join(directory, "session-secret");
  try {
    cachedSecret = readFileSync(path, "utf8").trim();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    const generated = randomBytes(48).toString("base64url");
    try {
      writeFileSync(path, generated, { flag: "wx", mode: 0o600 });
    } catch (writeError) {
      if ((writeError as NodeJS.ErrnoException).code !== "EEXIST")
        throw writeError;
    }
    cachedSecret = readFileSync(path, "utf8").trim();
  }
  if (!cachedSecret || cachedSecret.length < 32)
    throw new Error("The session signing secret is invalid.");
  return cachedSecret;
}

function sign(id: string): string {
  return createHmac("sha256", secret()).update(id).digest("base64url");
}

export function getSession(request: Request): { id: string; cookie?: string } {
  const value = (request.headers.get("cookie") || "")
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE}=`))
    ?.slice(COOKIE.length + 1);
  if (value && value.length <= 100) {
    const [id, signature, extra] = value.split(".");
    if (!extra && /^[0-9a-f-]{36}$/.test(id || "") && signature) {
      const expected = Buffer.from(sign(id));
      const actual = Buffer.from(signature);
      if (
        actual.length === expected.length &&
        timingSafeEqual(actual, expected)
      )
        return { id };
    }
  }
  const id = randomUUID();
  return {
    id,
    cookie: `${COOKIE}=${id}.${sign(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${new URL(request.url).protocol === "https:" ? "; Secure" : ""}`,
  };
}

export function sessionResponse(
  request: Request,
  execute: (sessionId: string) => unknown,
): Response {
  const session = getSession(request);
  const response = Response.json(execute(session.id));
  if (session.cookie) response.headers.set("Set-Cookie", session.cookie);
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function sessionResponseAsync(
  request: Request,
  execute: (sessionId: string) => Promise<unknown>,
): Promise<Response> {
  const session = getSession(request);
  const response = Response.json(await execute(session.id));
  if (session.cookie) response.headers.set("Set-Cookie", session.cookie);
  response.headers.set("Cache-Control", "no-store");
  return response;
}
