import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
  Info,
  ExternalLink,
  Clock
} from "lucide-react";

type ProgressStep = "idle" | "preparing" | "proving" | "broadcasting" | "done" | "error";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export default function BridgePage() {
  const qc = useQueryClient();
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);

  const [l2Address, setL2Address] = useState("");
  const [amount, setAmount] = useState("");
  const [memo, setMemo] = useState("");
  const [proverTip, setProverTip] = useState<BridgeDepositParams["proverTip"]>("medium");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [progress, setProgress] = useState<ProgressStep>("idle");
  const [txId, setTxId] = useState<string | null>(null);

  const isValidL2 = useMemo(() => /^0x[a-fA-F0-9]{40}$/.test(l2Address.trim()), [l2Address]);
  const isValidAmount = useMemo(() => {
    const val = parseFloat(amount);
    return !isNaN(val) && val > 0;
  }, [amount]);

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

  const loading = depositMutation.isPending;
  const canSubmit = Boolean(isValidL2 && isValidAmount && !loading);

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
            Anonymous bridging between PRAPH Vault (L1) and PRAPH EVM (L2).
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
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

          <Card className="border-none bg-white/5 shadow-xl ring-1 ring-white/5">
            <CardHeader className="pb-3 border-b border-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Info className="w-5 h-5 text-primary" />
                Withdrawal Guide (L2 → L1)
              </CardTitle>
              <CardDescription>How to bring your assets back to the anonymous Vault.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="relative pl-8 space-y-6 before:absolute before:left-3 before:top-2 before:bottom-2 before:w-0.5 before:bg-white/10 before:rounded-full">
                {[
                  {
                    title: "Access PRAPH Explorer",
                    desc: "Go to the official L2 bridge interface on the PRAPH Web Explorer.",
                    icon: 1
                  },
                  {
                    title: "Connect & Authorize",
                    desc: "Connect your L2 wallet (e.g. MetaMask) and initiate a 'Withdraw' action.",
                    icon: 2
                  },
                  {
                    title: "Provide Vault IVK",
                    desc: "Input your Incoming Viewing Key (IVK) from this wallet to direct assets to your L1 vault.",
                    icon: 3
                  },
                  {
                    title: "Automatic Rescan",
                    desc: "Once established on L1, this wallet will automatically detect the inbound note.",
                    icon: 4
                  }
                ].map((step) => (
                  <div key={step.icon} className="relative">
                    <div className="absolute -left-8 top-0 flex items-center justify-center w-6 h-6 rounded-full bg-white/10 border border-white/10 text-[10px] font-bold text-muted-foreground z-10">
                      {step.icon}
                    </div>
                    <div className="space-y-1">
                      <h4 className="text-sm font-bold">{step.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="p-4 rounded-xl bg-primary/5 border border-primary/10 flex items-start gap-3">
                <AlertTriangle className="w-4 h-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[10px] text-muted-foreground italic leading-relaxed">
                  L2 to L1 withdrawals require a specific exit transaction on the EVM chain which interacts with the PRAPH MPC contract.
                </p>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <Card className="border-none bg-primary/5 shadow-lg ring-1 ring-primary/20">
            <CardHeader className="pb-3 border-b border-primary/10">
              <CardTitle className="text-sm flex items-center gap-2 text-primary font-bold uppercase tracking-widest">
                <ShieldCheck className="w-4 h-4" />
                Privacy Protection
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-4">
              <div className="flex gap-3">
                <Zap className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                <div className="text-xs leading-relaxed text-muted-foreground font-medium">
                  Bridging uses a dedicated **Bridge ZK Proof** circuit that disconnects your L1 identity from your L2 destination.
                </div>
              </div>
              <p className="text-[10px] text-muted-foreground leading-relaxed opacity-70">
                The MPC handler receives an encrypted instruction that only reveals the L2 destination to the decentralized prover network upon successful verification of the proof.
              </p>
            </CardContent>
          </Card>

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
                  <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground opacity-60">Prover Priority</div>
                  <div className="flex items-center gap-1.5 font-bold text-sm capitalize">
                    {proverTip === "high" ? <Zap className="w-4 h-4 text-amber-500" /> : <Clock className="w-4 h-4 text-blue-500" />}
                    {proverTip}
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
                });
              }}
              disabled={loading}
            >
              {loading ? "Initializing..." : "Authorize Bridge"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
