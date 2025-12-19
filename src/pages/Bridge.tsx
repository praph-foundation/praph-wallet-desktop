import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, BridgeDepositParams } from "../lib/tauri";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function BridgePage() {
  const qc = useQueryClient();

  const [l2Address, setL2Address] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<BridgeDepositParams["proverTip"]>("medium");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isValidL2 = /^0x[a-fA-F0-9]{40}$/.test(l2Address.trim());

  const depositMutation = useMutation({
    mutationFn: (params: BridgeDepositParams) => api.bridgeDeposit(params),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Deposit submitted");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to deposit");
    },
  });

  const canSubmit = Boolean(isValidL2 && amount && !depositMutation.isPending);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Bridge</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Creates a bridge action proof and encrypts an instruction for the MPC public key.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Deposit (L1 → L2)</CardTitle>
          <CardDescription>
            Your L2 address is used only as a destination. This wallet stays focused on asset custody.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Target L2 address</Label>
              <Input
                value={l2Address}
                onChange={(e) => setL2Address(e.currentTarget.value)}
                placeholder="0x..."
              />
              {!l2Address ? null : isValidL2 ? null : (
                <div className="text-xs text-destructive">Invalid address. Expected a 0x-prefixed 20-byte hex address.</div>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input value={amount} onChange={(e) => setAmount(e.currentTarget.value)} placeholder="0" />
              </div>
              <div className="space-y-2">
                <Label>Prover tip</Label>
                <select
                  value={proverTip}
                  onChange={(e) => setProverTip(e.currentTarget.value as BridgeDepositParams["proverTip"])}
                  className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="low">Low</option>
                  <option value="medium">Medium</option>
                  <option value="high">High</option>
                </select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Memo (optional)</Label>
              <Input value={memo} onChange={(e) => setMemo(e.currentTarget.value)} placeholder="Private memo" />
            </div>

            <div className="pt-2">
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={!canSubmit}>
                    Review & Deposit
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm deposit</DialogTitle>
                    <DialogDescription>
                      Review the details before generating a bridge proof and sending it to the prover network.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Target L2 address</div>
                      <div className="break-all font-mono text-xs">{l2Address}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">Amount</div>
                      <div className="font-medium">{amount}</div>
                    </div>
                    <div className="flex items-center justify-between">
                      <div className="text-muted-foreground">Prover tip</div>
                      <div className="font-medium">{proverTip}</div>
                    </div>
                    {memo ? (
                      <div className="space-y-1">
                        <div className="text-muted-foreground">Memo</div>
                        <div className="break-words">{memo}</div>
                      </div>
                    ) : null}
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setConfirmOpen(false)} disabled={depositMutation.isPending}>
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        depositMutation.mutate({
                          l2Address: l2Address.trim(),
                          amount,
                          memo: memo || undefined,
                          proverTip,
                        });
                        setConfirmOpen(false);
                      }}
                      disabled={!canSubmit}
                    >
                      {depositMutation.isPending ? "Depositing..." : "Confirm"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {depositMutation.data ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Submitted. TxID: <span className="font-mono">{depositMutation.data.txId}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Withdraw (L2 → L1)</CardTitle>
          <CardDescription>
            Intentionally not implemented as a wallet feature. A guidance UI can be added.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
