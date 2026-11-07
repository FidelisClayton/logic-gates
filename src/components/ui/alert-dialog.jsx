import * as DialogPrimitive from '@radix-ui/react-alert-dialog';
import { cn } from '@/lib/utils';
import { btn, hit, pop } from '../../ui.js';

export const AlertDialog = DialogPrimitive.Root;
export const AlertDialogCancel = DialogPrimitive.Cancel;
export const AlertDialogAction = DialogPrimitive.Action;

export function AlertDialogContent({ className, ...props }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-scrim" />
      <DialogPrimitive.Content
        className={cn(pop, 'fixed top-1/2 left-1/2 w-[360px] max-w-[calc(100vw-32px)] -translate-x-1/2 -translate-y-1/2 p-4 outline-none', className)}
        {...props}
      />
    </DialogPrimitive.Portal>
  );
}

export const AlertDialogTitle = ({ className, ...props }) => <DialogPrimitive.Title className={cn('font-semibold break-words', className)} {...props} />;
export const AlertDialogDescription = ({ className, ...props }) => <DialogPrimitive.Description className={cn('pt-1 text-xs text-muted', className)} {...props} />;
export const AlertDialogFooter = ({ className, ...props }) => <div className={cn('flex justify-end gap-3 pt-5', className)} {...props} />;

export const dialogBtn = `${btn} ${hit}`;
export const dialogDanger = `${btn} ${hit} border-transparent bg-danger text-onbtn hover:bg-danger hover:opacity-90`;
