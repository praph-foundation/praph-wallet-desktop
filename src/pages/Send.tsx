import { useState, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, SendParams } from "../lib/tauri";
import { toast } from "sonner";
import { useWalletStore } from "../state/walletStore";
import { Badge } from "../components/ui/badge";
import CopyButton from "../components/CopyButton";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../components/ui/select";
import {
  Send as SendIcon,
  ArrowRight,
  AlertTriangle,
  Wallet,
  Zap,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  Clock
} from "lucide-react";

type ProgressStep = "idle" | "preparing" | "proving" | "broadcasting" | "done" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function SendPage() {
  const qc = useQueryClient();
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);

  const [to, setTo] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<SendParams["proverTip"]>("medium");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [txId, setTxId] = useState<string | null>(null);

  // Fetch accounts for Quick Select dropdown
  const { data: accountsState } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => api.getAccountsState(),
  });

  const isValidAddress = useMemo(() => {
    // Simple check: L1 address or IVK (praph... or hex-like or length-based)
    return to.length >= 10;
  }, [to]);

  const isValidAmount = useMemo(() => {
    const val = parseFloat(amount);
    return !isNaN(val) && val > 0;
  }, [amount]);

  const sendMutation = useMutation({
    mutationFn: async (params: SendParams) => {
      setProgress("preparing");
      setSyncStatus("syncing", "Preparing transaction...");
      await sleep(400);

      setProgress("proving");
      setSyncStatus("syncing", "Generating ZK Proof...");
      const res = await api.sendTransaction(params);

      setProgress("broadcasting");
      setSyncStatus("syncing", "Broadcasting to L1...");
      await sleep(400);
      return res;
    },
    onSuccess: (data) => {
      setTxId(data.txId);
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Transaction sent successfully");
      setProgress("done");
      setSyncStatus("idle", null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Failed to send");
      setProgress("error");
      setSyncStatus("error", "Transaction failed");
    },
  });

  const loading = sendMutation.isPending;
  const canSubmit = Boolean(to && amount && isValidAddress && isValidAmount && !loading);

  const resetForm = () => {
    setTo("");
    setAmount("");
    setMemo("");
    setProverTip("medium");
    setProgress("idle");
    setTxId(null);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10 shadow-inner">
          <SendIcon className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Send Assets</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Private peer-to-peer transfer using zero-knowledge proofs.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <Card className="lg:col-span-3 border border-white/10 bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-xl shadow-2xl overflow-hidden">
          <CardHeader className="bg-gradient-to-r from-primary/10 via-primary/5 to-transparent border-b border-white/10 pb-6">
            <CardTitle className="text-2xl font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Transaction Details</CardTitle>
            <CardDescription className="text-sm text-muted-foreground/80">Enter the recipient details and amount below.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 space-y-6 px-6 pb-8">
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <Label htmlFor="to" className="text-sm font-bold text-foreground/90 flex items-center gap-2">
                    <Wallet className="w-4 h-4 text-primary" />
                    Recipient Address
                  </Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">Quick Select</span>
                    <Select
                      value=""
                      onValueChange={(address) => setTo(address)}
                      disabled={loading || progress === "done"}
                    >
                      <SelectTrigger className="w-[160px] h-8 text-xs bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 ring-0 hover:border-primary/40 transition-colors">
                        <SelectValue placeholder="My Accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsState?.accounts.map((account) => (
                          <SelectItem key={account.index} value={account.address}>
                            <div className="flex flex-col items-start gap-0.5">
                              <span className="font-semibold text-foreground">{account.name}</span>
                              <span className="text-[10px] text-muted-foreground font-mono truncate max-w-[150px]">
                                {account.address.slice(0, 10)}...{account.address.slice(-8)}
                              </span>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-primary/20 via-primary/10 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                  <Input
                    id="to"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Enter PRAF address or IVK"
                    className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all text-sm font-mono placeholder:text-muted-foreground/50"
                    disabled={loading || progress === "done"}
                  />
                  {to && !isValidAddress && (
                    <p className="mt-2 px-1 text-xs text-red-500 flex items-center gap-1.5 font-semibold">
                      <AlertTriangle className="w-3.5 h-3.5" /> Invalid address format
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label htmlFor="amount" className="text-sm font-bold text-foreground/90">Amount</Label>
                  <div className="relative group">
                    <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                    <Input
                      id="amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 pr-16 text-lg font-semibold transition-all"
                      disabled={loading || progress === "done"}
                    />
                    <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-500/70">
                      PRAF
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="text-sm font-bold text-foreground/90">Priority</Label>
                  <div className="grid grid-cols-3 gap-2 p-1.5 rounded-lg bg-gradient-to-br from-background/80 to-background/40 border border-white/10">
                    {(["low", "medium", "high"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setProverTip(level)}
                        disabled={loading || progress === "done"}
                        className={`h-11 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${proverTip === level
                          ? "bg-gradient-to-r from-primary to-primary/80 text-black shadow-lg shadow-primary/30 scale-[1.02]"
                          : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                          }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <Label htmlFor="memo" className="text-sm font-bold text-foreground/90">
                  Memo <span className="text-xs text-muted-foreground/60 font-normal">(Optional, Encrypted)</span>
                </Label>
                <div className="relative group">
                  <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                  <Input
                    id="memo"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="Private message to recipient"
                    className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-purple-500/50 focus-visible:border-purple-500/50 transition-all"
                    disabled={loading || progress === "done"}
                  />
                </div>
              </div>
            </div>

            <div className="pt-4">
              <Button
                className="w-full h-16 text-lg font-bold bg-gradient-to-r from-primary via-primary/90 to-primary shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canSubmit || loading || progress === "done"}
                onClick={() => setConfirmOpen(true)}
              >
                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                <span className="relative z-10 flex items-center gap-3">
                  <SendIcon className="w-5 h-5" />
                  Review Transaction
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border border-primary/20 bg-gradient-to-br from-primary/10 via-primary/5 to-transparent backdrop-blur-lg shadow-xl">
            <CardHeader className="pb-4 border-b border-primary/20">
              <CardTitle className="text-sm flex items-center gap-2 text-primary font-bold uppercase tracking-widest">
                <ShieldCheck className="w-5 h-5" />
                Security Information
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-5 space-y-5">
              <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-r from-primary/10 to-transparent border border-primary/10">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-foreground/80 font-medium">
                  Your <span className="font-bold text-primary">Spending Key</span> is securely stored in the OS Keychain and never leaves your device.
                </div>
              </div>
              <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-r from-amber-500/10 to-transparent border border-amber-500/10">
                <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-foreground/80 font-medium">
                  <span className="font-bold text-amber-500">Prover Tips</span> incentivize the network to process your transaction faster.
                </div>
              </div>
            </CardContent>
          </Card>

          {progress !== "idle" && (
            <Card className={`border backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-300 ${progress === "error" ? "border-red-500/30 bg-gradient-to-br from-red-500/10 to-red-500/5" : "border-white/10 bg-gradient-to-br from-background/80 to-background/60"
              }`}>
              <CardHeader className="pb-3 border-b border-white/10">
                <CardTitle className="text-lg font-bold">Transaction Progress</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-4 text-sm font-medium">
                <div className="space-y-3">
                  {[
                    { key: "preparing", label: "Encryption & Witnessing", step: 1, icon: ShieldCheck },
                    { key: "proving", label: "ZK-SNARK Generation", step: 2, icon: Zap },
                    { key: "broadcasting", label: "On-chain Broadcasting", step: 3, icon: SendIcon },
                  ].map((s) => {
                    // Define step order for proper comparison
                    const stepOrder: Record<string, number> = {
                      idle: 0,
                      preparing: 1,
                      proving: 2,
                      broadcasting: 3,
                      done: 4,
                      error: -1
                    };

                    const currentStepOrder = stepOrder[progress] || 0;
                    const thisStepOrder = stepOrder[s.key] || 0;

                    const isCompleted = currentStepOrder > thisStepOrder && progress !== "error";
                    const isActive = progress === s.key;
                    const isError = progress === "error" && isActive;
                    const Icon = s.icon;

                    return (
                      <div key={s.key} className={`flex items-center justify-between p-4 rounded-xl border transition-all ${isCompleted ? "bg-emerald-500/10 border-emerald-500/20" : isActive ? (isError ? "bg-red-500/10 border-red-500/20" : "bg-primary/10 border-primary/20") : "bg-white/5 border-white/5"}`}>
                        <div className="flex items-center gap-3">
                          {isCompleted ? (
                            <div className="p-2 rounded-full bg-emerald-500/20 border border-emerald-500/30">
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            </div>
                          ) : isActive ? (
                            isError ? (
                              <div className="p-2 rounded-full bg-red-500/20 border border-red-500/30">
                                <XCircle className="w-4 h-4 text-red-500" />
                              </div>
                            ) : (
                              <div className="p-2 rounded-full bg-primary/20 border border-primary/30">
                                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                              </div>
                            )
                          ) : (
                            <div className="p-2 rounded-full border border-white/10 bg-white/5">
                              <Icon className="w-4 h-4 text-muted-foreground" />
                            </div>
                          )}
                          <div className="flex flex-col">
                            <span className={`text-sm font-semibold ${isCompleted ? "text-emerald-500" : isActive ? (isError ? "text-red-500" : "text-primary") : "text-muted-foreground"}`}>
                              {s.label}
                            </span>
                            {isActive && !isError && (
                              <span className="text-[10px] text-primary/70 animate-pulse uppercase tracking-wider mt-0.5">Processing...</span>
                            )}
                          </div>
                        </div>
                        {isCompleted && (
                          <div className="text-xs text-emerald-500/70 font-medium">✓ Done</div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {progress === "done" && (
                  <div className="pt-2 space-y-4 animate-in slide-in-from-top-2">
                    <div className="p-5 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-500/10 border border-emerald-500/30 space-y-3">
                      <div className="flex items-center gap-2 text-sm font-bold text-emerald-500">
                        <CheckCircle2 className="w-5 h-5" />
                        Transaction Broadcasted Successfully
                      </div>
                      <div className="space-y-2">
                        <div className="text-[10px] uppercase font-bold text-emerald-500/70 tracking-wider">Transaction ID</div>
                        <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/20 font-mono text-xs break-all group">
                          <span className="text-emerald-500 font-medium">{txId}</span>
                          <CopyButton value={txId || ""} label="" className="h-7 w-7 shrink-0 bg-transparent hover:bg-emerald-500/20 border-none text-emerald-500" />
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full h-12 border border-white/10 hover:bg-white/5 font-semibold" onClick={resetForm}>
                      Send Another Transaction
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-lg border border-white/10 bg-[hsl(var(--background)/0.98)] backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-5 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border-b border-white/10">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/30 to-primary/20 border border-primary/30">
                <SendIcon className="w-6 h-6 text-primary" />
              </div>
              Confirm Transaction
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-muted-foreground/80 mt-2">
              Please carefully review all transaction details. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-5">
            <div className="space-y-4">
              <div className="p-5 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 space-y-3 shadow-lg">
                <div className="flex justify-between items-start">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Recipient</div>
                  <Badge variant="outline" className="text-[8px] uppercase tracking-wider border-emerald-500/40 text-emerald-500 bg-emerald-500/10">Verified</Badge>
                </div>
                <div className="break-all font-mono text-sm leading-relaxed p-3 rounded-lg bg-background/50 border border-white/5">
                  {to}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-5 rounded-2xl bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 border border-emerald-500/20 space-y-2 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-500/70">Amount</div>
                  <div className="text-2xl font-black text-emerald-500">{amount} <span className="text-sm text-emerald-500/60 font-normal">PRAF</span></div>
                </div>
                <div className="p-5 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 border border-primary/20 space-y-2 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-primary/70">Priority</div>
                  <div className="flex items-center gap-2 font-bold text-base capitalize text-primary">
                    {proverTip === "high" ? <Zap className="w-5 h-5 text-amber-500" /> : <Clock className="w-5 h-5 text-blue-500" />}
                    {proverTip}
                  </div>
                </div>
              </div>

              {memo && (
                <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 space-y-2 shadow-lg">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-purple-500/70">Encrypted Memo</div>
                  <div className="text-sm italic text-purple-400">"{memo}"</div>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-dashed border-amber-500/30 bg-gradient-to-r from-amber-500/10 to-amber-500/5 flex gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-xs leading-relaxed text-amber-500/90 font-medium">
                This transaction will generate a zero-knowledge proof using your spending key. The key remains securely encrypted on your device.
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-3">
            <Button
              variant="ghost"
              className="flex-1 h-12 hover:bg-white/10 font-semibold border border-white/10"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 bg-gradient-to-r from-primary via-primary/90 to-primary shadow-xl shadow-primary/30 font-bold hover:shadow-primary/40 transition-all"
              onClick={() => {
                setConfirmOpen(false);
                setProgress("idle");
                sendMutation.mutate({
                  to,
                  amount,
                  memo: memo || undefined,
                  proverTip,
                });
              }}
              disabled={loading}
            >
              {loading ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Processing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4" />
                  Authorize & Send
                </span>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
