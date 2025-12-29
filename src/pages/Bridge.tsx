import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BridgeDepositParams } from "../lib/tauri";
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
  ArrowRightLeft,
  ArrowRight,
  ArrowUpRight,
  Zap,
  ShieldCheck,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  ExternalLink,
  Clock,
  Flame, // For burn/withdraw
  Gauge, // For Network Priority
} from "lucide-react";

type ProgressStep = "idle" | "preparing" | "proving" | "broadcasting" | "done" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const ONE_PRAF_UNITS = 10000;

interface BridgePageProps {
  defaultTab?: "deposit" | "withdraw";
}

export default function BridgePage({ defaultTab = "deposit" }: BridgePageProps) {
  const qc = useQueryClient();
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);
  const activeTab = defaultTab; // Use defaultTab directly (no need for state)

  // Deposit State
  const [l2Address, setL2Address] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<string>("20"); // Changed to string (minor units)
  const [selectedSpeed, setSelectedSpeed] = useState<"slow" | "standard" | "fast">("standard");
  const [autoWrap, setAutoWrap] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [txId, setTxId] = useState<string | null>(null);

  // Withdraw State
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawL1Address, setWithdrawL1Address] = useState("");
  const [withdrawConfirmOpen, setWithdrawConfirmOpen] = useState(false);
  const [withdrawTxId, setWithdrawTxId] = useState<string | null>(null);

  // Fetch Fee Estimates  
  const { data: feeEstimates } = useQuery({
    queryKey: ["feeEstimates"],
    queryFn: () => api.getFeeEstimates(),
    staleTime: 60000, // Refresh every minute
  });

  // Calculate actual action count based on UTXO distribution
  const { data: actionEstimate } = useQuery({
    queryKey: ["actionCount", amount, true], // true = bridge
    queryFn: async () => {
      if (!amount || parseFloat(amount) === 0) return null;
      return api.estimateActionCount(amount, true);
    },
    enabled: !!amount && parseFloat(amount) > 0,
    staleTime: 10000, // Cache for 10 seconds
  });

  // Use estimated action count if available, otherwise fallback to default 3
  // Bridge: spend + change + tip = 3 actions (no recipient output)
  const actionCount = useMemo(() => {
    if (actionEstimate?.totalActions) {
      return actionEstimate.totalActions;
    }
    // Default: 1 spend + 1 change + 1 tip = 3 actions
    return 3;
  }, [actionEstimate]);

  // Calculate fee options
  const feeOptions = useMemo(() => {
    if (!feeEstimates) return null;

    const minRate = feeEstimates.min_tip_per_action;
    const avgRate = feeEstimates.average_tip;

    const slowTotal = minRate * actionCount;
    const stdTotal = avgRate * actionCount;
    const fastTotal = Math.ceil(avgRate * 1.5 * actionCount);

    return {
      slow: { total: slowTotal.toString(), label: "Slow", desc: `Economy (${actionCount} actions)` },
      standard: { total: stdTotal.toString(), label: "Standard", desc: `Recommended (${actionCount} actions)` },
      fast: { total: fastTotal.toString(), label: "Fast", desc: `Priority (${actionCount} actions)` }
    };
  }, [feeEstimates, actionCount]);

  // Set initial tip to standard when loaded
  useEffect(() => {
    if (feeOptions && selectedSpeed === "standard" && proverTip === "20") {
      setProverTip(feeOptions.standard.total);
    }
  }, [feeOptions]);

  const handleSpeedSelect = (speed: "slow" | "standard" | "fast") => {
    setSelectedSpeed(speed);
    if (feeOptions) {
      setProverTip(feeOptions[speed].total);
    }
  };

  const formatPraf = (minor: string) => {
    const val = parseInt(minor);
    return (val / ONE_PRAF_UNITS).toFixed(4);
  };

  const isValidL2 = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(l2Address.trim()), [l2Address]);
  const isValidAmount = useMemo(() => {
    const val = parseFloat(amount);
    return !isNaN(val) && val > 0;
  }, [amount]);

  const isValidWithdrawL1Address = useMemo(() => {
    const addr = withdrawL1Address.trim();
    return addr.length > 0; // Basic validation - L1 address format
  }, [withdrawL1Address]);

  const isValidWithdrawAmount = useMemo(() => {
    const val = parseFloat(withdrawAmount);
    return !isNaN(val) && val > 0;
  }, [withdrawAmount]);

  const depositMutation = useMutation({
    mutationFn: async (params: BridgeDepositParams) => {
      setProgress("preparing");
      setSyncStatus("syncing", "Preparing bridge witness...");
      await sleep(400);

      setProgress("proving");
      setSyncStatus("syncing", "Generating Bridge ZK Proof...");
      const res = await api.bridgeDeposit(params);

      setProgress("broadcasting");
      setSyncStatus("syncing", "Broadcasting bridge action...");
      await sleep(400);
      return res;
    },
    onSuccess: (data) => {
      setTxId(data.txId);
      qc.invalidateQueries({ queryKey: ["balance"] });
      qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Bridge deposit successful");
      setProgress("done");
      setSyncStatus("idle", null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Bridge action failed");
      setProgress("error");
      setSyncStatus("error", "Bridge failed");
    },
  });

  const withdrawMutation = useMutation({
    mutationFn: async (amt: string) => {
      setSyncStatus("syncing", "Burning L2 tokens...");
      const tx = await api.withdrawL2Funds(amt);
      return tx;
    },
    onSuccess: (tx) => {
      setWithdrawTxId(tx);
      setWithdrawAmount("");
      qc.invalidateQueries({ queryKey: ["l2Balance"] }); // Update L2 balance
      toast.success("Withdrawal initiated (Burned wPRAF)");
      setSyncStatus("idle", null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed");
      setSyncStatus("error", "Withdrawal failed");
    },
  });

  const loading = depositMutation.isPending;
  const withdrawLoading = withdrawMutation.isPending;
  const canSubmit = Boolean(isValidL2 && isValidAmount && !loading);
  const canSubmitWithdraw = Boolean(isValidWithdrawL1Address && isValidWithdrawAmount && !withdrawLoading);

  const resetForm = () => {
    setL2Address("");
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
          <ArrowRightLeft className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Bridge</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Anonymous bridging between Praph Wallet (L1) and PRAPH EVM (L2).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* L1 -> L2 Deposit Column - only show when activeTab is deposit */}
        {activeTab === "deposit" && (
          <div className="lg:col-span-3 space-y-6">
            <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
              <CardHeader className="bg-white/5 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Deposit (L1 → L2)</CardTitle>
                    <CardDescription>Target your EVM address for anonymous entry.</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-primary/5 text-primary border-primary/20 font-bold">L1 Entry</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="l2Address" className="text-sm font-semibold px-1">Target L2 Address (EVM)</Label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <ExternalLink className={`w-4 h-4 transition-colors ${l2Address ? 'text-primary' : 'text-muted-foreground'}`} />
                      </div>
                      <Input
                        id="l2Address"
                        value={l2Address}
                        onChange={(e) => setL2Address(e.target.value)}
                        placeholder="0x..."
                        className="pl-10 h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-primary transition-all font-mono"
                        disabled={loading || progress === "done"}
                      />
                      {l2Address && !isValidL2 && (
                        <p className="mt-1.5 px-1 text-[10px] text-destructive flex items-center gap-1 font-medium italic">
                          <AlertTriangle className="w-3 h-3" /> Invalid EVM address format
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
                      <Label className="text-sm font-semibold px-1 flex items-center gap-2">
                        <Gauge className="w-4 h-4 text-amber-500" />
                        Network Priority
                      </Label>
                      {feeOptions ? (
                        <div className="grid grid-cols-3 gap-2 p-1.5 rounded-lg bg-white/5 border border-white/10">
                          {(["slow", "standard", "fast"] as const).map((level) => {
                            const opt = feeOptions[level];
                            const tipPraf = formatPraf(opt.total);
                            const isSelected = selectedSpeed === level;
                            return (
                              <button
                                key={level}
                                type="button"
                                onClick={() => handleSpeedSelect(level)}
                                disabled={loading || progress === "done"}
                                className={`py-2 px-1 flex flex-col items-center justify-center rounded-md transition-all ${isSelected
                                  ? "bg-gradient-to-b from-primary/20 to-primary/10 border border-primary/50 shadow-[0_0_15px_rgba(var(--primary),0.3)]"
                                  : "hover:bg-white/5 border border-transparent"
                                  }`}
                              >
                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSelected ? "text-primary" : "text-muted-foreground"}`}>{opt.label}</span>
                                <span className={`text-xs font-mono font-medium ${isSelected ? "text-white" : "text-muted-foreground/70"}`}>{tipPraf}</span>
                              </button>
                            )
                          })}
                        </div>
                      ) : (
                        <div className="h-[60px] flex items-center justify-center text-xs text-muted-foreground bg-white/5 rounded-lg">
                          <Clock className="w-3 h-3 mr-2 animate-spin" /> Calculating fees...
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="memo" className="text-sm font-semibold px-1">Bridge Memo <span className="text-[10px] text-muted-foreground font-normal">(Optional)</span></Label>
                    <Input
                      id="memo"
                      value={memo}
                      onChange={(e) => setMemo(e.target.value)}
                      placeholder="Instructions for the bridge handler"
                      className="h-12 bg-white/5 border-none ring-1 ring-white/10"
                      disabled={loading || progress === "done"}
                    />
                  </div>

                  {/* Auto-Wrap Option */}
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <input
                      type="checkbox"
                      id="autoWrap"
                      checked={autoWrap}
                      onChange={(e) => setAutoWrap(e.target.checked)}
                      disabled={loading || progress === "done"}
                      className="w-4 h-4 accent-primary"
                    />
                    <Label htmlFor="autoWrap" className="text-sm font-medium cursor-pointer">
                      Auto-wrap for DeFi <span className="text-xs text-muted-foreground">(keep 0.1 PRAF for gas, convert rest to wPRAF)</span>
                    </Label>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    className="w-full h-14 text-lg font-bold shadow-2xl shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] group overflow-hidden"
                    disabled={!canSubmit || loading || progress === "done"}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Review Bridge Action
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* L2 -> L1 Withdrawal/Info Column - only show when activeTab is withdraw */}
        {activeTab === "withdraw" && (
          <div className="lg:col-span-3 space-y-6">
            {/* Withdrawal Card */}
            <Card className="border-none bg-red-500/5 shadow-xl ring-1 ring-red-500/10">
              <CardHeader className="pb-3 border-b border-red-500/10">
                <CardTitle className="text-lg flex items-center gap-2 text-red-500">
                  <Flame className="w-5 h-5" />
                  Withdraw (L2 → L1)
                </CardTitle>
                <CardDescription>Burn wPRAF to bridge back to L1.</CardDescription>
              </CardHeader>
              <CardContent className="pt-6 space-y-4">
                <div className="p-4 rounded-xl bg-background/50 border border-red-500/20 text-xs text-muted-foreground leading-relaxed">
                  <span className="font-bold text-red-500">Warning:</span> Ensure you have a valid way to claim burned funds on L1. The burn transaction is irreversible.
                </div>

                <div className="space-y-2">
                  <Label htmlFor="withdrawL1Address" className="text-sm font-semibold px-1">Target L1 Address</Label>
                  <Input
                    id="withdrawL1Address"
                    value={withdrawL1Address}
                    onChange={(e) => setWithdrawL1Address(e.target.value)}
                    placeholder="5..."
                    className="h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-red-500 font-mono"
                    disabled={withdrawLoading}
                  />
                  <p className="text-xs text-muted-foreground px-1">L1 address to receive withdrawn funds</p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="withdrawAmount" className="text-sm font-semibold px-1">Amount ($wPRAF)</Label>
                  <div className="relative group">
                    <Input
                      id="withdrawAmount"
                      type="number"
                      value={withdrawAmount}
                      onChange={(e) => setWithdrawAmount(e.target.value)}
                      placeholder="0.00"
                      className="h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-red-500 pr-16"
                      disabled={withdrawLoading}
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground opacity-50">
                      wPRAF
                    </div>
                  </div>
                </div>

                <Button
                  variant="destructive"
                  className="w-full h-12 font-bold shadow-lg shadow-red-500/20"
                  disabled={!canSubmitWithdraw}
                  onClick={() => setWithdrawConfirmOpen(true)}
                >
                  Initiate Withdrawal
                </Button>

                {withdrawTxId && (
                  <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-bold text-red-500">
                      <CheckCircle2 className="w-4 h-4" /> Burnt Successfully
                    </div>
                    <div className="flex items-center justify-between gap-2 p-2 rounded bg-background/50 font-mono text-[10px] break-all select-all">
                      {withdrawTxId}
                      <CopyButton value={withdrawTxId} label="" className="h-4 w-4 shrink-0 bg-transparent hover:bg-white/10 border-none text-red-500" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Activity/Progress Card (only for L1->L2) */}
            {progress !== "idle" && (
              <Card className={`border-none shadow-xl ring-1 animate-in zoom-in-95 ${progress === "error" ? "ring-destructive/20 bg-destructive/5" : "ring-white/10 bg-background/50"
                }`}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg">Bridge Activity</CardTitle>
                </CardHeader>
                <CardContent className="pt-2 space-y-4 text-sm font-medium">
                  <div className="space-y-3">
                    {[
                      { key: "preparing", label: "Witness composition", step: 1 },
                      { key: "proving", label: "Bridge Proof Generation", step: 2 },
                      { key: "broadcasting", label: "MPC Handover", step: 3 },
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
                        </div>
                      );
                    })}
                  </div>

                  {progress === "done" && (
                    <div className="pt-2 space-y-4 animate-in slide-in-from-top-2">
                      <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 text-emerald-500">
                        <div className="flex items-center gap-2 text-sm font-bold">
                          <CheckCircle2 className="w-4 h-4" />
                          Bridge Action Finalized
                        </div>
                        <div className="space-y-1">
                          <div className="text-[10px] uppercase font-bold opacity-70">Bridge TxID</div>
                          <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/20 font-mono text-[10px] break-all group select-all">
                            {txId}
                            <CopyButton value={txId || ""} label="" className="h-6 w-6 shrink-0 bg-transparent hover:bg-white/10 border-none text-emerald-500" />
                          </div>
                        </div>
                      </div>
                      <Button variant="outline" className="w-full border-none ring-1 ring-white/10" onClick={resetForm}>
                        New Bridge Action
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md border-none bg-background/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-white/5">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <ArrowUpRight className="w-5 h-5" />
              </div>
              Confirm Bridge
            </DialogTitle>
            <DialogDescription className="text-sm font-medium">
              You are moving assets from the anonymous L1 to L2.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3 shadow-inner">
                <div className="space-y-1 flex justify-between items-start">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Target L2 Receiver</div>
                  <Badge variant="outline" className="text-[8px] uppercase tracking-tighter border-emerald-500/30 text-emerald-500 bg-emerald-500/5">EVM Address</Badge>
                </div>
                <div className="break-all font-mono text-xs leading-relaxed group relative p-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
                  {l2Address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Deposit Amount</div>
                  <div className="text-xl font-black">{amount} <span className="text-xs text-muted-foreground font-normal">PRAF</span></div>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Prover Tip</div>
                  <div className="flex items-center gap-1.5 font-bold text-sm">
                    <Zap className="w-4 h-4 text-amber-500" />
                    {formatPraf(proverTip)} PRAF
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-dashed border-primary/30 bg-primary/5 flex gap-3 italic">
              <ShieldCheck className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div className="text-[10px] leading-relaxed text-muted-foreground font-medium">
                Note: Bridging involves cross-chain state updates. It may take several minutes for assets to appear on the destination L2 chain.
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
              Cancel
            </Button>
            <Button
              className="flex-1 h-12 shadow-xl shadow-primary/20 font-bold"
              onClick={() => {
                setConfirmOpen(false);
                setProgress("idle");
                depositMutation.mutate({
                  l2Address: l2Address.trim(),
                  amount,
                  memo: memo || undefined,
                  proverTip,
                  autoWrap,
                });
              }}
              disabled={loading}
            >
              {loading ? "Initializing..." : "Authorize Bridge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Withdraw Confirmation Dialog */}
      <Dialog open={withdrawConfirmOpen} onOpenChange={setWithdrawConfirmOpen}>
        <DialogContent className="max-w-md border-none bg-background/95 backdrop-blur-xl shadow-2xl ring-1 ring-red-500/20 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-red-500/10">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3 text-red-500">
              <div className="p-2 rounded-lg bg-red-500/20">
                <Flame className="w-5 h-5" />
              </div>
              Confirm Withdrawal
            </DialogTitle>
            <DialogDescription className="text-sm font-medium">
              You are ensuring funds are burnt on L2 to be claimed on L1.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6 space-y-4">
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-2">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Target L1 Address</div>
              <div className="font-mono text-xs break-all">{withdrawL1Address}</div>
            </div>
            <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Withdrawal Amount</div>
              <div className="text-xl font-black">{withdrawAmount} <span className="text-xs text-muted-foreground font-normal">wPRAF</span></div>
            </div>
            <div className="text-xs text-red-400 font-medium">
              Are you sure? This action cannot be undone on L2.
            </div>
          </div>
          <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-0">
            <Button
              variant="ghost"
              className="flex-1 h-12 hover:bg-white/5"
              onClick={() => setWithdrawConfirmOpen(false)}
              disabled={withdrawLoading}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              className="flex-1 h-12 shadow-xl shadow-red-500/20 font-bold"
              onClick={() => {
                setWithdrawConfirmOpen(false);
                withdrawMutation.mutate(withdrawAmount);
              }}
              disabled={withdrawLoading}
            >
              {withdrawLoading ? "Burning..." : "Confirm Burn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
