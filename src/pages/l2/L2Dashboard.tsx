import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../lib/tauri";
import { useWalletStore } from "../../state/walletStore";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "../../components/ui/card";
import CopyButton from "../../components/CopyButton";
import { Button } from "../../components/ui/button";
import {
    RefreshCw,
    Wallet,
    Send,
    ArrowRightLeft,
} from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function L2DashboardPage() {
    const qc = useQueryClient();
    const navigate = useNavigate();
    const l2ActiveAccountIndex = useWalletStore((s) => s.l2ActiveAccountIndex);

    const l2BalanceQuery = useQuery({
        queryKey: ["l2Balance", l2ActiveAccountIndex],
        queryFn: api.getL2Balance,
        refetchInterval: 10000,
    });

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-purple-500" />
                        L2 EVM Dashboard
                    </h1>
                    <p className="text-sm text-muted-foreground">Fast EVM transactions on PRAPH L2</p>
                </div>
                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => qc.invalidateQueries({ queryKey: ["l2Balance"] })}
                    className="bg-background/50 backdrop-blur-sm"
                >
                    <RefreshCw className={`w-4 h-4 mr-2 ${l2BalanceQuery.isFetching ? 'animate-spin' : ''}`} />
                    Refresh
                </Button>
            </div>

            {/* L2 Address Card */}
            {l2BalanceQuery.data?.address && (
                <Card className="bg-purple-500/5 backdrop-blur-sm border-none shadow-md ring-1 ring-purple-500/20">
                    <CardContent className="py-4 flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                            <div className="p-2 rounded-lg bg-purple-500/20">
                                <Wallet className="w-5 h-5 text-purple-500" />
                            </div>
                            <div>
                                <div className="text-xs text-muted-foreground font-medium">L2 Address (EVM)</div>
                                <div className="font-mono text-sm">{l2BalanceQuery.data.address}</div>
                            </div>
                        </div>
                        <CopyButton value={l2BalanceQuery.data.address} label="" className="h-8 w-8 bg-purple-500/10 hover:bg-purple-500/20 border-none text-purple-500" />
                    </CardContent>
                </Card>
            )}

            {/* Balance Cards */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card className="bg-purple-500/5 backdrop-blur-sm border-none shadow-md ring-1 ring-purple-500/10 transition-transform hover:scale-[1.02]">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardDescription className="font-medium">Native PRAF (Gas)</CardDescription>
                        <Wallet className="w-4 h-4 text-purple-500" />
                    </CardHeader>
                    <CardContent>
                        <CardTitle className="text-2xl font-bold">
                            {l2BalanceQuery.data?.praf ?? "-"} <span className="text-sm font-normal text-muted-foreground">PRAF</span>
                        </CardTitle>
                    </CardContent>
                </Card>


            </section>

            {/* Quick Actions */}
            <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Card className="bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5 cursor-pointer hover:ring-purple-500/30 transition-all"
                    onClick={() => navigate("/l2/send")}>
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-purple-500/20">
                            <Send className="w-6 h-6 text-purple-500" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Send L2 Assets</CardTitle>
                            <CardDescription>Transfer PRAF or wPRAF on L2</CardDescription>
                        </div>
                    </CardContent>
                </Card>

                <Card className="bg-background/50 backdrop-blur-sm border-none shadow-lg ring-1 ring-white/5 cursor-pointer hover:ring-purple-500/30 transition-all"
                    onClick={() => navigate("/bridge")}>
                    <CardContent className="p-6 flex items-center gap-4">
                        <div className="p-3 rounded-xl bg-primary/20">
                            <ArrowRightLeft className="w-6 h-6 text-primary" />
                        </div>
                        <div>
                            <CardTitle className="text-lg">Bridge</CardTitle>
                            <CardDescription>Transfer between L1 and L2</CardDescription>
                        </div>
                    </CardContent>
                </Card>
            </section>

            {/* Info Card */}
            <Card className="bg-purple-500/5 border-purple-500/20">
                <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                        <strong className="text-purple-500">L2 EVM</strong> provides fast, low-cost transactions.
                        Use <strong>PRAF</strong> for gas fees and <strong>wPRAF</strong> for DeFi interactions.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
