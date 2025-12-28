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
import { RefreshCw, Wallet } from "lucide-react";

export default function L2ReceivePage() {
    const qc = useQueryClient();
    const l2ActiveAccountIndex = useWalletStore((s) => s.l2ActiveAccountIndex);

    const l2BalanceQuery = useQuery({
        queryKey: ["l2Balance", l2ActiveAccountIndex],
        queryFn: api.getL2Balance,
        refetchInterval: 10000,
    });

    const l2Address = l2BalanceQuery.data?.address ?? "";

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full bg-purple-500" />
                        Receive L2 Assets
                    </h1>
                    <p className="text-sm text-muted-foreground">Share your L2 EVM address to receive PRAF or wPRAF</p>
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

            {/* Large Address Display */}
            <Card className="bg-purple-500/5 backdrop-blur-sm border-none shadow-lg ring-1 ring-purple-500/20">
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Wallet className="w-5 h-5 text-purple-500" />
                        Your L2 EVM Address
                    </CardTitle>
                    <CardDescription>Share this address to receive L2 assets</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="p-6 bg-background/80 rounded-xl border border-purple-500/20">
                        <div className="font-mono text-lg break-all text-center leading-relaxed">
                            {l2Address || "Loading..."}
                        </div>
                    </div>
                    <CopyButton
                        value={l2Address}
                        label="Copy Address"
                        className="w-full h-12 bg-purple-500 hover:bg-purple-600 text-white font-bold"
                    />
                </CardContent>
            </Card>

            {/* Info */}
            <Card className="bg-purple-500/5 border-purple-500/20">
                <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                        <strong className="text-purple-500">Note:</strong> This address can receive both native <strong>PRAF</strong> (for gas) and <strong>wPRAF</strong> (ERC-20 token) on PRAPH L2.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
