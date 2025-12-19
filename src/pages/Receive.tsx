import { useState } from "react";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import CopyButton from "../components/CopyButton";

export default function ReceivePage() {
  const address = "praph1q9d2...demo-address";
  const [qrOpen, setQrOpen] = useState(false);

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
              <CopyButton value={address} label="Copy" successMessage="Copied address" />
              <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">Show QR</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Receive QR</DialogTitle>
                    <DialogDescription>
                      QR generation will be wired to backend address derivation.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="flex items-center justify-center rounded-md border border-border bg-muted/30 p-6">
                      <div className="text-sm text-muted-foreground">QR placeholder</div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="break-all font-mono text-xs">{address}</div>
                    </div>
                    <CopyButton value={address} label="Copy address" successMessage="Copied address" />
                  </div>
                </DialogContent>
              </Dialog>
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
