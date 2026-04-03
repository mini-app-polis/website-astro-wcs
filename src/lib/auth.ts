import { verifyToken } from "@clerk/backend";

export async function getAuthenticatedUserId(request: Request): Promise<string | null> {
  const cookieHeader = request.headers.get("cookie") ?? "";
  const cookies = cookieHeader.split(";").map((c) => c.trim());

  const sessionCookie = cookies.find(
    (c) => c.startsWith("__session=") || /^__session_[a-zA-Z0-9]+=/.test(c),
  );
  const sessionToken = sessionCookie?.split("=").slice(1).join("=");

  console.log("[auth] cookie found:", !!sessionCookie);
  console.log("[auth] token length:", sessionToken?.length ?? 0);
  console.log("[auth] jwtKey set:", !!import.meta.env.CLERK_JWT_KEY);
  console.log("[auth] jwtKey prefix:", import.meta.env.CLERK_JWT_KEY?.slice(0, 30));

  if (!sessionToken) return null;

  try {
    const payload = await verifyToken(sessionToken, {
      jwtKey: import.meta.env.CLERK_JWT_KEY,
      authorizedParties: ["https://wcs.kaianolevine.com"],
    });
    console.log("[auth] verified userId:", payload.sub);
    return payload.sub ?? null;
  } catch (err) {
    console.error("[auth] verifyToken error:", err);
    return null;
  }
}
