// Reset demo (F6.2; REQ-05-02; spec 3.11.1): asks "Remove this browser's proposals and purchases?" before it acts,
// then `POST /api/demo/reset`. Sample data stays, every appointment is turned back on, nothing is sent to PayPal.
import { useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { toast } from 'sonner';
import type { ResetDemoResult } from '@/shared/types';
import { RESET_DEMO_CONFIRM_PROMPT } from '@/shared/types';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { api } from '@/hooks/useApi';

export function ResetDemoButton({ onReset }: { onReset?: (r: ResetDemoResult) => void }) {
  const [busy, setBusy] = useState(false);

  const reset = async () => {
    setBusy(true);
    try {
      const result = await api.post<ResetDemoResult>('/api/demo/reset', {});
      toast.success('Demo reset. This browser’s proposals, purchases and posted offers are removed and every appointment is on again.');
      onReset?.(result);
    } catch {
      toast.error('The demo did not reset. Try again in a moment.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" disabled={busy}>
          <RotateCcw aria-hidden="true" />
          Reset demo
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{RESET_DEMO_CONFIRM_PROMPT}</AlertDialogTitle>
          <AlertDialogDescription>
            Sample merchants and offers stay; offers you posted are removed. Every appointment is turned back on. Nothing is sent to PayPal.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep them</AlertDialogCancel>
          <AlertDialogAction onClick={() => void reset()}>Reset demo</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
