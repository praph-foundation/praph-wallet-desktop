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

  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doUnlock() {
    try {
      setError(null);
      setLoading(true);
      await api.walletUnlock(password.trim());
      unlock();
      toast.success("Wallet unlocked");
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to unlock");
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
