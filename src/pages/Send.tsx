import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, SendParams } from "../lib/tauri";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";

export default function SendPage() {
  const qc = useQueryClient();

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<SendParams["proverTip"]>("medium");

  const sendMutation = useMutation({
    mutationFn: (params: SendParams) => api.sendTransaction(params),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction submitted");
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to send");
    },
  });

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
              <Button
                className="w-full"
                disabled={!to || !amount || sendMutation.isPending}
                onClick={() =>
                  sendMutation.mutate({
                    to,
                    amount,
                    memo: memo || undefined,
                    proverTip,
                  })
                }
              >
                {sendMutation.isPending ? "Sending..." : "Send"}
              </Button>
            </div>

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
