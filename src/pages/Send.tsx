import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, SendParams } from "../lib/tauri";

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
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Send</div>
        <div className="mt-1 text-sm text-zinc-600">
          Generates a ZK proof in the backend and broadcasts via prover network.
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Recipient</div>
            <input
              value={to}
              onChange={(e) => setTo(e.currentTarget.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Public Address or IVK"
            />
          </label>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <label className="block">
              <div className="text-xs font-medium text-zinc-700">Amount</div>
              <input
                value={amount}
                onChange={(e) => setAmount(e.currentTarget.value)}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                placeholder="0"
              />
            </label>

            <label className="block">
              <div className="text-xs font-medium text-zinc-700">Prover Tip</div>
              <select
                value={proverTip}
                onChange={(e) => setProverTip(e.currentTarget.value as SendParams["proverTip"])}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
              </select>
            </label>
          </div>

          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Memo (optional)</div>
            <input
              value={memo}
              onChange={(e) => setMemo(e.currentTarget.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Private memo"
            />
          </label>

          <button
            type="button"
            className="mt-2 rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
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
          </button>

          {sendMutation.data ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
              Submitted. TxID: <span className="font-mono">{sendMutation.data.txId}</span>
            </div>
          ) : null}
          {sendMutation.error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
              {(sendMutation.error as Error).message}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
