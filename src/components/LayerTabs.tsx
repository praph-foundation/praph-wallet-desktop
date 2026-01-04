import { useWalletStore, type ActiveLayer } from "../state/walletStore";
import { useNavigate } from "react-router-dom";

interface LayerTabsProps {
    className?: string;
}

export default function LayerTabs({ className = "" }: LayerTabsProps) {
    const activeLayer = useWalletStore((s) => s.activeLayer);
    const setActiveLayer = useWalletStore((s) => s.setActiveLayer);
    const navigate = useNavigate();

    const handleLayerChange = (layer: ActiveLayer) => {
        setActiveLayer(layer);
        // Navigate to layer's default page
        if (layer === "l1") {
            navigate("/l1");
        } else {
            navigate("/l2");
        }
    };

    return (
        <div className={`flex gap-1 p-1 rounded-xl bg-muted/50 border border-border ${className}`}>
            <button
                type="button"
                onClick={() => handleLayerChange("l1")}
                className={`flex-1 px-4 py-1 text-xl font-semibold rounded-lg transition-all ${activeLayer === "l1"
                    ? "bg-emerald-600 text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    }`}
            >
                <span className="flex items-center justify-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${activeLayer === "l1" ? "bg-white" : "bg-emerald-500"}`} />
                    L1 Assets
                </span>
            </button>
            <button
                type="button"
                onClick={() => handleLayerChange("l2")}
                className={`flex-1 px-4 py-1 text-xl font-semibold rounded-lg transition-all ${activeLayer === "l2"
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-muted-foreground hover:text-foreground hover:bg-background/50"
                    }`}
            >
                <span className="flex items-center justify-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${activeLayer === "l2" ? "bg-white" : "bg-purple-500"}`} />
                    L2 EVM
                </span>
            </button>
        </div>
    );
}
