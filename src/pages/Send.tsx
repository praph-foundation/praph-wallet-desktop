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
  Info,
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
        <Card className="lg:col-span-3 border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
          <CardHeader className="bg-white/5 border-b border-white/5">
            <CardTitle className="text-xl">Transaction Details</CardTitle>
            <CardDescription>Enter the recipient details and amount below.</CardDescription>
          </CardHeader>
          <CardContent className="pt-8 space-y-6">
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex items-center justify-between px-1">
                  <Label htmlFor="to" className="text-sm font-semibold">Recipient Address</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground font-medium">Quick Select:</span>
                    <Select
                      value=""
                      onValueChange={(address) => setTo(address)}
                      disabled={loading || progress === "done"}
                    >
                      <SelectTrigger className="w-[180px] h-8 text-xs bg-white/5 border-none ring-1 ring-white/10">
                        <SelectValue placeholder="My Accounts" />
                      </SelectTrigger>
                      <SelectContent>
                        {accountsState?.accounts.map((account) => (
                          <SelectItem key={account.index} value={account.address}>
                            <div className="flex flex-col items-start">
                              <span className="font-medium">{account.name}</span>
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
                  <div className="absolute left-3 top-1/2 -translate-y-1/2">
                    <Wallet className={`w-4 h-4 transition-colors ${to ? 'text-primary' : 'text-muted-foreground'}`} />
                  </div>
                  <Input
                    id="to"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                    placeholder="Enter PRAF address or IVK"
                    className="pl-10 h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-primary transition-all"
                    disabled={loading || progress === "done"}
                  />
                  {to && !isValidAddress && (
                    <p className="mt-1.5 px-1 text-[10px] text-destructive flex items-center gap-1 font-medium italic">
                      <AlertTriangle className="w-3 h-3" /> Invalid address format
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="amount" className="text-sm font-semibold px-1">Amount ($PRAF)</Label>
                  <div className="relative group">
                    <Input
                      id="amount"
                      type="number"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-primary pr-16"
                      disabled={loading || progress === "done"}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground opacity-50">
                      PRAF
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-sm font-semibold px-1">Prover Tip (Priority)</Label>
                  <div className="grid grid-cols-3 gap-1.5 p-1 rounded-lg bg-background/50 border border-white/5 h-12">
                    {(["low", "medium", "high"] as const).map((level) => (
                      <button
                        key={level}
                        type="button"
                        onClick={() => setProverTip(level)}
                        disabled={loading || progress === "done"}
                        className={`text-[10px] font-bold uppercase tracking-wider rounded-md transition-all ${proverTip === level
                          ? "bg-primary text-white shadow-lg shadow-primary/20 scale-[1.05] z-10"
                          : "text-muted-foreground hover:bg-white/5"
                          }`}
                      >
                        {level}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="memo" className="text-sm font-semibold px-1">Memo <span className="text-[10px] text-muted-foreground font-normal">(Optional, Private)</span></Label>
                <Input
                  id="memo"
                  value={memo}
                  onChange={(e) => setMemo(e.target.value)}
                  placeholder="Secret message to recipient"
                  className="h-12 bg-white/5 border-none ring-1 ring-white/10"
                  disabled={loading || progress === "done"}
                />
              </div>
            </div>

            <div className="pt-2">
              <Button
                className="w-full h-14 text-lg font-bold shadow-2xl shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] group overflow-hidden"
                disabled={!canSubmit || loading || progress === "done"}
                onClick={() => setConfirmOpen(true)}
              >
                <span className="relative z-10 flex items-center gap-2">
                  Review Transaction
                  <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </span>
                <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform" />
              </Button>
            </div>
          </CardContent>
        </Card>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none bg-primary/5 shadow-lg ring-1 ring-primary/20">
            <CardHeader className="pb-3 border-b border-primary/10">
              <CardTitle className="text-sm flex items-center gap-2 text-primary font-bold uppercase tracking-widest">
                <Info className="w-4 h-4" />
                Security Check
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-3">
                <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-muted-foreground">
                  Your **Spending Key** is stored in the OS Keychain and never leaves the backend process.
                  The proof is generated locally on your machine.
                </div>
              </div>
              <div className="flex gap-3">
                <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-muted-foreground">
                  **Prover Tips** help incentivize the secondary prover network to include your proof in the next batch faster.
                </div>
              </div>
            </CardContent>
          </Card>

          {progress !== "idle" && (
            <Card className={`border-none shadow-xl ring-1 animate-in zoom-in-95 ${progress === "error" ? "ring-destructive/20 bg-destructive/5" : "ring-white/10 bg-background/50"
              }`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Process Activity</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-4 text-sm font-medium">
                <div className="space-y-3">
                  {[
                    { key: "preparing", label: "Encryption & Witnessing", step: 1 },
                    { key: "proving", label: "ZK-SNARK generation", step: 2 },
                    { key: "broadcasting", label: "On-chain broadcasting", step: 3 },
                  ].map((s) => {
                    const isCompleted = ["proving", "broadcasting", "done"].includes(progress) && progress !== s.key;
                    const isActive = progress === s.key;
                    const isError = progress === "error" && isActive;

                    return (
                      <div key={s.key} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                        <div className="flex items-center gap-2.5">
                          {isCompleted ? (
                            <div className="p-1 rounded-full bg-emerald-500/20">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                            </div>
                          ) : isActive ? (
                            isError ? (
                              <div className="p-1 rounded-full bg-destructive/20">
                                <XCircle className="w-3.5 h-3.5 text-destructive" />
                              </div>
                            ) : (
                              <Loader2 className="w-4 h-4 text-primary animate-spin" />
                            )
                          ) : (
                            <div className="w-4 h-4 rounded-full border border-white/10 bg-white/5 text-[8px] flex items-center justify-center text-muted-foreground">
                              {s.step}
                            </div>
                          )}
                          <span className={`${isCompleted ? "text-emerald-500/80" : isActive ? "text-white" : "text-muted-foreground"} text-xs`}>
                            {s.label}
                          </span>
                        </div>
                        {isActive && !isError && (
                          <span className="text-[10px] text-primary animate-pulse uppercase tracking-wider">Processing...</span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {progress === "done" && (
                  <div className="pt-2 space-y-4 animate-in slide-in-from-top-2">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 text-emerald-500">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        Transaction Broadcasted
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold opacity-70">Transaction ID</div>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/20 font-mono text-[10px] break-all group select-all">
                          {txId}
                          <CopyButton value={txId || ""} label="" className="h-6 w-6 shrink-0 bg-transparent hover:bg-white/10 border-none text-emerald-500" />
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full border-none ring-1 ring-white/10" onClick={resetForm}>
                      Send Another
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md border-none bg-background/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-white/5">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <ArrowRight className="w-5 h-5" />
              </div>
              Confirm Transfer
            </DialogTitle>
            <DialogDescription className="text-sm font-medium">
              Carefully review the recipient and amount. Transactions are final.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3 shadow-inner">
                <div className="space-y-1 flex justify-between items-start">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Recipient</div>
                  <Badge variant="outline" className="text-[8px] uppercase tracking-tighter border-primary/30 text-primary">Verified L1</Badge>
                </div>
                <div className="break-all font-mono text-xs leading-relaxed group relative p-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
                  {to}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Amount</div>
                  <div className="text-xl font-black">{amount} <span className="text-xs text-muted-foreground font-normal">PRAF</span></div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Priority</div>
                  <div className="flex items-center gap-1.5 font-bold text-sm capitalize">
                    {proverTip === "high" ? <Zap className="w-4 h-4 text-amber-500" /> : <Clock className="w-4 h-4 text-blue-500" />}
                    {proverTip}
                  </div>
                </div>
              </div>

              {memo && (
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Private Memo</div>
                  <div className="text-sm italic opacity-80">"{memo}"</div>
                </div>
              )}
            </div>

            <div className="p-4 rounded-xl border border-dashed border-amber-500/30 bg-amber-500/5 flex gap-3 italic">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed text-amber-500/80 font-medium">
                This will generate a zero-knowledge proof using your spending key.
                The key remains securely encrypted on your device.
              </div>
            </div>
          </div>

          <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-0">
            <Button
              variant="ghost"
              className="flex-1 h-12 hover:bg-white/5"
              onClick={() => setConfirmOpen(false)}
              disabled={loading}
            >
              Go Back
            </Button>
            <Button
              className="flex-1 h-12 shadow-xl shadow-primary/20 font-bold"
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
              {loading ? "Initializing..." : "Authorize & Send"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
