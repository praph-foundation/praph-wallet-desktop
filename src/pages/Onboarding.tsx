import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { api } from "../lib/tauri";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import { Checkbox } from "../components/ui/checkbox";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Textarea } from "../components/ui/textarea";
import { useWalletStore } from "../state/walletStore";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const setHasWallet = useWalletStore((s) => s.setHasWallet);
  const unlock = useWalletStore((s) => s.unlock);

  const [mode, setMode] = useState<"create" | "import">("create");
  const [password, setPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit =
    !loading &&
    Boolean(password) &&
    (mode === "create" ? (createdMnemonic ? backedUp : true) : Boolean(mnemonic.trim()));

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Praph Wallet</CardTitle>
          <CardDescription>Security-first wallet for PRAPH ZK-UTXO assets.</CardDescription>
        </CardHeader>

        <CardContent>
          <div className="flex gap-2">
            <Button
              type="button"
              variant={mode === "create" ? "default" : "outline"}
              onClick={() => {
                setMode("create");
                setCreatedMnemonic(null);
                setBackedUp(false);
                setError(null);
              }}
            >
              Create
            </Button>
            <Button
              type="button"
              variant={mode === "import" ? "default" : "outline"}
              onClick={() => {
                setMode("import");
                setCreatedMnemonic(null);
                setBackedUp(false);
                setError(null);
              }}
            >
              Import
            </Button>
          </div>

          <div className="mt-6 space-y-4">
            <div className="space-y-2">
              <Label>Password</Label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
                placeholder={mode === "create" ? "Set a strong password" : "Your wallet password"}
              />
              <div className="text-xs text-muted-foreground">
                Password encrypts the seed stored in your OS keychain.
              </div>
            </div>

            {mode === "import" ? (
              <div className="space-y-2">
                <Label>Mnemonic</Label>
                <Textarea
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.currentTarget.value)}
                  rows={3}
                  placeholder="Enter your BIP-39 mnemonic"
                />
                <div className="text-xs text-muted-foreground">
                  Never paste your mnemonic into untrusted apps. Use this only on your own machine.
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-3 text-sm">
                Create will generate a new BIP-39 mnemonic. You must back it up offline.
              </div>
            )}

            {createdMnemonic ? (
              <div className="space-y-2 rounded-md border border-border bg-muted/30 p-3">
                <div className="text-xs font-medium text-muted-foreground">Your mnemonic</div>
                <div className="whitespace-pre-wrap font-mono text-sm">{createdMnemonic}</div>
                <div className="text-xs text-muted-foreground">
                  Write this down and keep it offline. It will not be shown again.
                </div>
                <div className="flex items-start gap-2 pt-2">
                  <Checkbox
                    id="backup-confirm"
                    checked={backedUp}
                    onCheckedChange={(v) => setBackedUp(Boolean(v))}
                  />
                  <label htmlFor="backup-confirm" className="text-sm leading-5">
                    I have backed up my mnemonic securely.
                  </label>
                </div>
              </div>
            ) : null}

            {error ? (
              <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3 text-sm">
                {error}
              </div>
            ) : null}

            <Button
              className="w-full"
              disabled={!canSubmit}
              onClick={async () => {
                try {
                  setError(null);
                  setLoading(true);

                  if (mode === "create") {
                    if (!createdMnemonic) {
                      const res = await api.walletCreate(password);
                      setCreatedMnemonic(res.mnemonic);
                      setBackedUp(false);
                      toast.success("Wallet created");
                      return;
                    }
                    setHasWallet(true);
                    unlock();
                    navigate("/", { replace: true });
                    return;
                  }

                  await api.walletImport(mnemonic.trim(), password);
                  toast.success("Wallet imported");
                  setHasWallet(true);
                  unlock();
                  navigate("/", { replace: true });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Unknown error");
                } finally {
                  setLoading(false);
                }
              }}
            >
              {loading
                ? "Working..."
                : mode === "create"
                  ? createdMnemonic
                    ? "I've backed it up"
                    : "Create wallet"
                  : "Import wallet"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
