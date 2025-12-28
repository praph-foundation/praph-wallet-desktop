import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { api, L2SendParams } from "../lib/tauri";
import { toast } from "sonner";
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
    Send as SendIcon,
    ArrowRight,
    AlertTriangle,
    Wallet,
    Loader2,
    CheckCircle2,
    Coins
} from "lucide-react";

export default function L2SendPage() {
    const qc = useQueryClient();

    const [to, setTo] = useState("");
    const [amount, setAmount] = useState("");
    const [token, setToken] = useState<"praf" | "wpraf">("praf");
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [txId, setTxId] = useState<string | null>(null);

    const isValidAddress = useMemo(() => {
        return to.startsWith("0x") && to.length === 42;
    }, [to]);

    const isValidAmount = useMemo(() => {
        const val = parseFloat(amount);
        return !isNaN(val) && val > 0;
    }, [amount]);

    const sendMutation = useMutation({
        mutationFn: async (params: L2SendParams) => {
            const res = await api.sendL2Transaction(params);
            return res;
        },
        onSuccess: (data) => {
            setTxId(data.txHash);
            qc.invalidateQueries({ queryKey: ["l2Balance"] });
            toast.success("L2 Transaction sent successfully");
        },
        onError: (e) => {
            const msg = e instanceof Error ? e.message : "Failed to send L2 transaction";
            toast.error(msg);
        },
    });

    const loading = sendMutation.isPending;
    const canSubmit = Boolean(to && amount && isValidAddress && isValidAmount && !loading);
    const isDone = Boolean(txId);

    const resetForm = () => {
        setTo("");
        setAmount("");
        setToken("praf");
        setTxId(null);
        sendMutation.reset();
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-purple-500/10 shadow-inner">
                    <SendIcon className="w-8 h-8 text-purple-500" />
                </div>
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">Send L2 Assets</h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Fast and low-cost transfers on PRAPH L2 (EVM).
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
                <Card className="lg:col-span-3 border border-white/10 bg-gradient-to-br from-background/80 via-background/60 to-background/80 backdrop-blur-xl shadow-2xl overflow-hidden">
                    <CardHeader className="bg-gradient-to-r from-purple-500/10 via-purple-500/5 to-transparent border-b border-white/10 pb-6">
                        <CardTitle className="text-2xl font-bold bg-gradient-to-r from-white to-white/70 bg-clip-text text-transparent">Transaction Details</CardTitle>
                        <CardDescription className="text-sm text-muted-foreground/80">Enter the recipient L2 address (0x...) and amount below.</CardDescription>
                    </CardHeader>
                    <CardContent className="pt-8 space-y-6 px-6 pb-8">
                        <div className="space-y-6">
                            <div className="space-y-3">
                                <Label htmlFor="to" className="text-sm font-bold text-foreground/90 flex items-center gap-2">
                                    <Wallet className="w-4 h-4 text-purple-500" />
                                    Recipient Level 2 Address (0x...)
                                </Label>
                                <div className="relative group">
                                    <div className="absolute inset-0 bg-gradient-to-r from-purple-500/20 via-purple-500/10 to-transparent opacity-0 group-hover:opacity-100 rounded-lg transition-opacity pointer-events-none" />
                                    <Input
                                        id="to"
                                        value={to}
                                        onChange={(e) => setTo(e.target.value)}
                                        placeholder="0x..."
                                        className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-purple-500/50 focus-visible:border-purple-500/50 transition-all text-sm font-mono placeholder:text-muted-foreground/50"
                                        disabled={loading || isDone}
                                    />
                                    {to && !isValidAddress && (
                                        <p className="mt-2 px-1 text-xs text-red-500 flex items-center gap-1.5 font-semibold">
                                            <AlertTriangle className="w-3.5 h-3.5" /> Invalid EVM address format
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
                                            className="h-14 bg-white/5 border border-white/10 ring-0 focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:border-emerald-500/50 pr-4 text-lg font-semibold transition-all"
                                            disabled={loading || isDone}
                                        />
                                    </div>
                                </div>

                                <div className="space-y-3">
                                    <Label className="text-sm font-bold text-foreground/90">Token</Label>
                                    <div className="grid grid-cols-2 gap-2 p-1.5 rounded-lg bg-gradient-to-br from-background/80 to-background/40 border border-white/10">
                                        {(["praf", "wpraf"] as const).map((t) => (
                                            <button
                                                key={t}
                                                type="button"
                                                onClick={() => setToken(t)}
                                                disabled={loading || isDone}
                                                className={`h-11 text-xs font-bold uppercase tracking-wider rounded-md transition-all ${token === t
                                                    ? "bg-gradient-to-r from-purple-500 to-purple-600 text-white shadow-lg shadow-purple-500/30 scale-[1.02]"
                                                    : "text-muted-foreground hover:bg-white/10 hover:text-foreground"
                                                    }`}
                                            >
                                                {t === "praf" ? "PRAF" : "wPRAF"}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="pt-4">
                            <Button
                                className="w-full h-16 text-lg font-bold bg-gradient-to-r from-purple-500 via-purple-600 to-purple-500 shadow-2xl shadow-purple-500/30 hover:shadow-purple-500/40 transition-all hover:scale-[1.02] active:scale-[0.98] group relative overflow-hidden disabled:opacity-50 disabled:cursor-not-allowed"
                                disabled={!canSubmit || loading || isDone}
                                onClick={() => setConfirmOpen(true)}
                            >
                                <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700" />
                                <span className="relative z-10 flex items-center gap-3">
                                    <SendIcon className="w-5 h-5" />
                                    Review L2 Transaction
                                    <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                                </span>
                            </Button>
                        </div>
                    </CardContent>
                </Card>

                <div className="lg:col-span-2 space-y-6">
                    <Card className="border border-purple-500/20 bg-gradient-to-br from-purple-500/10 via-purple-500/5 to-transparent backdrop-blur-lg shadow-xl">
                        <CardHeader className="pb-4 border-b border-purple-500/20">
                            <CardTitle className="text-sm flex items-center gap-2 text-purple-400 font-bold uppercase tracking-widest">
                                <Coins className="w-5 h-5" />
                                L2 Information
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="pt-5 space-y-5">
                            <div className="flex gap-3 p-3 rounded-lg bg-gradient-to-r from-purple-500/10 to-transparent border border-purple-500/10">
                                <Wallet className="w-5 h-5 text-purple-500 shrink-0 mt-0.5" />
                                <div className="text-xs leading-relaxed text-foreground/80 font-medium">
                                    This transaction occurs on <span className="font-bold text-purple-400">PRAPH L2 (EVM)</span>. Ensure the recipient is an EVM address.
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    {isDone && (
                        <Card className="border border-emerald-500/30 bg-gradient-to-br from-emerald-500/10 to-emerald-500/5 backdrop-blur-xl shadow-2xl animate-in zoom-in-95 duration-300">
                            <CardHeader className="pb-3 border-b border-emerald-500/20">
                                <CardTitle className="text-lg font-bold text-emerald-500 flex items-center gap-2">
                                    <CheckCircle2 className="w-5 h-5" />
                                    Sent Successfully
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="pt-4 space-y-4">
                                <div className="space-y-2">
                                    <div className="text-[10px] uppercase font-bold text-emerald-500/70 tracking-wider">Transaction Hash</div>
                                    <div className="flex items-center justify-between gap-2 p-3 rounded-lg bg-emerald-500/20 border border-emerald-500/20 font-mono text-xs break-all group">
                                        <span className="text-emerald-500 font-medium">{txId}</span>
                                        <CopyButton value={txId || ""} label="" className="h-7 w-7 shrink-0 bg-transparent hover:bg-emerald-500/20 border-none text-emerald-500" />
                                    </div>
                                </div>
                                <Button variant="outline" className="w-full h-12 border border-white/10 hover:bg-white/5 font-semibold" onClick={resetForm}>
                                    Send Another
                                </Button>
                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="max-w-lg border border-white/10 bg-[hsl(var(--background)/0.98)] backdrop-blur-2xl shadow-2xl p-0 overflow-hidden">
                    <DialogHeader className="p-6 pb-5 bg-gradient-to-r from-purple-500/15 via-purple-500/10 to-transparent border-b border-white/10">
                        <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                            <div className="p-2.5 rounded-xl bg-gradient-to-br from-purple-500/30 to-purple-500/20 border border-purple-500/30">
                                <SendIcon className="w-6 h-6 text-purple-500" />
                            </div>
                            Confirm L2 Send
                        </DialogTitle>
                        <DialogDescription className="text-sm font-medium text-muted-foreground/80 mt-2">
                            Review transaction details before sending to L2.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="p-6 space-y-5">
                        <div className="space-y-4">
                            <div className="p-5 rounded-2xl bg-gradient-to-br from-white/10 to-white/5 border border-white/10 space-y-3 shadow-lg">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70">Recipient</div>
                                <div className="break-all font-mono text-sm leading-relaxed p-3 rounded-lg bg-background/50 border border-white/5">
                                    {to}
                                </div>
                            </div>

                            <div className="p-5 rounded-2xl bg-gradient-to-br from-purple-500/10 to-purple-500/5 border border-purple-500/20 space-y-2 shadow-lg">
                                <div className="text-[10px] font-bold uppercase tracking-widest text-purple-500/70">Amount</div>
                                <div className="text-2xl font-black text-purple-500">{amount} <span className="text-sm text-purple-500/60 font-normal">{token.toUpperCase()}</span></div>
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
                            className="flex-1 h-12 bg-gradient-to-r from-purple-500 via-purple-600 to-purple-500 shadow-xl shadow-purple-500/30 font-bold hover:shadow-purple-500/40 transition-all"
                            onClick={() => {
                                setConfirmOpen(false);
                                sendMutation.mutate({
                                    to,
                                    amount,
                                    token,
                                });
                            }}
                            disabled={loading}
                        >
                            {loading ? (
                                <span className="flex items-center gap-2">
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Sending...
                                </span>
                            ) : (
                                <span className="flex items-center gap-2">
                                    <SendIcon className="w-4 h-4" />
                                    Confirm & Send
                                </span>
                            )}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
