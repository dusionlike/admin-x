import jwt from "jsonwebtoken";

import type { AuthUser } from "@admin-x/shared";

const JWT_SECRET = process.env.JWT_SECRET ?? "admin-x-development-secret";

export const REAUTHENTICATION_HEADER = "x-admin-x-reauth";
export const REAUTHENTICATION_EXPIRES_IN = 5 * 60;

export function issueReauthenticationToken(user: AuthUser, sessionVersion: number): string {
  return jwt.sign(
    {
      kind: "reauth",
      sessionVersion,
    },
    JWT_SECRET,
    {
      expiresIn: REAUTHENTICATION_EXPIRES_IN,
      subject: user.id,
    },
  );
}

export function verifyReauthenticationToken(
  token: string,
  userId: string,
  sessionVersion: number,
): boolean {
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    return (
      typeof payload !== "string" &&
      payload.kind === "reauth" &&
      payload.sub === userId &&
      payload.sessionVersion === sessionVersion
    );
  } catch {
    return false;
  }
}
