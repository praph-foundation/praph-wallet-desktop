import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";

export default function DashboardPage() {
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

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

  const selectedTx = (txsQuery.data ?? []).find((t) => t.id === selectedTxId) ?? null;

  function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" {
    if (status === "confirmed") return "default";
    if (status === "pending") return "secondary";
    return "destructive";
  }

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
              <button
                key={tx.id}
                type="button"
                className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-muted/30"
                onClick={() => setSelectedTxId(tx.id)}
              >
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
                  <div className="mt-1 flex items-center justify-end gap-2">
                    <Badge variant={statusBadgeVariant(tx.status)}>{tx.status}</Badge>
                  </div>
                </div>
              </button>
            ))}

            {txsQuery.data?.length === 0 ? (
              <div className="p-4 text-sm text-muted-foreground">No transactions yet.</div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Dialog open={selectedTxId !== null} onOpenChange={(open) => setSelectedTxId(open ? selectedTxId : null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Transaction details</DialogTitle>
            <DialogDescription>Detailed view and TVK export will be added.</DialogDescription>
          </DialogHeader>

          {selectedTx ? (
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">Status</div>
                <Badge variant={statusBadgeVariant(selectedTx.status)}>{selectedTx.status}</Badge>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">Direction</div>
                <div>{selectedTx.direction}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">Amount</div>
                <div className="font-medium">{selectedTx.amount}</div>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-muted-foreground">Fee</div>
                <div>{selectedTx.fee}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">TxID</div>
                <div className="break-all font-mono text-xs">{selectedTx.id}</div>
              </div>
              <div className="space-y-1">
                <div className="text-muted-foreground">Timestamp</div>
                <div>{new Date(selectedTx.timestamp * 1000).toLocaleString()}</div>
              </div>
              {selectedTx.memo ? (
                <div className="space-y-1">
                  <div className="text-muted-foreground">Memo</div>
                  <div className="break-words">{selectedTx.memo}</div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No transaction selected.</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
