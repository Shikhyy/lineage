import type { Metadata } from "next";
import Link from "next/link";
import { DecisionCard } from "@/components/app/DecisionCard";
import { ErrorState } from "@/components/app/ErrorState";
import { ApprovalActions, LoginForm } from "@/components/app/Forms";
import { api, fetched } from "@/lib/api";
import { ownerCookie } from "@/lib/server";

// The tab title follows what the page shows: a sign-in form for visitors, the queue for the owner.
export async function generateMetadata(): Promise<Metadata> {
  const me = await fetched(api.me({ cookie: await ownerCookie() }));
  return { title: me.ok && me.data.owner ? "Owner approvals" : "Owner sign-in" };
}

export default async function ApprovalsPage() {
  const cookie = await ownerCookie();
  const me = await fetched(api.me({ cookie }));
  if (!me.ok) return <ApprovalsShell><ErrorState {...me} /></ApprovalsShell>;
  if (!me.data.owner) {
    return (
      <>
        <h1>Owner sign-in</h1>
        <p className="muted">Approvals are visible to the owner only. Enter the owner secret to continue.</p>
        <LoginForm />
      </>
    );
  }

  const res = await fetched(api.approvals({ cookie }));
  if (!res.ok) return <ApprovalsShell><ErrorState {...res} /></ApprovalsShell>;
  const { pending, resolved } = res.data;

  return (
    <ApprovalsShell>
      {pending?.length ? (
        pending.map((d) => (
          <div key={d.id}>
            <div className="row">
              <b>{d.id}</b> · run <Link href={`/runs/${d.run_id}`}>{d.run_id}</Link>
            </div>
            {d.approval && <DecisionCard d={d} actions={<ApprovalActions approvalId={d.approval.id} />} />}
          </div>
        ))
      ) : (
        <p className="muted">Nothing is waiting for you.</p>
      )}
      {!!resolved?.length && (
        <>
          <h2>Recently resolved</h2>
          {resolved.map((d) => (
            <div className="muted" key={d.id}>
              {d.approval?.status} · <code>{d.args.payee}</code> · run <Link href={`/runs/${d.run_id}`}>{d.run_id}</Link>
            </div>
          ))}
        </>
      )}
    </ApprovalsShell>
  );
}

function ApprovalsShell({ children }: { children: React.ReactNode }) {
  return (
    <>
      <h1>Owner approvals</h1>
      <p className="muted">
        A payment that depends on a value from an untrusted source waits here. Check the lineage before you approve,
        ideally by contacting the vendor out-of-band.
      </p>
      {children}
    </>
  );
}
