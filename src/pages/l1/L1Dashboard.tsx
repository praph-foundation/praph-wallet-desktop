import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, MintDevFaucetParams } from "../../lib/tauri";
import { toast } from "sonner";
import { useWalletStore } from "../../state/walletStore";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "../../components/ui/card";
import { Badge } from "../../components/ui/badge";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../../components/ui/dialog";
import CopyButton from "../../components/CopyButton";
import { Button } from "../../components/ui/button";
import { Input } from "../../components/ui/input";
import { Label } from "../../components/ui/label";
import {
    ArrowDownLeft,
    ArrowUpRight,
    RefreshCw,
    Clock,
    CheckCircle2,
    XCircle,
    Shield,
    Coins,
    Inbox,
    History,
} from "lucide-react";

export default function L1DashboardPage() {
    const qc = useQueryClient();
    const activeAccountIndex = useWalletStore((s) => s.activeAccountIndex);
    const [selectedTxId, setSelectedTxId] = useState<string | null>(null);

    const [mintOpen, setMintOpen] = useState(false);
    const [mintAmount, setMintAmount] = useState("");
    const [mintMemo, setMintMemo] = useState("");
    const [mintTip] = useState<MintDevFaucetParams["proverTip"]>("low");

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
            const msg = e instanceof Error ? e.message : "Mint failed";
            toast.error(msg);
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
        if (status === "failed") return <XCircle className="w-3 h-3 text-destructive" />;
        return null;
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-emerald-500" />
                        L1 Asset Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">Private ZK-UTXO transactions</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => qc.invalidateQueries()}
                    className="bg-background/50 backdrop-blur-sm"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${balanceQuery.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* Balance Cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {[
                    { label: "Total Balance", value: balanceQuery.data?.total, icon: Coins, color: "text-emerald-500" },
                    { label: "Confirmed", value: balanceQuery.data?.confirmed, icon: CheckCircle2, color: "text-emerald-500" },
                    { label: "Pending", value: balanceQuery.data?.pending, icon: Clock, color: "text-amber-500" },
                    { label: "Unspent Notes", value: balanceQuery.data?.unspent, icon: Inbox, color: "text-blue-500" },
                ].map((stat, i) => (
                    <Card key={i} className="bg-emerald-500/5 backdrop-blur-sm border-none shadow-md ring-1 ring-emerald-500/10 transition-transform hover:scale-[1.02]">
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

            {/* Transaction History */}
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <Card className="lg:col-span-2 bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5 overflow-hidden">
                    <CardHeader className="flex flex-row items-center justify-between border-b border-white/5 bg-white/5 pb-4">
                        <div className="space-y-1">
                            <CardTitle className="flex items-center gap-2">
                                <History className="w-5 h-5 text-emerald-500" />
                                Transaction History
                            </CardTitle>
                            <CardDescription>Recent L1 ZK-UTXO activity</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="divide-y divide-white/5 max-h-[400px] overflow-y-auto">
                            {(txsQuery.data ?? []).length > 0 ? (
                                (txsQuery.data ?? []).map((tx: any) => (
                                    <button
                                        key={tx.id}
                                        type="button"
                                        className="flex w-full items-center justify-between p-4 text-left transition-colors hover:bg-white/5"
                                        onClick={() => setSelectedTxId(tx.id)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`p-2 rounded-full ${tx.direction === "incoming" ? "bg-emerald-500/10" : "bg-primary/10"}`}>
                                                {tx.direction === "incoming" ? (
                                                    <ArrowDownLeft className="w-5 h-5 text-emerald-500" />
                                                ) : (
                                                    <ArrowUpRight className="w-5 h-5 text-primary" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <div className="text-sm font-semibold truncate">
                                                    {tx.direction === "incoming" ? "Received PRAF" : "Sent PRAF"}
                                                </div>
                                                <div className="mt-0.5 text-xs text-muted-foreground">
                                                    {new Date(tx.timestamp * 1000).toLocaleString(undefined, {
                                                        month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                                    })}
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
                                <div className="py-16 flex flex-col items-center justify-center text-center">
                                    <Inbox className="w-8 h-8 text-muted-foreground opacity-20 mb-3" />
                                    <p className="text-sm font-medium">No transactions yet</p>
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Dev Tools */}
                <Card className="bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5">
                    <CardHeader className="border-b border-white/5 bg-white/5 pb-4">
                        <CardTitle className="flex items-center gap-2">
                            <Shield className="w-5 h-5 text-emerald-500" />
                            Dev Tools
                        </CardTitle>
                        <CardDescription>Testnet utilities</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6 space-y-4">
                        <div className="p-4 rounded-xl border border-dashed border-emerald-500/20 bg-emerald-500/5">
                            <div className="flex items-center gap-3 mb-3">
                                <Coins className="w-5 h-5 text-emerald-500" />
                                <div className="text-sm font-bold">Dev Faucet</div>
                            </div>
                            <Button
                                className="w-full bg-emerald-500 hover:bg-emerald-600"
                                onClick={() => setMintOpen(true)}
                            >
                                Mint Test PRAF
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>

            {/* Mint Dialog */}
            <Dialog open={mintOpen} onOpenChange={setMintOpen}>
                <DialogContent className="max-w-md border border-emerald-500/30 bg-white dark:bg-zinc-900 shadow-2xl ring-1 ring-emerald-500/20 p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-emerald-50 dark:bg-emerald-500/10 border-b border-emerald-200 dark:border-emerald-500/20">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-500/20 text-emerald-600 dark:text-emerald-500">
                                <Coins className="w-5 h-5" />
                            </div>
                            Mint Test PRAF
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium">Create test tokens from the dev faucet</DialogDescription>
                    </DialogHeader>
                    <div className="p-6 space-y-6">
                        <div className="space-y-3">
                            <Label htmlFor="mint-amount" className="text-sm font-bold px-1">Amount (PRAF)</Label>
                            <div className="relative group">
                                <Input
                                    id="mint-amount"
                                    type="number"
                                    value={mintAmount}
                                    onChange={(e) => setMintAmount(e.target.value)}
                                    placeholder="100"
                                    className="h-12 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus-visible:ring-emerald-500 transition-all font-mono text-lg"
                                />
                            </div>
                        </div>
                        <div className="space-y-3">
                            <Label htmlFor="mint-memo" className="text-sm font-bold px-1">Memo (optional)</Label>
                            <Input
                                id="mint-memo"
                                value={mintMemo}
                                onChange={(e) => setMintMemo(e.target.value)}
                                placeholder="Test mint"
                                className="h-12 bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/10 focus-visible:ring-emerald-500 transition-all"
                            />
                        </div>
                        <div className="p-4 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/20 text-xs text-zinc-600 dark:text-muted-foreground leading-relaxed">
                            <span className="font-bold text-emerald-600 dark:text-emerald-500">Dev Faucet:</span> This will create test PRAF tokens in your wallet for development purposes.
                        </div>
                    </div>
                    <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-0">
                        <Button variant="outline" onClick={() => setMintOpen(false)} className="flex-1 h-12">
                            Cancel
                        </Button>
                        <Button
                            onClick={() => mintMutation.mutate({ amount: mintAmount, memo: mintMemo, proverTip: mintTip })}
                            disabled={!mintAmount || mintMutation.isPending}
                            className="flex-1 h-12 bg-emerald-500 hover:bg-emerald-600 font-bold shadow-lg shadow-emerald-500/20"
                        >
                            {mintMutation.isPending ? (
                                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Minting...</>
                            ) : (
                                <><Coins className="w-4 h-4 mr-2" /> Mint PRAF</>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Transaction Detail Dialog */}
            <Dialog open={!!selectedTxId} onOpenChange={() => setSelectedTxId(null)}>
                <DialogContent className="max-w-lg border border-zinc-200 dark:border-white/20 bg-white dark:bg-zinc-900 shadow-2xl ring-1 ring-zinc-200 dark:ring-white/10 p-0 overflow-hidden">
                    <DialogHeader className="p-6 bg-zinc-50 dark:bg-white/5 border-b border-zinc-200 dark:border-white/5">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${selectedTx?.direction === "incoming" ? "bg-emerald-500/20 text-emerald-500" : "bg-primary/20 text-primary"}`}>
                                {selectedTx?.direction === "incoming" ? (
                                    <ArrowDownLeft className="w-5 h-5" />
                                ) : (
                                    <ArrowUpRight className="w-5 h-5" />
                                )}
                            </div>
                            Transaction Details
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium">
                            {selectedTx?.direction === "incoming" ? "Received" : "Sent"} on {selectedTx && new Date(selectedTx.timestamp * 1000).toLocaleString()}
                        </DialogDescription>
                    </DialogHeader>
                    {selectedTx && (
                        <div className="p-6 space-y-6">
                            {/* Amount Card */}
                            <div className="p-6 rounded-2xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 space-y-2 text-center">
                                <div className="text-sm font-bold uppercase tracking-widest text-muted-foreground opacity-60">Amount</div>
                                <div className={`text-4xl font-black ${selectedTx.direction === "incoming" ? "text-emerald-500" : "text-foreground"}`}>
                                    {selectedTx.direction === "incoming" ? "+" : ""}{selectedTx.amount}
                                </div>
                            </div>

                            {/* Status */}
                            <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5">
                                <div className="text-sm font-semibold">Status</div>
                                <Badge variant={statusBadgeVariant(selectedTx.status)} className="h-7 px-3 flex gap-2 items-center">
                                    {getStatusIcon(selectedTx.status)}
                                    <span className="font-bold">{selectedTx.status}</span>
                                </Badge>
                            </div>

                            {/* Transaction Fee - only for outgoing */}
                            {selectedTx.direction === "outgoing" && (
                                <div className="flex items-center justify-between p-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5">
                                    <div className="text-sm font-semibold">Transaction Fee</div>
                                    <div className="text-sm font-mono">{selectedTx.fee || "0 PRAF"}</div>
                                </div>
                            )}

                            {/* Transaction ID */}
                            <div className="space-y-2">
                                <div className="text-sm font-semibold px-1">Transaction ID</div>
                                <div className="p-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 font-mono text-xs break-all group relative">
                                    <div className="flex items-center justify-between gap-2">
                                        <span className="flex-1 opacity-70">{selectedTx.id}</span>
                                        <CopyButton value={selectedTx.id} label="" className="h-8 w-8 shrink-0 bg-transparent hover:bg-white/10 border-none" />
                                    </div>
                                </div>
                            </div>

                            {/* Memo if exists */}
                            {selectedTx.memo && (
                                <div className="space-y-2">
                                    <div className="text-sm font-semibold px-1">Memo</div>
                                    <div className="p-4 rounded-xl bg-zinc-50 dark:bg-white/5 border border-zinc-200 dark:border-white/5 text-sm">
                                        {selectedTx.memo}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </div>
    );
}
