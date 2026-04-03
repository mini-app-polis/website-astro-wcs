import { verifyToken } from "@clerk/backend";

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";

  // Extract all cookies as key-value pairs
  const cookieMap: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookieMap[key] = val;
  }

  // Clerk uses __session or __session_<suffix> in production
  const sessionToken =
    cookieMap["__session"] ??
    Object.entries(cookieMap).find(([k]) => k.startsWith("__session_"))?.[1];

  if (!sessionToken) return null;

  try {
    const payload = await verifyToken(sessionToken, {
      secretKey: import.meta.env.CLERK_SECRET_KEY,
      authorizedParties: ["https://wcs.kaianolevine.com"],
    });
    return payload.sub ?? null;
  } catch (err) {
    console.error("[auth] verifyToken failed:", err);
    return null;
  }
}
