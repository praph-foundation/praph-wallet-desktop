import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import { useWalletStore } from "../state/walletStore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "../components/ui/dialog";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { Switch } from "../components/ui/switch";

export default function SettingsPage() {
  const qc = useQueryClient();
  const helperServiceUrl = useWalletStore((s) => s.helperServiceUrl);
  const setHelperServiceUrl = useWalletStore((s) => s.setHelperServiceUrl);
  const theme = useWalletStore((s) => s.theme);
  const setTheme = useWalletStore((s) => s.setTheme);
  const setSyncStatus = useWalletStore((s) => s.setSyncStatus);

  const [url, setUrl] = useState(helperServiceUrl);
  const [rescanOpen, setRescanOpen] = useState(false);
  const [rescanRunning, setRescanRunning] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setHelperServiceUrl(s.helperServiceUrl);
        setUrl(s.helperServiceUrl);
      })
      .catch(() => {
      });
    return () => {
      cancelled = true;
    };
  }, [setHelperServiceUrl]);

  return (
    <div className="space-y-6">
      <div>
        <div className="text-2xl font-semibold">Settings</div>
        <div className="mt-1 text-sm text-muted-foreground">Security and connectivity.</div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Helper Service</CardTitle>
          <CardDescription>This URL will be used for rescans and note sync.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="space-y-2 md:col-span-2">
              <Label>Helper service URL</Label>
              <Input
                value={url}
                onChange={(e) => setUrl(e.currentTarget.value)}
                placeholder="https://helper.yourdomain.tld"
              />
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={async () => {
                  try {
                    await api.setHelperServiceUrl(url);
                    setHelperServiceUrl(url);
                    toast.success("Saved helper service URL");
                  } catch {
                    toast.error("Failed to save helper service URL");
                  }
                }}
              >
                Save
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Theme</CardTitle>
          <CardDescription>Choose between light and dark mode.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="space-y-1">
              <div className="text-sm font-medium">Dark mode</div>
              <div className="text-xs text-muted-foreground">Applies immediately and is saved locally.</div>
            </div>
            <Switch
              checked={theme === "dark"}
              onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Rescan</CardTitle>
          <CardDescription>Use when your balance looks incorrect.</CardDescription>
        </CardHeader>
        <CardContent>
          <Dialog open={rescanOpen} onOpenChange={setRescanOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" disabled={rescanRunning}>
                Trigger rescan
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Confirm rescan</DialogTitle>
                <DialogDescription>
                  This can take some time. It will rescan notes using the configured helper service.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRescanOpen(false)} disabled={rescanRunning}>
                  Cancel
                </Button>
                <Button
                  onClick={async () => {
                    try {
                      setSyncStatus("syncing", "Rescanning...");
                      setRescanRunning(true);
                      await api.scanNotes({ fullRescan: true });
                      await qc.invalidateQueries({ queryKey: ["balance"] });
                      await qc.invalidateQueries({ queryKey: ["transactions"] });
                      toast.success("Rescan completed");
                      setSyncStatus("idle", null);
                      setRescanOpen(false);
                    } catch {
                      toast.error("Rescan failed");
                      setSyncStatus("error", "Rescan failed");
                    } finally {
                      setRescanRunning(false);
                    }
                  }}
                  disabled={rescanRunning}
                >
                  {rescanRunning ? "Rescanning..." : "Confirm"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Key export</CardTitle>
          <CardDescription>
            Spending key must never be exposed to the frontend. Viewing keys can be shown after password confirmation.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Export viewing keys (coming soon)
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
