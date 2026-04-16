import { verifyToken } from "@clerk/backend";

export interface WcsUserProfile {
  user_id: string;
  email: string;
  display_name: string;
  is_admin: boolean;
  created_at: string;
  last_seen_at: string;
}

/**
 * Verifies the Clerk session cookie and returns the user's Clerk sub (user_id).
 * Returns null if unauthenticated or verification fails.
 */
export async function getAuthenticatedUserId(
  request: Request,
  env?: Record<string, string>,
): Promise<string | null> {
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

  const jwtKey = env?.CLERK_JWT_KEY ?? import.meta.env.CLERK_JWT_KEY;
  if (!jwtKey) return null;

  try {
    const payload = await verifyToken(sessionToken, {
      jwtKey: jwtKey.replace(/\\n/g, "\n"),
      authorizedParties: ["https://wcs.kaianolevine.com"],
    });
    return payload.sub ?? null;
  } catch (err) {
    console.error("[auth] verifyToken failed:", err);
    return null;
  }
}

/**
 * Fetches the user's email and display name from the Clerk backend API.
 * Returns empty strings on failure - upsert will preserve existing values.
 */
export async function getClerkUserData(
  userId: string,
  env?: Record<string, string>,
): Promise<{ email: string; displayName: string }> {
  const secretKey = env?.CLERK_SECRET_KEY ?? import.meta.env.CLERK_SECRET_KEY;
  if (!secretKey) return { email: "", displayName: "" };

  try {
    const res = await fetch(`https://api.clerk.com/v1/users/${userId}`, {
      headers: {
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
    });
    if (!res.ok) {
      console.error("[auth] getClerkUserData failed:", res.status);
      return { email: "", displayName: "" };
    }
    const data = await res.json();
    const email = data.email_addresses?.[0]?.email_address ?? "";
    const firstName = data.first_name ?? "";
    const lastName = data.last_name ?? "";
    const displayName = [firstName, lastName].filter(Boolean).join(" ") ||
      (data.username ?? "");
    return { email, displayName };
  } catch (err) {
    console.error("[auth] getClerkUserData error:", err);
    return { email: "", displayName: "" };
  }
}

/**
 * Fetches the WCS user profile from the API for a given Clerk user_id.
 * Returns null if the profile does not exist yet (first-time user before upsert).
 */
export async function getWcsProfile(
  userId: string,
  apiBase: string,
): Promise<WcsUserProfile | null> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/wcs/me`, {
      headers: { "X-Owner-Id": userId },
    });
    if (res.status === 404) return null;
    if (!res.ok) {
      console.error("[auth] getWcsProfile failed:", res.status);
      return null;
    }
    const json = await res.json();
    return (json?.data ?? null) as WcsUserProfile | null;
  } catch (err) {
    console.error("[auth] getWcsProfile error:", err);
    return null;
  }
}

/**
 * Upserts a WCS user profile via the API. Called after sign-in to ensure
 * the profile row exists before any access checks run.
 */
export async function upsertWcsProfile(
  userId: string,
  email: string,
  displayName: string,
  apiBase: string,
): Promise<WcsUserProfile | null> {
  try {
    const res = await fetch(`${apiBase.replace(/\/$/, "")}/v1/wcs/me`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Owner-Id": userId,
      },
      body: JSON.stringify({ email, display_name: displayName }),
    });
    if (!res.ok) {
      console.error("[auth] upsertWcsProfile failed:", res.status);
      return null;
    }
    const json = await res.json();
    return (json?.data ?? null) as WcsUserProfile | null;
  } catch (err) {
    console.error("[auth] upsertWcsProfile error:", err);
    return null;
  }
}
