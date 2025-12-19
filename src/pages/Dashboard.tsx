import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";

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
        <div className="text-2xl font-semibold">Dashboard</div>
        <div className="mt-1 text-sm text-muted-foreground">
          {appInfoQuery.data
            ? `v${appInfoQuery.data.version} · ${appInfoQuery.data.os}`
            : "Loading app info..."}
        </div>
      </div>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total</CardDescription>
            <CardTitle className="text-2xl">{balanceQuery.data?.total ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Confirmed</CardDescription>
            <CardTitle className="text-2xl">
              {balanceQuery.data?.confirmed ?? "-"}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Pending</CardDescription>
            <CardTitle className="text-2xl">{balanceQuery.data?.pending ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Unspent</CardDescription>
            <CardTitle className="text-2xl">{balanceQuery.data?.unspent ?? "-"}</CardTitle>
          </CardHeader>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
          <CardDescription>
            TVK export and details view will be implemented after DB + client wiring.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="divide-y">
            {(txsQuery.data ?? []).map((tx) => (
              <div key={tx.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <div className="text-sm font-medium">
                    {tx.direction === "incoming" ? "Received" : "Sent"}
                  </div>
                  <div className="mt-0.5 truncate text-xs text-muted-foreground">
                    {new Date(tx.timestamp * 1000).toLocaleString()} · {tx.status} · {tx.id}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-semibold">{tx.amount}</div>
                  <div className="mt-0.5 text-xs text-muted-foreground">Fee: {tx.fee}</div>
                </div>
              </div>
            ))}

            {txsQuery.data?.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No transactions yet.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
