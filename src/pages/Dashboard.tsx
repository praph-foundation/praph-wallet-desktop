import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MintDevFaucetParams } from "../lib/tauri";
import { toast } from "sonner";
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import CopyButton from "../components/CopyButton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function DashboardPage() {
  const qc = useQueryClient();
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [tvkOpen, setTvkOpen] = useState(false);
  const [tvkPassword, setTvkPassword] = useState("");
  const [tvkRunning, setTvkRunning] = useState(false);
  const [tvk, setTvk] = useState<string | null>(null);

  const [mintOpen, setMintOpen] = useState(false);
  const [mintAmount, setMintAmount] = useState("");
  const [mintMemo, setMintMemo] = useState("");
  const [mintTip, setMintTip] = useState<MintDevFaucetParams["proverTip"]>("low");

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

  const mintMutation = useMutation({
    mutationFn: (p: MintDevFaucetParams) => api.mintDevFaucet(p),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Mint submitted");
      setMintOpen(false);
      setMintAmount("");
      setMintMemo("");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Mint failed");
    },
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
          <CardTitle>Dev Faucet</CardTitle>
          <CardDescription>Mint test funds on local dev testnet.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={mintOpen} onOpenChange={setMintOpen}>
            <Button onClick={() => setMintOpen(true)} disabled={mintMutation.isPending}>
              Mint
            </Button>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Mint via Dev Faucet</DialogTitle>
                <DialogDescription>
                  This requires prover-aggregator started with dev faucet enabled.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mintAmount">Amount (PRAF)</Label>
                  <Input
                    id="mintAmount"
                    value={mintAmount}
                    onChange={(e) => setMintAmount(e.target.value)}
                    placeholder="e.g. 10.0000"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mintMemo">Memo</Label>
                  <Input
                    id="mintMemo"
                    value={mintMemo}
                    onChange={(e) => setMintMemo(e.target.value)}
                    placeholder="optional"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="mintTip">Prover tip</Label>
                  <Input
                    id="mintTip"
                    value={mintTip}
                    onChange={(e) =>
                      setMintTip(e.target.value as MintDevFaucetParams["proverTip"])
                    }
                    placeholder="low | medium | high"
                  />
                </div>
              </div>

              <DialogFooter>
                <Button
                  onClick={() =>
                    mintMutation.mutate({
                      amount: mintAmount,
                      memo: mintMemo || undefined,
                      proverTip: mintTip,
                    })
                  }
                  disabled={!mintAmount || mintMutation.isPending}
                >
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

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

      <Dialog
        open={selectedTxId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTxId(null);
            setTvkOpen(false);
            setTvkPassword("");
            setTvkRunning(false);
            setTvk(null);
          }
        }}
      >
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
                <div className="flex items-start justify-between gap-3">
                  <div className="break-all font-mono text-xs">{selectedTx.id}</div>
                  <CopyButton
                    value={selectedTx.id}
                    label="Copy"
                    successMessage="Copied TxID"
                    className="shrink-0"
                  />
                </div>
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

              <div className="pt-2">
                <Button variant="outline" onClick={() => setTvkOpen(true)}>
                  Export TVK
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No transaction selected.</div>
          )}

          <Dialog
            open={tvkOpen}
            onOpenChange={(open) => {
              setTvkOpen(open);
              if (!open) {
                setTvkPassword("");
                setTvkRunning(false);
                setTvk(null);
              }
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Export TVK</DialogTitle>
                <DialogDescription>Enter your wallet password to export a transaction view key.</DialogDescription>
              </DialogHeader>

              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={tvkPassword}
                    onChange={(e) => setTvkPassword(e.currentTarget.value)}
                    placeholder="Your password"
                  />
                </div>

                {tvk ? (
                  <div className="space-y-1">
                    <div className="text-xs text-muted-foreground">TVK</div>
                    <div className="flex items-start justify-between gap-3">
                      <div className="break-all font-mono text-xs">{tvk}</div>
                      <CopyButton value={tvk} label="Copy" successMessage="Copied TVK" className="shrink-0" />
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setTvkOpen(false)} disabled={tvkRunning}>
                  Close
                </Button>
                <Button
                  onClick={async () => {
                    if (!selectedTx) return;
                    try {
                      setTvkRunning(true);
                      const res = await api.exportTvk(selectedTx.id, tvkPassword);
                      setTvk(res.tvk);
                      toast.success("TVK exported");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to export TVK");
                    } finally {
                      setTvkRunning(false);
                    }
                  }}
                  disabled={tvkRunning || tvkPassword.trim().length === 0 || !selectedTx}
                >
                  {tvkRunning ? "Exporting..." : "Export"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div>
  );
}
