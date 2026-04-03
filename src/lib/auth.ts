import { verifyToken } from "@clerk/backend";

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const sessionToken = cookieHeader
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith("__session="))
    ?.split("=")[1];

  if (!sessionToken) return null;

  try {
    const payload = await verifyToken(sessionToken, {
      jwtKey: import.meta.env.CLERK_JWT_KEY,
      authorizedParties: ["https://wcs.kaianolevine.com"],
    });
    return payload.sub ?? null;
  } catch {
    return null;
  }
}
