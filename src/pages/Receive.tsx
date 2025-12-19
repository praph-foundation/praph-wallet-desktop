import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/tauri";
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
  const [qrOpen, setQrOpen] = useState(false);

  const addressQuery = useQuery({
    queryKey: ["receiveAddress"],
    queryFn: api.generateAddress,
  });

  const address = addressQuery.data?.address ?? "";
  const hasAddress = Boolean(address);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Receive</div>
        {addressQuery.isLoading ? (
          <div className="mt-1 text-sm text-muted-foreground">Loading address...</div>
        ) : addressQuery.isError ? (
          <div className="mt-1 text-sm text-muted-foreground">Unable to load address.</div>
        ) : (
          <div className="mt-1 text-sm text-muted-foreground">Share this address to receive funds.</div>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Your address</CardTitle>
          <CardDescription>Share this address to receive funds.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="break-all font-mono text-xs">{hasAddress ? address : "—"}</div>
            </div>

            <div className="flex gap-2">
              {hasAddress ? (
                <CopyButton value={address} label="Copy" successMessage="Copied address" />
              ) : (
                <Button disabled>Copy</Button>
              )}
              <Dialog open={qrOpen} onOpenChange={setQrOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline" disabled={!hasAddress}>
                    Show QR
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Receive QR</DialogTitle>
                    <DialogDescription>
                      QR generation will be wired in a follow-up.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-3">
                    <div className="flex items-center justify-center rounded-md border border-border bg-muted/30 p-6">
                      <div className="text-sm text-muted-foreground">QR placeholder</div>
                    </div>
                    <div className="rounded-md border border-border bg-muted/30 p-3">
                      <div className="break-all font-mono text-xs">{hasAddress ? address : "—"}</div>
                    </div>
                    {hasAddress ? (
                      <CopyButton value={address} label="Copy address" successMessage="Copied address" />
                    ) : (
                      <Button disabled>Copy address</Button>
                    )}
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
