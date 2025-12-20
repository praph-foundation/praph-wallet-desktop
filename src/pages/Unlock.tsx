import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/tauri";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { useWalletStore } from "../state/walletStore";

export default function UnlockPage() {
  const navigate = useNavigate();
  const unlock = useWalletStore((s) => s.unlock);
  const setHasWallet = useWalletStore((s) => s.setHasWallet);

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doUnlock() {
    try {
      setError(null);
      setLoading(true);
      await api.walletUnlock({ password: password.trim() });
      unlock();
      toast.success("Wallet unlocked");
      navigate("/", { replace: true });
    } catch (e) {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : e && typeof e === "object" && "message" in (e as any)
              ? String((e as any).message)
              : JSON.stringify(e);

      if (msg.includes("Wallet seed not found in secure storage")) {
        try {
          const probe = await api.debugProbeSeedEntriesVerbose();
          console.warn("Keychain seed probe (verbose):", probe);
          const found = probe.found ?? [];
          const errors = probe.errors ?? [];
          if (errors.length > 0) {
            toast.error(
              `Wallet seed probe hit keychain errors (likely permission/ACL). First error: ${errors[0]}`
            );
          } else {
            toast.error(
              found.length > 0
                ? `Wallet seed not found. Found keychain entries: ${found.join(", ")}`
                : "Wallet seed not found. No matching keychain entries detected (probe empty)."
            );
          }

          try {
            const dbg = await api.debugWalletSeedStorageStatus();
            console.warn("Wallet seed storage status:", dbg);
          } catch {
            // ignore
          }
        } catch (probeErr) {
          console.warn("Keychain seed probe failed:", probeErr);
        }
      }
      // If the seed is missing from secure storage, the user must re-onboard/import.
      if (
        msg.includes("No matching entry found in secure storage") ||
        msg.includes("Wallet seed not found in secure storage")
      ) {
        setHasWallet(false);
        toast.error("Wallet seed not found in secure storage. Please create/import again.");
        navigate("/onboarding", { replace: true });
        setError(msg || "Unlock failed");
      } else {
        setError(msg || "Unlock failed");
        toast.error(msg || "Unlock failed");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Unlock</CardTitle>
          <CardDescription>Enter your password to unlock Praph Wallet.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder="Your wallet password"
                onKeyDown={(e) => {
                  if (e.key === "Enter" && password && !loading) {
                    void doUnlock();
                  }
                }}
              />
            </div>

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                {error}
              </div>
            ) : null}

            <Button
              className="w-full"
              disabled={!password || loading}
              onClick={doUnlock}
            >
              {loading ? "Unlocking..." : "Unlock"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
