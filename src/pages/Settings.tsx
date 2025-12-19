import { useState } from "react";
import { api } from "../lib/tauri";
import { useWalletStore } from "../state/walletStore";

export default function SettingsPage() {
  const helperServiceUrl = useWalletStore((s) => s.helperServiceUrl);
  const setHelperServiceUrl = useWalletStore((s) => s.setHelperServiceUrl);

  const [url, setUrl] = useState(helperServiceUrl);
  const [rescanStatus, setRescanStatus] = useState<"idle" | "running" | "done" | "error">(
    "idle",
  );

  return (
    <div className="space-y-6">
      <div>
        <div className="text-xl font-semibold">Settings</div>
        <div className="mt-1 text-sm text-zinc-600">Security and connectivity.</div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="text-sm font-semibold">Helper Service</div>
        <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-3">
          <input
            value={url}
            onChange={(e) => setUrl(e.currentTarget.value)}
            className="md:col-span-2 w-full rounded border border-zinc-200 px-3 py-2 text-sm"
            placeholder="https://helper.yourdomain.tld"
          />
          <button
            type="button"
            className="rounded bg-zinc-900 px-4 py-2 text-sm text-white"
            onClick={() => setHelperServiceUrl(url)}
          >
            Save
          </button>
        </div>
        <div className="mt-2 text-xs text-zinc-500">
          This URL will be used for rescans and note sync.
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="text-sm font-semibold">Rescan</div>
        <div className="mt-2 text-xs text-zinc-500">Use when your balance looks incorrect.</div>

        <button
          type="button"
          className="mt-3 rounded border border-zinc-200 px-4 py-2 text-sm"
          onClick={async () => {
            try {
              setRescanStatus("running");
              await api.rescan();
              setRescanStatus("done");
            } catch {
              setRescanStatus("error");
            }
          }}
        >
          Trigger Rescan
        </button>

        <div className="mt-2 text-xs text-zinc-600">Status: {rescanStatus}</div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4">
        <div className="text-sm font-semibold">Key Export</div>
        <div className="mt-2 text-xs text-zinc-500">
          Spending key must never be exposed to the frontend. Viewing keys can be shown after password confirmation.
        </div>
      </div>
    </div>
  );
}
