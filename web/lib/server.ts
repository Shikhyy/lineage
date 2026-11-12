import { cookies } from "next/headers";

/** The visitor's cookies as a Cookie header, so the Go API can see the owner session. */
export async function ownerCookie(): Promise<string> {
  return (await cookies()).toString();
}
