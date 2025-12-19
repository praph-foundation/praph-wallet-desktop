import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";

export default function ReceivePage() {
  const address = "praph1q9d2...demo-address";

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Receive</div>
        <div className="mt-1 text-sm text-muted-foreground">
          Address generation and QR export will be wired to the backend.
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your address</CardTitle>
          <CardDescription>Share this address to receive funds.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="break-all font-mono text-xs">{address}</div>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(address);
                    toast.success("Copied address");
                  } catch {
                    toast.error("Failed to copy");
                  }
                }}
              >
                Copy
              </Button>
              <Button variant="outline" disabled>
                Show QR
              </Button>
            </div>

            <div className="text-xs text-muted-foreground">
              This is a UI placeholder address until backend address derivation is connected.
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
