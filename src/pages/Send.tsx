import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, SendParams } from "../lib/tauri";
import { toast } from "sonner";
import { useWalletStore } from "../state/walletStore";
import { Badge } from "../components/ui/badge";
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

type ProgressStep = "idle" | "preparing" | "proving" | "broadcasting" | "done" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function SendPage() {
  const qc = useQueryClient();
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<SendParams["proverTip"]>("medium");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");

  const sendMutation = useMutation({
    mutationFn: async (params: SendParams) => {
      setProgress("preparing");
      setSyncStatus("syncing", "Preparing...");
      await sleep(150);

      setProgress("proving");
      setSyncStatus("syncing", "Generating proof...");
      const res = await api.sendTransaction(params);

      setProgress("broadcasting");
      setSyncStatus("syncing", "Broadcasting...");
      await sleep(150);
      return res;
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction submitted");
      setProgress("done");
      setSyncStatus("idle", null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to send");
      setProgress("error");
      setSyncStatus("error", "Send failed");
    },
    onSettled: () => {
      window.setTimeout(() => {
        setProgress((p) => (p === "broadcasting" || p === "proving" || p === "preparing" ? "idle" : p));
      }, 0);
    },
  });

  const canSubmit = Boolean(to && amount && !sendMutation.isPending);

  const progressLabel: Record<Exclude<ProgressStep, "idle">, string> = {
    preparing: "Preparing",
    proving: "Generating proof",
    broadcasting: "Broadcasting",
    done: "Submitted",
    error: "Failed",
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Send</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Generates a ZK proof in the backend and broadcasts via prover network.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Transfer</CardTitle>
          <CardDescription>Private send on PRAPH L1.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4">
            <div className="space-y-2">
              <Label>Recipient</Label>
              <Input
                value={to}
                onChange={(e) => setTo(e.currentTarget.value)}
                placeholder="Public Address or IVK"
              />
            </div>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>Amount</Label>
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.currentTarget.value)}
                  placeholder="0"
                />
              </div>

              <div className="space-y-2">
                <Label>Prover Tip</Label>
                <select
                  value={proverTip}
                  onChange={(e) => setProverTip(e.currentTarget.value as SendParams["proverTip"])}
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
              <Input
                value={memo}
                onChange={(e) => setMemo(e.currentTarget.value)}
                placeholder="Private memo"
              />
            </div>

            <div className="pt-2">
              <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogTrigger asChild>
                  <Button className="w-full" disabled={!canSubmit}>
                    Review & Send
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Confirm transaction</DialogTitle>
                    <DialogDescription>
                      Review the details before generating a proof and broadcasting.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3 text-sm">
                    <div className="space-y-1">
                      <div className="text-muted-foreground">Recipient</div>
                      <div className="break-all font-mono text-xs">{to}</div>
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
                    <div className="text-xs text-muted-foreground">
                      The spending key never leaves the backend.
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setConfirmOpen(false)}
                      disabled={sendMutation.isPending}
                    >
                      Cancel
                    </Button>
                    <Button
                      onClick={() => {
                        setProgress("idle");
                        sendMutation.mutate({
                          to,
                          amount,
                          memo: memo || undefined,
                          proverTip,
                        });
                        setConfirmOpen(false);
                      }}
                      disabled={!canSubmit}
                    >
                      {sendMutation.isPending ? "Sending..." : "Confirm"}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {progress !== "idle" ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                <div className="flex items-center justify-between">
                  <div className="text-muted-foreground">Progress</div>
                  <Badge
                    variant={
                      progress === "error" ? "destructive" : progress === "done" ? "default" : "secondary"
                    }
                  >
                    {progressLabel[progress]}
                  </Badge>
                </div>
                <div className="mt-2 grid grid-cols-3 gap-2 text-xs">
                  <div className={progress === "preparing" ? "font-medium" : "text-muted-foreground"}>
                    Preparing
                  </div>
                  <div className={progress === "proving" ? "font-medium" : "text-muted-foreground"}>
                    Proving
                  </div>
                  <div className={progress === "broadcasting" ? "font-medium" : "text-muted-foreground"}>
                    Broadcasting
                  </div>
                </div>
              </div>
            ) : null}

            {sendMutation.data ? (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Submitted. TxID: <span className="font-mono">{sendMutation.data.txId}</span>
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
