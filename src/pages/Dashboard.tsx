import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MintDevFaucetParams } from "../lib/tauri";
import { toast } from "sonner";
import { useWalletStore } from "../state/walletStore";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Badge } from "../components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import CopyButton from "../components/CopyButton";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import {
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Clock,
  CheckCircle2,
  XCircle,
  ExternalLink,
  Shield,
  Key,
  Coins,
  Inbox,
  History,
  Info
} from "lucide-react";

export default function DashboardPage() {
  const qc = useQueryClient();
  const activeAccountIndex = useWalletStore((s) => s.activeAccountIndex);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [tvkOpen, setTvkOpen] = useState(false);
  const [tvkPassword, setTvkPassword] = useState("");
  const [tvkRunning, setTvkRunning] = useState(false);
  const [tvk, setTvk] = useState<string | null>(null);

  const [mintOpen, setMintOpen] = useState(false);
  const [mintAmount, setMintAmount] = useState("");
  const [mintMemo, setMintMemo] = useState("");
  const [mintTip, setMintTip] = useState<MintDevFaucetParams["proverTip"]>("low");

  const appInfoQuery = useQuery({
    queryKey: ["appInfo"],
    queryFn: api.appInfo,
  });

  const balanceQuery = useQuery({
    queryKey: ["balance", activeAccountIndex],
    queryFn: api.getBalance,
    refetchInterval: 10000,
  });

  const txsQuery = useQuery({
    queryKey: ["transactions", activeAccountIndex],
    queryFn: api.listTransactionsForActiveAccount,
    refetchInterval: 10000,
  });

  const syncQuery = useQuery({
    queryKey: ["syncMetadata"],
    queryFn: api.getSyncMetadata,
    refetchInterval: 5000,
  });

  const mintMutation = useMutation({
    mutationFn: (p: MintDevFaucetParams) => api.mintDevFaucet(p),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["balance"] });
      await qc.invalidateQueries({ queryKey: ["transactions"] });
      toast.success("Mint submitted");
      setMintOpen(false);
      setMintAmount("");
      setMintMemo("");
    },
    onError: (e) => {
      const msg =
        e instanceof Error
          ? e.message
          : typeof e === "string"
            ? e
            : e && typeof e === "object" && "message" in (e as any)
              ? String((e as any).message)
              : JSON.stringify(e);
      toast.error(msg || "Mint failed");
    },
  });

  const selectedTx = ((txsQuery.data ?? []) as any[]).find((t) => t.id === selectedTxId) ?? null;

  function statusBadgeVariant(status: string): "default" | "secondary" | "destructive" | "outline" {
    if (status === "confirmed") return "default";
    if (status === "pending") return "secondary";
    if (status === "failed") return "destructive";
    return "outline";
  }

  function getStatusIcon(status: string) {
    if (status === "confirmed") return <CheckCircle2 className="w-3 h-3 text-emerald-500" />;
    if (status === "pending") return <Clock className="w-3 h-3 text-amber-500 animate-pulse" />;
    return <XCircle className="w-3 h-3 text-destructive" />;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-3xl font-bold tracking-tight">Dashboard</div>
          <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
            {appInfoQuery.data
              ? `v${appInfoQuery.data.version} · ${appInfoQuery.data.os}`
              : "Loading app info..."}
            <span className="text-border px-1">|</span>
            {syncQuery.data?.state === "syncing" ? (
              <span className="flex items-center gap-1.5 text-amber-500 font-medium">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                {syncQuery.data.message || "Syncing..."}
              </span>
            ) : syncQuery.data?.state === "error" ? (
              <span className="flex items-center gap-1.5 text-destructive font-medium">
                <XCircle className="w-3.5 h-3.5" />
                Sync Error
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-emerald-500 font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Synchronized
              </span>
            )}
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => qc.invalidateQueries()}
          className="bg-background/50 backdrop-blur-sm"
        >
          <RefreshCw className={`w-4 h-4 mr-2 ${balanceQuery.isFetching || txsQuery.isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "Total Balance", value: balanceQuery.data?.total, icon: Coins, color: "text-primary" },
          { label: "Confirmed", value: balanceQuery.data?.confirmed, icon: CheckCircle2, color: "text-emerald-500" },
          { label: "Pending", value: balanceQuery.data?.pending, icon: Clock, color: "text-amber-500" },
          { label: "Unspent Notes", value: balanceQuery.data?.unspent, icon: Inbox, color: "text-blue-500" },
        ].map((stat, i) => (
          <Card key={i} className="bg-background/50 backdrop-blur-sm border-none shadow-md ring-1 ring-white/5 transition-transform hover:scale-[1.02]">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardDescription className="font-medium">{stat.label}</CardDescription>
              <stat.icon className={`w-4 h-4 ${stat.color}`} />
            </CardHeader>
            <CardContent>
              <CardTitle className="text-2xl font-bold">{stat.value ?? "-"}</CardTitle>
            </CardContent>
          </Card>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2 bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5 overflow-hidden">
          <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 bg-white/5 pb-4">
            <div className="space-y-1">
              <CardTitle className="flex items-center gap-2">
                <History className="w-5 h-5 text-primary" />
                Transaction History
              </CardTitle>
              <CardDescription>Recent on-chain activity for this account</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto custom-scrollbar">
              {(txsQuery.data ?? []).length > 0 ? (
                (txsQuery.data ?? []).map((tx) => (
                  <button
                    key={tx.id}
                    type="button"
                    className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/5 group"
                    onClick={() => setSelectedTxId(tx.id)}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`p-2 rounded-full ${tx.direction === "incoming" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                        {tx.direction === "incoming" ? (
                          <ArrowDownLeft className={`w-5 h-5 ${tx.direction === "incoming" ? "text-emerald-500" : "text-primary"}`} />
                        ) : (
                          <ArrowUpRight className="w-5 h-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate">
                          {tx.direction === "incoming" ? "Received PRAF" : "Sent PRAF"}
                        </div>
                        <div className="mt-0.5 text-xs text-muted-foreground flex items-center gap-1.5">
                          {new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                          })}
                          <span className="opacity-20">|</span>
                          <span className="truncate max-w-[80px] font-mono">{tx.id.slice(0, 8)}...</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex flex-col items-end gap-1.5">
                      <div className={`text-sm font-bold ${tx.direction === "incoming" ? "text-emerald-500" : "text-foreground"}`}>
                        {tx.direction === "incoming" ? "+" : ""}{tx.amount}
                      </div>
                      <Badge variant={statusBadgeVariant(tx.status)} className="h-5 px-1.5 flex gap-1 items-center border-none">
                        {getStatusIcon(tx.status)}
                        {tx.status}
                      </Badge>
                    </div>
                  </button>
                ))
              ) : (
                <div className="py-20 flex flex-col items-center justify-center text-center space-y-3">
                  <div className="p-4 rounded-full bg-white/5">
                    <Inbox className="w-8 h-8 text-muted-foreground opacity-20" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">No transactions yet</p>
                    <p className="text-xs text-muted-foreground">Your activity will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5 flex flex-col h-full">
          <CardHeader className="border-b border-white/5 bg-white/5 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-primary" />
              Dev Tools
            </CardTitle>
            <CardDescription>Testnet maintenance utilities</CardDescription>
          </CardHeader>
          <CardContent className="pt-6 space-y-6 flex-1">
            <div className="p-4 rounded-xl border border-dashed border-primary/20 bg-primary/5 space-y-4">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Coins className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <div className="text-sm font-bold">Dev Faucet</div>
                  <div className="text-[10px] text-muted-foreground truncate max-w-[150px]">
                    Mint test funds for development
                  </div>
                </div>
              </div>

              <Dialog open={mintOpen} onOpenChange={setMintOpen}>
                <Button
                  className="w-full shadow-lg shadow-primary/20"
                  onClick={() => setMintOpen(true)}
                  disabled={mintMutation.isPending}
                >
                  Request Test Funds
                </Button>
                <DialogContent className="max-w-lg border border-white/10 bg-[hsl(var(--background)/0.98)] backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
                  <DialogHeader className="p-6 pb-5 bg-gradient-to-r from-primary/15 via-primary/10 to-transparent border-b border-white/10">
                    <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                      <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary/30 to-primary/20 border border-primary/30">
                        <Coins className="w-6 h-6 text-primary" />
                      </div>
                      Mint Funds
                    </DialogTitle>
                    <DialogDescription className="text-sm font-medium text-muted-foreground/80 mt-2">
                      Request $PRAF tokens from the local dev testnet aggregator for testing.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="p-6 space-y-5">
                    <div className="space-y-3">
                      <Label htmlFor="mintAmount" className="text-sm font-bold text-foreground/90">Amount</Label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/20 via-emerald-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                        <Input
                          id="mintAmount"
                          type="number"
                          value={mintAmount}
                          onChange={(e) => setMintAmount(e.target.value)}
                          placeholder="0.00"
                          className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 pr-16 text-lg font-semibold transition-all"
                          disabled={mintMutation.isPending}
                        />
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-bold text-emerald-500/70">
                          PRAF
                        </div>
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label htmlFor="mintMemo" className="text-sm font-bold text-foreground/90">
                        Memo <span className="text-xs text-muted-foreground/60 font-normal">(Optional)</span>
                      </Label>
                      <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                        <Input
                          id="mintMemo"
                          value={mintMemo}
                          onChange={(e) => setMintMemo(e.target.value)}
                          placeholder="What's this for?"
                          className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-purple-500/50 focus-visible:border-purple-500/50 transition-all"
                          disabled={mintMutation.isPending}
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <Label className="text-sm font-bold text-foreground/90">Priority</Label>
                      <div className="grid grid-cols-3 gap-2 p-1.5 rounded-lg bg-gradient-to-br from-background/80 to-background/40 border border-white/10">
                        {(["low", "medium", "high"] as const).map((level) => (
                          <button
                            key={level}
                            type="button"
                            onClick={() => setMintTip(level)}
                            disabled={mintMutation.isPending}
                            className={`h-11 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${mintTip === level
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

                  <DialogFooter className="p-6 pt-0">
                    <Button
                      className="w-full h-14 text-lg font-bold bg-gradient-to-r from-primary via-primary/90 to-primary shadow-2xl shadow-primary/30 hover:shadow-primary/40 transition-all hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={() =>
                        mintMutation.mutate({
                          amount: mintAmount,
                          memo: mintMemo || undefined,
                          proverTip: mintTip,
                        })
                      }
                      disabled={!mintAmount || mintMutation.isPending}
                    >
                      <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                      <span className="relative z-10 flex items-center gap-2">
                        <Coins className="w-5 h-5" />
                        {mintMutation.isPending ? "Processing..." : "Submit Mint Order"}
                      </span>
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-3">
              <h4 className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-1">Network Info</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 text-xs">
                  <span className="text-muted-foreground">Peer Count</span>
                  <span className="font-medium font-mono">1</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-lg bg-white/5 text-xs">
                  <span className="text-muted-foreground">L1 Node</span>
                  <span className="font-medium font-mono text-[10px] truncate max-w-[120px]">localhost:9944</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog
        open={selectedTxId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedTxId(null);
            setTvkOpen(false);
            setTvkPassword("");
            setTvkRunning(false);
            setTvk(null);
          }
        }}
      >
        <DialogContent className="max-w-md border-none bg-white dark:bg-slate-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 pb-4 border-b border-black/5 dark:border-white/5">
            <div className="flex items-center gap-4">
              <div className={`p-4 rounded-2xl ${selectedTx?.direction === "incoming" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                {selectedTx?.direction === "incoming" ? (
                  <ArrowDownLeft className={`w-8 h-8 ${selectedTx?.direction === "incoming" ? "text-emerald-500" : "text-primary"}`} />
                ) : (
                  <ArrowUpRight className="w-8 h-8 text-primary" />
                )}
              </div>
              <div>
                <DialogTitle className="text-2xl font-bold">
                  {selectedTx?.direction === "incoming" ? "Received" : "Sent"}
                </DialogTitle>
                <DialogDescription className="flex items-center gap-1.5 mt-0.5">
                  {getStatusIcon(selectedTx?.status || "")}
                  <span className="capitalize">{selectedTx?.status}</span>
                  <span className="text-border mx-1">•</span>
                  {selectedTx ? new Date(selectedTx.timestamp * 1000).toLocaleString() : ""}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          {selectedTx ? (
            <div className="space-y-5 p-6">
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Amount</div>
                  <div className={`text-xl font-bold ${selectedTx.direction === "incoming" ? "text-emerald-500" : "text-foreground"}`}>
                    {selectedTx.direction === "incoming" ? "+" : ""}{selectedTx.amount}
                  </div>
                </div>
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 space-y-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">Network Fee</div>
                  <div className="text-xl font-bold">{selectedTx.fee}</div>
                </div>
              </div>

              <div className="space-y-2">
                <Label className="text-muted-foreground text-[10px] uppercase font-bold px-1">Transaction ID</Label>
                <div className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                  <div className="flex-1 min-w-0 font-mono text-xs break-all leading-relaxed">
                    {selectedTx.id}
                  </div>
                  <CopyButton
                    value={selectedTx.id}
                    label=""
                    className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                  />
                </div>
              </div>

              {selectedTx.memo && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-[10px] uppercase font-bold px-1">Memo</Label>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-white/5 italic text-sm border-l-2 border-primary/30">
                    "{selectedTx.memo}"
                  </div>
                </div>
              )}

              {/* Recipient Address (for outgoing transactions) */}
              {selectedTx.direction === "outgoing" && selectedTx.recipientAddress && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-[10px] uppercase font-bold px-1">Recipient</Label>
                  <div className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                    <div className="flex-1 min-w-0 font-mono text-xs break-all leading-relaxed">
                      {selectedTx.recipientAddress}
                    </div>
                    <CopyButton
                      value={selectedTx.recipientAddress}
                      label=""
                      className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                    />
                  </div>
                </div>
              )}

              {/* Sender Address (for incoming transactions) */}
              {selectedTx.direction === "incoming" && selectedTx.senderAddress && (
                <div className="space-y-2">
                  <Label className="text-muted-foreground text-[10px] uppercase font-bold px-1">Sender</Label>
                  <div className="group relative flex items-center gap-3 p-3 rounded-xl bg-slate-50 dark:bg-white/5 ring-1 ring-slate-200 dark:ring-white/10">
                    <div className="flex-1 min-w-0 font-mono text-xs break-all leading-relaxed">
                      {selectedTx.senderAddress}
                    </div>
                    <CopyButton
                      value={selectedTx.senderAddress}
                      label=""
                      className="shrink-0 h-8 w-8 rounded-lg bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"
                    />
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <Button
                  variant="outline"
                  className="flex-1 border-none ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5"
                  onClick={() => setTvkOpen(true)}
                >
                  <Shield className="w-4 h-4 mr-2 text-primary" />
                  View Key (TVK)
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 border-none ring-1 ring-slate-200 dark:ring-white/10 bg-slate-50 dark:bg-white/5"
                  disabled
                >
                  <ExternalLink className="w-4 h-4 mr-2" />
                  Explorer
                </Button>
              </div>
            </div>
          ) : (
            <div className="py-12 flex flex-col items-center justify-center text-muted-foreground">
              <Info className="w-12 h-12 opacity-10 mb-2" />
              <p>No transaction selected</p>
            </div>
          )}

          <Dialog
            open={tvkOpen}
            onOpenChange={(open) => {
              setTvkOpen(open);
              if (!open) {
                setTvkPassword("");
                setTvkRunning(false);
                setTvk(null);
              }
            }}
          >
            <DialogContent className="max-w-sm border-none bg-white dark:bg-slate-950 shadow-3xl ring-1 ring-black/10 dark:ring-white/20 p-0 overflow-hidden">
              <DialogHeader>
                <div className="w-10 h-10 rounded-xl bg-primary/20 flex items-center justify-center mb-2">
                  <Key className="text-primary w-5 h-5" />
                </div>
                <DialogTitle>Export Transaction View Key</DialogTitle>
                <DialogDescription>
                  Decrypted transaction details require your master password.
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label>Password</Label>
                  <Input
                    type="password"
                    value={tvkPassword}
                    onChange={(e) => setTvkPassword(e.currentTarget.value)}
                    placeholder="Enter wallet password"
                    className="h-12 bg-white/5"
                  />
                </div>

                {tvk ? (
                  <div className="space-y-2 animate-in fade-in slide-in-from-top-2">
                    <Label className="text-[10px] uppercase font-bold">Generated TVK</Label>
                    <div className="flex items-start gap-3 p-3 rounded-xl bg-emerald-500/5 ring-1 ring-emerald-500/20">
                      <div className="flex-1 break-all font-mono text-[10px] text-emerald-500 leading-tight">
                        {tvk}
                      </div>
                      <CopyButton
                        value={tvk}
                        label=""
                        className="shrink-0 h-6 w-6 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-500"
                      />
                    </div>
                  </div>
                ) : null}
              </div>

              <DialogFooter className="gap-2 sm:gap-0">
                <Button variant="ghost" onClick={() => setTvkOpen(false)} disabled={tvkRunning}>
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-primary shadow-lg shadow-primary/20"
                  onClick={async () => {
                    if (!selectedTx) return;
                    try {
                      setTvkRunning(true);
                      const res = await api.exportTvk(selectedTx.id, tvkPassword);
                      setTvk(res.tvk);
                      toast.success("TVK generated");
                    } catch (e) {
                      toast.error(e instanceof Error ? e.message : "Failed to export TVK");
                    } finally {
                      setTvkRunning(false);
                    }
                  }}
                  disabled={tvkRunning || tvkPassword.trim().length === 0 || !selectedTx || !!tvk}
                >
                  {tvkRunning ? "Deciphering..." : tvk ? "Exported" : "Reveal Key"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </DialogContent>
      </Dialog>
    </div >
  );
}
