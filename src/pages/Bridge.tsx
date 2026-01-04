import { useState, useMemo, useEffect } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, BridgeDepositParams, BridgeWithdrawParams } from "../lib/tauri";
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

  Gauge, // For Network Priority
} from "lucide-react";

type ProgressStep = "idle" | "preparing" | "proving" | "broadcasting" | "done" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const ONE_PRAF_UNITS = BigInt(10) ** BigInt(18);

interface BridgePageProps {
  defaultTab?: "deposit" | "withdraw";
}

export default function BridgePage({ defaultTab = "deposit" }: BridgePageProps) {
  const qc = useQueryClient();
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);
  const activeAccount = useWalletStore((s) => s.accounts[s.activeAccountIndex]);
  const [activeTab, setActiveTab] = useState<"deposit" | "withdraw">(defaultTab);

  // Deposit State
  const [l2Address, setL2Address] = useState("");

  // Withdraw State
  const [l1Recipient, setL1Recipient] = useState(activeAccount?.address || "");

  // Shared State
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<string>("200000000000000"); // 0.0002 PRAF initial

  const [selectedSpeed, setSelectedSpeed] = useState<"slow" | "standard" | "fast">("standard");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [txId, setTxId] = useState<string | null>(null);

  // Auto-fill L1 recipient if empty on load
  useEffect(() => {
    if (activeAccount?.address && !l1Recipient) {
      setL1Recipient(activeAccount.address);
    }
  }, [activeAccount]);

  // Fetch L2 Balance for Withdrawal
  const { data: l2Balance } = useQuery({
    queryKey: ["l2Balance"],
    queryFn: api.getL2Balance,
    enabled: activeTab === "withdraw",
    refetchInterval: 5000,
  });

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

    const minRate = BigInt(feeEstimates.min_tip_per_action);
    const avgRate = BigInt(feeEstimates.average_tip);

    const slowTotal = minRate * BigInt(actionCount);
    const stdTotal = avgRate * BigInt(actionCount);
    const fastTotal = (avgRate * BigInt(15) / BigInt(10)) * BigInt(actionCount);

    return {
      slow: { total: slowTotal.toString(), label: "Slow", desc: `Economy (${actionCount} actions)` },
      standard: { total: stdTotal.toString(), label: "Standard", desc: `Recommended (${actionCount} actions)` },
      fast: { total: fastTotal.toString(), label: "Fast", desc: `Priority (${actionCount} actions)` }
    };
  }, [feeEstimates, actionCount]);

  // Set initial tip to standard when loaded
  useEffect(() => {
    if (feeOptions && selectedSpeed === "standard") {
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
    const val = BigInt(minor);
    const whole = val / ONE_PRAF_UNITS;
    const fraction = val % ONE_PRAF_UNITS;
    // Format to 4-6 decimals for display readability, but keep full precision if needed
    const fractionStr = fraction.toString().padStart(18, '0').slice(0, 6);
    return `${whole}.${fractionStr}`;
  };

  const isValidL2 = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(l2Address.trim()), [l2Address]);
  const isValidL1 = useMemo(() => !!l1Recipient, [l1Recipient]); // Basic check, ideally SS58 regex
  const isValidAmount = useMemo(() => {
    const val = parseFloat(amount);
    return !isNaN(val) && val > 0;
  }, [amount]);

  const isSolvent = useMemo(() => {
    if (activeTab === "deposit") return true;
    if (!l2Balance) return false;

    try {
      // Balance is in human readable PRAF string "1.5"
      // Convert to BigInt wei
      const balanceWei = BigInt(Math.floor(parseFloat(l2Balance.praf) * 1e10)) * (BigInt(10) ** BigInt(8));

      const amountWei = BigInt(Math.floor(parseFloat(amount || "0") * 1e10)) * (BigInt(10) ** BigInt(8));
      const tipWei = BigInt(proverTip);

      return (amountWei + tipWei) <= balanceWei;
    } catch {
      return false;
    }
  }, [activeTab, l2Balance, amount, proverTip]);

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
    mutationFn: async (params: BridgeWithdrawParams) => {
      setProgress("broadcasting"); // No ZK proving for L2->L1 (it's EVM tx)
      setSyncStatus("syncing", "Broadcasting L2 Withdrawal...");
      const res = await api.bridgeWithdraw(params);
      await sleep(400);
      return res;
    },
    onSuccess: (data) => {
      setTxId(data.txId);
      qc.invalidateQueries({ queryKey: ["l2Balance"] }); // Refresh L2 balance
      toast.success("Withdrawal initiated");
      setProgress("done");
      setSyncStatus("idle", null);
    },
    onError: (e) => {
      toast.error(e instanceof Error ? e.message : "Withdrawal failed");
      setProgress("error");
      setSyncStatus("error", "Withdrawal failed");
    },
  });

  const loading = depositMutation.isPending || withdrawMutation.isPending;
  const canSubmit = activeTab === "deposit"
    ? Boolean(isValidL2 && isValidAmount && !loading)
    : Boolean(isValidL1 && isValidAmount && isSolvent && !loading);

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

      {/* Tabs */}
      <div className="flex space-x-1 rounded-xl bg-white/5 p-1">
        <button
          onClick={() => { setActiveTab("deposit"); resetForm(); }}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${activeTab === "deposit"
            ? "bg-background shadow text-primary"
            : "text-muted-foreground hover:bg-white/[0.12] hover:text-white"
            }`}
        >
          Deposit (L1 → L2)
        </button>
        <button
          onClick={() => { setActiveTab("withdraw"); resetForm(); }}
          className={`w-full rounded-lg py-2.5 text-sm font-medium leading-5 ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${activeTab === "withdraw"
            ? "bg-background shadow text-purple-500" // Purple for L2
            : "text-muted-foreground hover:bg-white/[0.12] hover:text-white"
            }`}
        >
          Withdraw (L2 → L1)
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* L1 -> L2 Deposit Column */}
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
                    {/* TIP SELECTION REUSED */}
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
                      placeholder="Instructions..."
                      className="h-12 bg-white/5 border-none ring-1 ring-white/10"
                      disabled={loading || progress === "done"}
                    />
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    className="w-full h-14 text-lg font-bold shadow-2xl shadow-primary/20 transition-all hover:scale-[1.01] active:scale-[0.99] group overflow-hidden"
                    disabled={!canSubmit}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Review Deposit
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* L2 -> L1 Withdrawal Column */}
        {activeTab === "withdraw" && (
          <div className="lg:col-span-3 space-y-6">
            <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
              <CardHeader className="bg-white/5 border-b border-white/5">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-xl">Withdraw (L2 → L1)</CardTitle>
                    <CardDescription>Move assets back to anonymous L1.</CardDescription>
                  </div>
                  <Badge variant="outline" className="text-[10px] uppercase tracking-widest bg-purple-500/5 text-purple-500 border-purple-500/20 font-bold">L1 Exit</Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-8 space-y-6">
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="l1Recipient" className="text-sm font-semibold px-1">Target L1 Address (Wallet)</Label>
                    <div className="relative group">
                      <div className="absolute left-3 top-1/2 -translate-y-1/2">
                        <ArrowRightLeft className={`w-4 h-4 transition-colors ${l1Recipient ? 'text-purple-500' : 'text-muted-foreground'}`} />
                      </div>
                      <Input
                        id="l1Recipient"
                        value={l1Recipient}
                        onChange={(e) => setL1Recipient(e.target.value)}
                        placeholder="Addr..."
                        className="pl-10 h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-purple-500 transition-all font-mono text-sm"
                        disabled={loading || progress === "done"}
                      />
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
                          className="h-12 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-purple-500 pr-16"
                          disabled={loading || progress === "done"}
                        />
                        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground opacity-50">
                          PRAF
                        </div>
                      </div>
                      <div className="px-1 text-xs text-muted-foreground text-right">
                        Balance: {l2Balance ? l2Balance.praf : "..."} PRAF
                      </div>
                    </div>

                    {/* TIP SELECTION - SAME AS DEPOSIT (BUT PURPLE THEME) */}
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
                                  ? "bg-gradient-to-b from-purple-500/20 to-purple-500/10 border border-purple-500/50 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                                  : "hover:bg-white/5 border border-transparent"
                                  }`}
                              >
                                <span className={`text-[10px] font-bold uppercase tracking-wider mb-0.5 ${isSelected ? "text-purple-500" : "text-muted-foreground"}`}>{opt.label}</span>
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

                  {!isSolvent && amount && (
                    <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-xs font-bold flex items-center gap-2">
                      <AlertTriangle className="w-4 h-4" />
                      Insufficient L2 Balance (Amount + Tip {'>'} Balance)
                    </div>
                  )}

                </div>

                <div className="pt-2">
                  <Button
                    className="w-full h-14 text-lg font-bold shadow-2xl shadow-purple-500/20 transition-all hover:scale-[1.01] active:scale-[0.99] group overflow-hidden bg-purple-600 hover:bg-purple-500"
                    disabled={!canSubmit}
                    onClick={() => setConfirmOpen(true)}
                  >
                    <span className="relative z-10 flex items-center gap-2">
                      Review Withdrawal
                      <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                    </span>
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-white/20 transform translate-y-full group-hover:translate-y-0 transition-transform" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Activity/Progress Card (Using same for both, but different mutations) */}
        {progress !== "idle" && (
          <div className="lg:col-span-2 space-y-6">
            <Card className={`border-none shadow-xl ring-1 animate-in zoom-in-95 ${progress === "error" ? "ring-destructive/20 bg-destructive/5" : "ring-white/10 bg-background/50"
              }`}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">Bridge Activity</CardTitle>
              </CardHeader>
              <CardContent className="pt-2 space-y-4 text-sm font-medium">
                {/* Reuse existing Deposit Steps visualization for Withdraw too? 
                      Withdraw doesn't use ZK Proving in the same way (no "Witness composition").
                      It just signs EVM tx.
                      Maybe simplified steps for Withdraw?
                  */}
                {activeTab === "deposit" ? (
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
                ) : (
                  <div className="space-y-3">
                    {/* Withdrawal Steps */}
                    {[
                      { key: "broadcasting", label: "Sending L2 Switch Transaction", step: 1 },
                      { key: "done", label: "Confirmation", step: 2 },
                    ].map((s) => {
                      const isCompleted = progress === "done" && s.key !== "done";
                      const isActive = progress === s.key;
                      const isError = progress === "error" && isActive;
                      return (
                        <div key={s.key} className="flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5">
                          <div className="flex items-center gap-2.5">
                            {isCompleted || (progress === "done" && s.key === "done") ? (
                              <div className="p-1 rounded-full bg-emerald-500/20">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                              </div>
                            ) : isActive ? (
                              isError ? (
                                <div className="p-1 rounded-full bg-destructive/20">
                                  <XCircle className="w-3.5 h-3.5 text-destructive" />
                                </div>
                              ) : (
                                <Loader2 className="w-4 h-4 text-purple-500 animate-spin" />
                              )
                            ) : (
                              <div className="w-4 h-4 rounded-full border border-white/10 bg-white/5 text-[8px] flex items-center justify-center text-muted-foreground">
                                {s.step}
                              </div>
                            )}
                            <span className={`${isCompleted || (progress === "done" && s.key === "done") ? "text-emerald-500/80" : isActive ? "text-white" : "text-muted-foreground"} text-xs`}>
                              {s.label}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}


                {progress === "done" && (
                  <div className="pt-2 space-y-4 animate-in slide-in-from-top-2">
                    <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/20 space-y-3 text-emerald-500">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <CheckCircle2 className="w-4 h-4" />
                        Action Initiated
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] uppercase font-bold opacity-70">Tx Hash</div>
                        <div className="flex items-center justify-between gap-2 p-2 rounded-lg bg-emerald-500/20 font-mono text-[10px] break-all group select-all">
                          {txId}
                          <CopyButton value={txId || ""} label="" className="h-6 w-6 shrink-0 bg-transparent hover:bg-white/10 border-none text-emerald-500" />
                        </div>
                      </div>
                    </div>
                    <Button variant="outline" className="w-full border-none ring-1 ring-white/10" onClick={resetForm}>
                      New Action
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md border-none bg-background/95 backdrop-blur-xl shadow-2xl ring-1 ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-white/5">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className={`p-2 rounded-lg ${activeTab === "withdraw" ? "bg-purple-500/20 text-purple-500" : "bg-primary/20 text-primary"}`}>
                <ArrowUpRight className="w-5 h-5" />
              </div>
              Confirm {activeTab === "withdraw" ? "Withdrawal" : "Deposit"}
            </DialogTitle>
            <DialogDescription className="text-sm font-medium">
              You are moving assets {activeTab === "withdraw" ? "from L2 EVM to L1" : "from L1 to L2 EVM"}.
            </DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6">
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3 shadow-inner">
                <div className="space-y-1 flex justify-between items-start">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Target Receiver</div>
                  <Badge variant="outline" className={`text-[8px] uppercase tracking-tighter border-emerald-500/30 text-emerald-500 bg-emerald-500/5`}>
                    {activeTab === "withdraw" ? "L1 Address" : "EVM Address"}
                  </Badge>
                </div>
                <div className="break-all font-mono text-xs leading-relaxed group relative p-2 rounded-lg hover:bg-white/5 transition-colors cursor-default">
                  {activeTab === "withdraw" ? l1Recipient : l2Address}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-1">
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Amount</div>
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

            <div className={`p-4 rounded-xl border border-dashed flex gap-3 italic ${activeTab === "withdraw" ? "border-purple-500/30 bg-purple-500/5" : "border-primary/30 bg-primary/5"}`}>
              <ShieldCheck className={`w-5 h-5 shrink-0 mt-0.5 ${activeTab === "withdraw" ? "text-purple-500" : "text-primary"}`} />
              <div className="text-[10px] leading-relaxed text-muted-foreground font-medium">
                Note: Bridging involves cross-chain state updates. It may take several minutes for assets to appear on the destination chain.
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
              className={`flex-1 h-12 shadow-xl font-bold ${activeTab === "withdraw" ? "shadow-purple-500/20 bg-purple-600 hover:bg-purple-500" : "shadow-primary/20 bg-primary hover:bg-primary/90"}`}
              onClick={() => {
                setConfirmOpen(false);
                if (activeTab === "deposit") {
                  setProgress("idle");
                  depositMutation.mutate({
                    l2Address: l2Address.trim(),
                    amount,
                    memo: memo || undefined,
                    proverTip,
                  });
                } else {
                  setProgress("broadcasting");
                  withdrawMutation.mutate({
                    amount,
                    l1Recipient: l1Recipient.trim(),
                    proverTip: proverTip, // Already in base units!
                  });
                }
              }}
              disabled={loading}
            >
              {loading ? "Initializing..." : "Authorize"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div >
  );
}
