import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/tauri";
import { useWalletStore } from "../state/walletStore";

export default function UnlockPage() {
  const navigate = useNavigate();
  const unlock = useWalletStore((s) => s.unlock);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <div className="w-full rounded-lg border border-zinc-200 bg-white p-6">
        <div className="text-lg font-semibold">Unlock wallet</div>
        <div className="mt-1 text-sm text-zinc-600">
          Enter your password to unlock Praph Wallet.
        </div>

        <div className="mt-6 space-y-3">
          <label className="block">
            <div className="text-xs font-medium text-zinc-700">Password</div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              className="mt-1 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
              placeholder="Your wallet password"
            />
          </label>

          {error ? (
            <div className="rounded border border-red-200 bg-red-50 p-3 text-sm">
              {error}
            </div>
          ) : null}

          <button
            type="button"
            className="w-full rounded bg-zinc-900 px-4 py-2 text-sm text-white disabled:opacity-50"
            disabled={!password || loading}
            onClick={async () => {
              try {
                setError(null);
                setLoading(true);
                await api.walletUnlock(password);
                unlock();
                navigate("/", { replace: true });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to unlock");
              } finally {
                setLoading(false);
              }
            }}
          >
            {loading ? "Unlocking..." : "Unlock"}
          </button>
        </div>
      </div>
    </div>
  );
}
