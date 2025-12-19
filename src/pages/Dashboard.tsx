import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";

export default function DashboardPage() {
  const appInfoQuery = useQuery({
    queryKey: ["appInfo"],
    queryFn: api.appInfo,
  });

  const balanceQuery = useQuery({
    queryKey: ["balance"],
    queryFn: api.getBalance,
  });

  const txsQuery = useQuery({
    queryKey: ["transactions"],
    queryFn: api.listTransactions,
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Dashboard</div>
        <div className="mt-1 text-sm text-zinc-600">
          {appInfoQuery.data
            ? `v${appInfoQuery.data.version} · ${appInfoQuery.data.os}`
            : "Loading app info..."}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs text-zinc-500">Total</div>
          <div className="mt-1 text-lg font-semibold">
            {balanceQuery.data?.total ?? "-"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs text-zinc-500">Confirmed</div>
          <div className="mt-1 text-lg font-semibold">
            {balanceQuery.data?.confirmed ?? "-"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs text-zinc-500">Pending</div>
          <div className="mt-1 text-lg font-semibold">
            {balanceQuery.data?.pending ?? "-"}
          </div>
        </div>
        <div className="rounded-lg border border-zinc-200 p-4">
          <div className="text-xs text-zinc-500">Unspent</div>
          <div className="mt-1 text-lg font-semibold">
            {balanceQuery.data?.unspent ?? "-"}
          </div>
        </div>
      </section>

      <section className="rounded-lg border border-zinc-200">
        <div className="border-b border-zinc-200 p-4">
          <div className="text-sm font-semibold">Transaction History</div>
          <div className="mt-1 text-xs text-zinc-500">
            TVK export and details view will be implemented after DB + client wiring.
          </div>
        </div>
        <div className="divide-y divide-zinc-200">
          {(txsQuery.data ?? []).map((tx) => (
            <div key={tx.id} className="flex items-center justify-between p-4">
              <div>
                <div className="text-sm font-medium">
                  {tx.direction === "incoming" ? "Received" : "Sent"}
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {new Date(tx.timestamp * 1000).toLocaleString()} · {tx.status}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold">{tx.amount}</div>
                <div className="mt-0.5 text-xs text-zinc-500">Fee: {tx.fee}</div>
              </div>
            </div>
          ))}

          {txsQuery.data?.length === 0 ? (
            <div className="p-4 text-sm text-zinc-600">No transactions yet.</div>
          ) : null}
        </div>
      </section>
    </div>
  );
}
