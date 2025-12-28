// L2 Bridge page - handles L2 -> L1 withdrawals
// Re-exports Bridge component with withdraw-focused configuration

import BridgePage from "../Bridge";

export default function L2BridgePage() {
    return <BridgePage defaultTab="withdraw" />;
}
