// L1 Bridge page - handles L1 -> L2 deposits
// Re-exports Bridge component with deposit-focused configuration

import BridgePage from "../Bridge";

export default function L1BridgePage() {
    return <BridgePage defaultTab="deposit" />;
}
