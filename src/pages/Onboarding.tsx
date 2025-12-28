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
import { Shield, Key, Download, CheckCircle2, ChevronRight, ChevronLeft, AlertTriangle, Copy } from "lucide-react";

type OnboardingStep = "welcome" | "create-password" | "show-mnemonic" | "import-details" | "completing";

export default function OnboardingPage() {
  const navigate = useNavigate();
  const setHasWallet = useWalletStore((s) => s.setHasWallet);
  const unlock = useWalletStore((s) => s.unlock);
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);

  const [step, setStep] = useState<OnboardingStep>("welcome");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [mnemonic, setMnemonic] = useState("");
  const [createdMnemonic, setCreatedMnemonic] = useState<string | null>(null);
  const [backedUp, setBackedUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreateWallet = async () => {
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const res = await api.walletCreate(password);
      setCreatedMnemonic(res.mnemonic);
      setStep("show-mnemonic");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Failed to generate wallet");
    } finally {
      setLoading(false);
    }
  };

  const handleImportWallet = async () => {
    try {
      setLoading(true);
      setError(null);
      await api.walletImport(mnemonic.trim(), password);

      // Discover previously used accounts
      try {
        const discovered = await api.discoverAccounts();
        if (discovered.length > 0) {
          toast.success(`Found ${discovered.length} account(s)`);
        }
      } catch (e) {
        console.error("Account discovery failed:", e);
        // Don't fail the import if discovery fails
      }

      await finishOnboarding(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      toast.error("Failed to import wallet");
    } finally {
      setLoading(false);
    }
  };

  const finishOnboarding = async (isImport: boolean) => {
    setLoading(true);
    try {
      // Small delay to show completing state
      setStep("completing");

      // Verify wallet status
      const st = await api.walletStatus();
      if (!st.hasWallet) {
        throw new Error("Wallet creation/import failed verification");
      }

      if (isImport) {
        try {
          setSyncStatus("syncing", "Rescanning...");
          await api.scanNotes({ fullRescan: true });
          setSyncStatus("idle", null);
        } catch {
          setSyncStatus("error", "Rescan failed");
        }
      }

      setHasWallet(true);
      unlock();
      toast.success(isImport ? "Wallet imported successfully" : "Wallet created successfully");
      navigate("/", { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStep(isImport ? "import-details" : "show-mnemonic");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex h-full max-w-xl items-center p-6">
      <Card className="w-full border-none bg-background/50 backdrop-blur-sm shadow-xl ring-1 ring-white/10 transition-all duration-300">
        <CardHeader className="text-center pb-2">
          <div className="flex justify-center mb-4">
            <div className="p-3 rounded-2xl bg-primary/10 ring-1 ring-primary/20">
              <Shield className="w-8 h-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-3xl font-bold tracking-tight">Praph Wallet</CardTitle>
          <CardDescription>Securely manage your private assets</CardDescription>
        </CardHeader>

        <CardContent className="pt-6">
          {step === "welcome" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="grid grid-cols-1 gap-4">
                <Button
                  variant="outline"
                  className="h-24 flex items-center justify-start gap-4 p-6 hover:bg-primary/5 hover:border-primary/50 transition-all group"
                  onClick={() => setStep("create-password")}
                >
                  <div className="p-2 rounded-lg bg-primary/10 group-hover:bg-primary/20 transition-colors">
                    <Key className="w-6 h-6 text-primary" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-lg">Create New Wallet</div>
                    <div className="text-sm text-muted-foreground">Generate a new mnemonic phrase</div>
                  </div>
                  <ChevronRight className="ml-auto w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
                </Button>

                <Button
                  variant="outline"
                  className="h-24 flex items-center justify-start gap-4 p-6 hover:bg-primary/5 hover:border-primary/50 transition-all group"
                  onClick={() => setStep("import-details")}
                >
                  <div className="p-2 rounded-lg bg-orange-500/10 group-hover:bg-orange-500/20 transition-colors">
                    <Download className="w-6 h-6 text-orange-500" />
                  </div>
                  <div className="text-left">
                    <div className="font-semibold text-lg">Import Wallet</div>
                    <div className="text-sm text-muted-foreground">Restore from mnemonic phrase</div>
                  </div>
                  <ChevronRight className="ml-auto w-5 h-5 text-muted-foreground group-hover:text-orange-500 transition-colors" />
                </Button>
              </div>
            </div>
          )}

          {step === "create-password" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <Label htmlFor="password">Set Wallet Password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Minimum 8 characters"
                  className="h-12"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirmPassword">Confirm Password</Label>
                <Input
                  id="confirmPassword"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repeat your password"
                  className="h-12"
                />
              </div>
              <div className="p-3 rounded-lg bg-muted/50 border border-border text-xs text-muted-foreground flex gap-3 italic">
                <AlertTriangle className="w-4 h-4 shrink-0 text-orange-500" />
                This password encrypts your keys locally. There is no password recovery.
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep("welcome")} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                  className="flex-[2]"
                  disabled={password.length < 4 || password !== confirmPassword || loading}
                  onClick={handleCreateWallet}
                >
                  {loading ? "Generating..." : "Generate Mnemonic"}
                </Button>
              </div>
            </div>
          )}

          {step === "show-mnemonic" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="p-4 rounded-xl border-2 border-primary/20 bg-primary/5 space-y-3">
                <div className="flex items-center justify-between w-full">
                  <div className="flex items-center gap-2 text-primary font-semibold text-sm">
                    <Shield className="w-4 h-4" />
                    Write down these 12 words
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-[10px] gap-1.5 hover:bg-primary/10"
                    onClick={() => {
                      if (createdMnemonic) {
                        navigator.clipboard.writeText(createdMnemonic);
                        toast.success("Mnemonic phrase copied to clipboard");
                      }
                    }}
                  >
                    <Copy className="w-3 h-3" />
                    Copy All
                  </Button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  {createdMnemonic?.split(" ").map((word, i) => (
                    <div key={i} className="bg-background/80 p-2 rounded border border-border flex items-center gap-2 shadow-sm">
                      <span className="text-[10px] text-muted-foreground w-4">{i + 1}</span>
                      <span className="font-mono text-sm">{word}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex gap-3 font-medium">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                Never share this phrase with anyone. Anyone with these words can take your funds.
              </div>

              <div className="flex items-start space-x-3 p-1">
                <Checkbox
                  id="backup-confirm"
                  checked={backedUp}
                  onCheckedChange={(v) => setBackedUp(Boolean(v))}
                  className="mt-1"
                />
                <label htmlFor="backup-confirm" className="text-sm leading-tight font-medium cursor-pointer">
                  I have written down the seed phrase in a safe place.
                </label>
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep("create-password")} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                  className="flex-[2]"
                  disabled={!backedUp || loading}
                  onClick={() => finishOnboarding(false)}
                >
                  {loading ? "Finalizing..." : "Complete Setup"}
                </Button>
              </div>
            </div>
          )}

          {step === "import-details" && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
              <div className="space-y-2">
                <Label htmlFor="mnemonic-input">Mnemonic Phrase</Label>
                <Textarea
                  id="mnemonic-input"
                  value={mnemonic}
                  onChange={(e) => setMnemonic(e.target.value)}
                  placeholder="Enter your 12 or 24 word phrase"
                  className="min-h-[100px] font-mono"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="import-password">Set Wallet Password</Label>
                <Input
                  id="import-password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Encrypt your imported wallet"
                />
              </div>
              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setStep("welcome")} className="flex-1">
                  <ChevronLeft className="w-4 h-4 mr-2" /> Back
                </Button>
                <Button
                  className="flex-[2]"
                  disabled={!mnemonic.trim() || password.length < 4 || loading}
                  onClick={handleImportWallet}
                >
                  {loading ? "Importing..." : "Import Wallet"}
                </Button>
              </div>
            </div>
          )}

          {step === "completing" && (
            <div className="py-12 flex flex-col items-center justify-center space-y-6 animate-in zoom-in-95">
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <div className="relative p-6 rounded-full bg-primary/10">
                  <CheckCircle2 className="w-12 h-12 text-primary" />
                </div>
              </div>
              <div className="text-center">
                <h3 className="text-xl font-bold">Setting up your wallet</h3>
                <p className="text-muted-foreground text-sm max-w-[200px] mx-auto mt-2">
                  Encrypting keys and preparing your secure workspace...
                </p>
              </div>
            </div>
          )}

          {error && (
            <div className="mt-4 p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <div className="break-all">{error}</div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
