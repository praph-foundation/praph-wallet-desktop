import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, BridgeDepositParams } from "../lib/tauri";

export default function BridgePage() {
  const qc = useQueryClient();

  const [l2Address, setL2Address] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<BridgeDepositParams["proverTip"]>("medium");

  const depositMutation = useMutation({
    mutationFn: (params: BridgeDepositParams) => api.bridgeDeposit(params),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
    },
  });

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Bridge (L1 → L2)</div>
        <div className="mt-1 text-sm text-zinc-600">
          Creates a bridge action proof and encrypts an instruction for the MPC public key.
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="grid grid-cols-1 gap-3">
          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Target L2 Address</div>
            <input
              value={l2Address}
              onChange={(e) => setL2Address(e.currentTarget.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="0x..."
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
                onChange={(e) =>
                  setProverTip(e.currentTarget.value as BridgeDepositParams["proverTip"])
                }
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
            disabled={!l2Address || !amount || depositMutation.isPending}
            onClick={() =>
              depositMutation.mutate({
                l2Address,
                amount,
                memo: memo || undefined,
                proverTip,
              })
            }
          >
            {depositMutation.isPending ? "Depositing..." : "Deposit"}
          </button>

          {depositMutation.data ? (
            <div className="rounded border border-emerald-200 bg-emerald-50 p-3 text-sm">
              Submitted. TxID: <span className="font-mono">{depositMutation.data.txId}</span>
            </div>
          ) : null}
          {depositMutation.error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
              {(depositMutation.error as Error).message}
            </div>
          ) : null}
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 text-sm text-zinc-700">
        Withdraw (L2 → L1) is intentionally not implemented as a wallet feature. Guidance UI can be added.
      </div>
    </div>
  );
}
