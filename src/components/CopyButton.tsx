import { Copy } from "lucide-react";
import { toast } from "sonner";

import { Button } from "./ui/button";

interface CopyButtonProps {
  value: string;
  label?: string;
  successMessage?: string;
  errorMessage?: string;
  className?: string;
}

export default function CopyButton({
  value,
  label = "Copy",
  successMessage = "Copied",
  errorMessage = "Failed to copy",
  className,
}: CopyButtonProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          toast.success(successMessage);
        } catch {
          toast.error(errorMessage);
        }
      }}
    >
      <Copy className="h-4 w-4" />
      {label}
    </Button>
  );
}
