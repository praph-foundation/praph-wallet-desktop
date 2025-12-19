import { useState } from "react";
import { useWalletStore } from "../state/walletStore";

export default function OnboardingPage() {
  const setHasWallet = useWalletStore((s) => s.setHasWallet);
  const unlock = useWalletStore((s) => s.unlock);

  const [mode, setMode] = useState<"create" | "import">("create");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <div className="w-full rounded-lg border border-zinc-200 bg-white p-6">
        <div className="text-lg font-semibold">Praph Wallet</div>
        <div className="mt-1 text-sm text-zinc-600">
          Security-first wallet for PRAPH ZK-UTXO assets.
        </div>

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            className={
              mode === "create"
                ? "rounded bg-zinc-900 px-3 py-1.5 text-sm text-white"
                : "rounded border border-zinc-200 px-3 py-1.5 text-sm"
            }
            onClick={() => setMode("create")}
          >
            Create
          </button>
          <button
            type="button"
            className={
              mode === "import"
                ? "rounded bg-zinc-900 px-3 py-1.5 text-sm text-white"
                : "rounded border border-zinc-200 px-3 py-1.5 text-sm"
            }
            onClick={() => setMode("import")}
          >
            Import
          </button>
        </div>

        <div className="mt-6 space-y-3">
          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Set a strong password"
            />
          </label>

          {mode === "import" ? (
            <label className="block">
              <div className="text-xs font-medium text-zinc-700">Mnemonic</div>
              <textarea
                value={mnemonic}
                onChange={(e) => setMnemonic(e.currentTarget.value)}
                className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
                rows={3}
                placeholder="Enter your BIP-39 mnemonic"
              />
            </label>
          ) : (
            <div className="rounded border border-zinc-200 bg-zinc-50 p-3 text-sm text-zinc-700">
              Wallet creation flow will generate a BIP-39 mnemonic and guide you to back it up.
            </div>
          )}

          <button
            type="button"
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!password || (mode === "import" && !mnemonic.trim())}
            onClick={() => {
              setHasWallet(true);
              unlock();
            }}
          >
            Continue
          </button>

          <div className="text-xs text-zinc-500">
            This is a UI skeleton. Backend key management and rescan will be wired next.
          </div>
        </div>
      </div>
    </div>
  );
}
