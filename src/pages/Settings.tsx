import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "../lib/tauri";
import { useWalletStore } from "../state/walletStore";
import { toast } from "sonner";
import { Button } from "../components/ui/button";
import { Badge } from "../components/ui/badge";
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
import { Switch } from "../components/ui/switch";
import CopyButton from "../components/CopyButton";
import {
  Settings,
  RefreshCw,
  Key,
  ShieldAlert,
  Lock,
  Info,
  AlertTriangle,
  Zap,
  Server,
  Fingerprint,
  Loader2,
  Palette,
  Download
} from "lucide-react";

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

  const [exportOpen, setExportOpen] = useState(false);
  const [exportPassword, setExportPassword] = useState("");
  const [exportRunning, setExportRunning] = useState(false);
  const [viewingKeys, setViewingKeys] = useState<{ fvk: string; ivk: string; ovk: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getSettings()
      .then((s) => {
        if (cancelled) return;
        setHelperServiceUrl(s.helperServiceUrl);
        setUrl(s.helperServiceUrl);
      })
      .catch(() => { });
    return () => {
      cancelled = true;
    };
  }, [setHelperServiceUrl]);

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex items-center gap-3">
        <div className="p-3 rounded-2xl bg-primary/10 shadow-inner">
          <Settings className="w-8 h-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Configure your wallet security and network connectivity.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
            <CardHeader className="bg-white/5 border-b border-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Server className="w-5 h-5 text-primary" />
                Connectivity
              </CardTitle>
              <CardDescription>Configure the helper service for blockchain sync.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="helperUrl" className="text-sm font-semibold px-1">Helper Service URL</Label>
                <div className="flex gap-2">
                  <Input
                    id="helperUrl"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://..."
                    className="h-11 bg-white/5 border-none ring-1 ring-white/10 focus-visible:ring-primary font-mono text-xs"
                  />
                  <Button
                    onClick={async () => {
                      try {
                        await api.setHelperServiceUrl(url);
                        setHelperServiceUrl(url);
                        toast.success("Network settings updated");
                      } catch {
                        toast.error("Failed to update helper URL");
                      }
                    }}
                    className="h-11 px-6 font-bold"
                  >
                    Apply
                  </Button>
                </div>
                <p className="text-[10px] text-muted-foreground italic px-1">
                  The helper service provides the Merkle witnesses required for ZK transitions.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
            <CardHeader className="bg-white/5 border-b border-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Palette className="w-5 h-5 text-primary" />
                Appearance
              </CardTitle>
              <CardDescription>Customize the visual interface.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5">
                <div className="space-y-1">
                  <div className="text-sm font-bold">Dark Mode</div>
                  <div className="text-[10px] text-muted-foreground">Enable high-contrast dark interface.</div>
                </div>
                <Switch
                  checked={theme === "dark"}
                  onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
            <CardHeader className="bg-white/5 border-b border-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-primary" />
                Blockchain Tools
              </CardTitle>
              <CardDescription>Maintenance and synchronization controls.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold">Full Chain Rescan</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    If your balance doesn't match the PRAPH Explorer, a full rescan will rebuild your local note database from the Genesis block.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11 border-none ring-1 ring-white/10 hover:bg-primary/10 hover:text-primary transition-all font-bold"
                  onClick={() => setRescanOpen(true)}
                  disabled={rescanRunning}
                >
                  {rescanRunning ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCw className="w-4 h-4 mr-2" />}
                  Trigger Full Rescan
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-background/50 backdrop-blur-md shadow-xl ring-1 ring-white/5 overflow-hidden">
            <CardHeader className="bg-white/5 border-b border-white/5">
              <CardTitle className="text-lg flex items-center gap-2">
                <Download className="w-5 h-5 text-primary" />
                Account Metadata
              </CardTitle>
              <CardDescription>Export/import account names for cross-device sync.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-4">
              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold">Export Account Names</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Download a JSON file containing your account names. Import this on another device after wallet recovery.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11 border-none ring-1 ring-white/10 hover:bg-primary/10 hover:text-primary transition-all font-bold"
                  onClick={async () => {
                    try {
                      const accountsState = await api.getAccountsState();
                      const metadata = {
                        version: 1,
                        exportedAt: new Date().toISOString(),
                        accounts: accountsState.accounts.map(a => ({
                          index: a.index,
                          name: a.name,
                        })),
                      };

                      const jsonContent = JSON.stringify(metadata, null, 2);

                      // Use Tauri save dialog
                      const { save } = await import('@tauri-apps/plugin-dialog');
                      const { writeTextFile } = await import('@tauri-apps/plugin-fs');

                      const filePath = await save({
                        defaultPath: `praph-accounts-${Date.now()}.json`,
                        filters: [{
                          name: 'JSON',
                          extensions: ['json']
                        }]
                      });

                      if (filePath) {
                        await writeTextFile(filePath, jsonContent);
                        toast.success(`Saved to ${filePath}`);
                      }
                    } catch (e) {
                      console.error(e);
                      toast.error("Failed to export account metadata");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export Account Names
                </Button>
              </div>

              <div className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold">Import Account Names</h4>
                  <p className="text-[10px] text-muted-foreground leading-relaxed">
                    Restore account names from a previously exported JSON file.
                  </p>
                </div>
                <Button
                  variant="outline"
                  className="w-full h-11 border-none ring-1 ring-white/10 hover:bg-primary/10 hover:text-primary transition-all font-bold"
                  onClick={async () => {
                    try {
                      // Use Tauri open dialog
                      const { open } = await import('@tauri-apps/plugin-dialog');
                      const { readTextFile } = await import('@tauri-apps/plugin-fs');

                      const filePath = await open({
                        multiple: false,
                        filters: [{
                          name: 'JSON',
                          extensions: ['json']
                        }]
                      });

                      if (!filePath) return;

                      const text = await readTextFile(filePath as string);
                      const metadata = JSON.parse(text);

                      if (!metadata.accounts || !Array.isArray(metadata.accounts)) {
                        throw new Error("Invalid metadata format");
                      }

                      let importedCount = 0;
                      for (const acc of metadata.accounts) {
                        try {
                          await api.renameAccount(acc.index, acc.name);
                          importedCount++;
                        } catch {
                          // Account might not exist, skip
                        }
                      }

                      // Refresh accounts state
                      await api.getAccountsState();
                      qc.invalidateQueries({ queryKey: ["accounts"] });

                      toast.success(`Imported ${importedCount} account name(s)`);
                    } catch (e) {
                      console.error(e);
                      toast.error(e instanceof Error ? e.message : "Failed to import metadata");
                    }
                  }}
                >
                  <Download className="w-4 h-4 mr-2 rotate-180" />
                  Import Account Names
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="border-none bg-primary/5 shadow-xl ring-1 ring-primary/20 overflow-hidden">
            <CardHeader className="bg-primary/10 border-b border-primary/10">
              <CardTitle className="text-lg flex items-center gap-2 text-primary">
                <Fingerprint className="w-5 h-5" />
                Key Export
              </CardTitle>
              <CardDescription className="text-primary/70">Secure disclosure of your viewing keys.</CardDescription>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="p-5 rounded-2xl bg-background/80 border border-primary/20 space-y-4">
                <div className="flex gap-3">
                  <ShieldAlert className="w-5 h-5 text-primary shrink-0" />
                  <div className="space-y-1">
                    <h5 className="text-sm font-bold">Security Advisory</h5>
                    <p className="text-[10px] text-muted-foreground leading-relaxed">
                      Viewing keys (FVK, IVK, OVK) allow anyone to **see** your transactions but NOT spend your funds.
                      Never share your **Spending Key** (the mnemonic phrase).
                    </p>
                  </div>
                </div>
                <Button
                  className="w-full h-12 font-black shadow-lg shadow-primary/20"
                  onClick={() => setExportOpen(true)}
                >
                  <Key className="w-4 h-4 mr-2" />
                  Reveal Viewing Keys
                </Button>
              </div>

              <div className="space-y-3 opacity-60 grayscale scale-95 origin-top pointer-events-none">
                <div className="h-10 w-full bg-white/5 rounded-lg border border-white/5" />
                <div className="h-10 w-full bg-white/5 rounded-lg border border-white/5" />
                <div className="h-10 w-full bg-white/5 rounded-lg border border-white/5" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-amber-500/5 shadow-xl ring-1 ring-amber-500/10">
            <CardHeader className="pb-3 border-b border-amber-500/10">
              <CardTitle className="text-sm flex items-center gap-2 text-amber-500 font-bold uppercase tracking-widest">
                <Info className="w-4 h-4" />
                About Praph Wallet
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-4 space-y-3">
              <div className="flex justify-between text-[10px] font-medium">
                <span className="text-muted-foreground">Version</span>
                <span>0.1.0-alpha (PRAPH-Client 0.8.2)</span>
              </div>
              <div className="flex justify-between text-[10px] font-medium">
                <span className="text-muted-foreground">Network</span>
                <Badge variant="outline" className="text-[8px] h-4 bg-amber-500/10 text-amber-500 border-amber-500/20">TESTNET-4</Badge>
              </div>
              <div className="flex justify-between text-[10px] font-medium pt-2 border-t border-white/5">
                <span className="text-muted-foreground">Backend Engine</span>
                <span className="flex items-center gap-1">Rust / Halo2 <Zap className="w-3 h-3 text-primary fill-primary" /></span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={rescanOpen} onOpenChange={setRescanOpen}>
        <DialogContent className="max-w-md border-none bg-white dark:bg-slate-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-white/5">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3 font-mono">
              <RefreshCw className={`w-5 h-5 ${rescanRunning ? 'animate-spin' : ''}`} />
              Confirm Rescan
            </DialogTitle>
            <DialogDescription>
              This process will rebuild your transaction history from the helper service.
            </DialogDescription>
          </DialogHeader>
          <div className="p-6">
            <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 mb-6 flex gap-3 italic">
              <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0" />
              <p className="text-xs text-amber-500 font-medium leading-relaxed">
                Full rescanning may take 5-10 minutes depending on your network and the L1 height.
                Do not close the application during this process.
              </p>
            </div>
          </div>
          <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-0">
            <Button variant="ghost" className="flex-1 h-12" onClick={() => setRescanOpen(false)} disabled={rescanRunning}>Cancel</Button>
            <Button
              className="flex-1 h-12 shadow-xl shadow-primary/20 font-bold"
              disabled={rescanRunning}
              onClick={async () => {
                try {
                  setSyncStatus("syncing", "Full rescan initiated...");
                  setRescanRunning(true);
                  await api.scanNotes({ fullRescan: true });
                  await qc.invalidateQueries({ queryKey: ["balance"] });
                  await qc.invalidateQueries({ queryKey: ["transactions"] });
                  toast.success("Local database synchronized");
                  setSyncStatus("idle", null);
                  setRescanOpen(false);
                } catch {
                  toast.error("Bridge signal synchronization failed");
                  setSyncStatus("error", "Rescan failed");
                } finally {
                  setRescanRunning(false);
                }
              }}
            >
              {rescanRunning ? "Scanning Blocks..." : "Start Synchronizing"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={exportOpen} onOpenChange={(o) => {
        setExportOpen(o);
        if (!o) {
          setExportPassword("");
          setViewingKeys(null);
        }
      }}>
        <DialogContent className="max-w-md border-none bg-white dark:bg-slate-950 shadow-2xl ring-1 ring-black/10 dark:ring-white/10 p-0 overflow-hidden">
          <DialogHeader className="p-6 bg-white/5">
            <DialogTitle className="text-2xl font-bold flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/20 text-primary">
                <Lock className="w-5 h-5" />
              </div>
              Identity Disclosure
            </DialogTitle>
            <DialogDescription>Verify your password to export viewing keys.</DialogDescription>
          </DialogHeader>

          <div className="p-6 space-y-6">
            {!viewingKeys ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="pass" className="text-xs font-bold uppercase text-muted-foreground mr-1">Master Password</Label>
                  <Input
                    id="pass"
                    type="password"
                    value={exportPassword}
                    onChange={(e) => setExportPassword(e.currentTarget.value)}
                    placeholder="••••••••"
                    className="h-12 bg-white/5 border-none ring-1 ring-white/10"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-4 animate-in zoom-in-95 duration-300">
                <div className="space-y-4">
                  {[
                    { label: "Full Viewing Key (FVK)", value: viewingKeys.fvk, desc: "Used for scanning all notes." },
                    { label: "Incoming Viewing Key (IVK)", value: viewingKeys.ivk, desc: "Only reveals inbound transactions." },
                    { label: "Outgoing Viewing Key (OVK)", value: viewingKeys.ovk, desc: "Only reveals outbound transactions." },
                  ].map((k) => (
                    <div key={k.label} className="p-4 rounded-xl bg-white/5 border border-white/5 space-y-2 group">
                      <div className="flex justify-between items-center">
                        <Label className="text-[10px] uppercase font-bold text-primary">{k.label}</Label>
                        <CopyButton value={k.value} label="" className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity" />
                      </div>
                      <div className="break-all font-mono text-[10px] leading-relaxed select-all">
                        {k.value}
                      </div>
                      <p className="text-[8px] text-muted-foreground italic">{k.desc}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="p-6 pt-0 flex gap-3 sm:gap-0">
            {viewingKeys ? (
              <Button className="w-full h-12 font-bold" onClick={() => setExportOpen(false)}>Done</Button>
            ) : (
              <>
                <Button variant="ghost" className="flex-1 h-12" onClick={() => setExportOpen(false)}>Cancel</Button>
                <Button
                  className="flex-1 h-12 font-bold"
                  disabled={exportRunning || !exportPassword}
                  onClick={async () => {
                    try {
                      setExportRunning(true);
                      const res = await api.exportViewingKeys(exportPassword);
                      setViewingKeys(res);
                      toast.success("Security keys decrypted");
                    } catch (e) {
                      toast.error("Incorrect password");
                    } finally {
                      setExportRunning(false);
                    }
                  }}
                >
                  {exportRunning ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify Identity"}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
