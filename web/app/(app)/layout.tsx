import { api } from "@/lib/api";
import { AppShell } from "@/components/app/AppShell";
import { ownerCookie } from "@/lib/server";
import "../app.css";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const me = await api.me({ cookie: await ownerCookie() }).catch(() => null);
  return <AppShell me={me}>{children}</AppShell>;
}
