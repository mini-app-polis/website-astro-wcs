import { verifyToken } from "@clerk/backend";

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  // Clerk may use __session or a suffixed variant like __session_qkRq4rUA
  const sessionCookie = cookies.find(
    (c) => c.startsWith("__session=") || /^__session_[a-zA-Z0-9]+=/.test(c),
  );
  const sessionToken = sessionCookie?.split("=").slice(1).join("=");

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
