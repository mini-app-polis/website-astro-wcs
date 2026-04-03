import { verifyToken } from "@clerk/backend";

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";

  const cookieMap: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    cookieMap[key] = val;
  }

  const sessionToken =
    cookieMap["__session"] ??
    Object.entries(cookieMap).find(([k]) => k.startsWith("__session_"))?.[1];

  if (!sessionToken) return null;

  const jwtKey =
    import.meta.env.CLERK_JWT_KEY ??
    (typeof process !== "undefined" ? process.env.CLERK_JWT_KEY : undefined);

  console.error("[auth] jwtKey present:", !!import.meta.env.CLERK_JWT_KEY);
  console.error("[auth] jwtKey starts with:", import.meta.env.CLERK_JWT_KEY?.slice(0, 30));
  console.error("[auth] jwtKey via process.env:", !!process.env.CLERK_JWT_KEY);
  console.error("[auth] token present:", !!sessionToken);
  console.error("[auth] token prefix:", sessionToken?.slice(0, 20));

  try {
    const payload = await verifyToken(sessionToken, {
      jwtKey: jwtKey?.replace(/\\n/g, "\n"),
      authorizedParties: ["https://wcs.kaianolevine.com"],
    });
    return payload.sub ?? null;
  } catch (err) {
    console.error("[auth] verifyToken failed:", err);
    return null;
  }
}
