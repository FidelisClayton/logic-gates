import * as PopoverPrimitive from '@radix-ui/react-popover';
import { cn } from '@/lib/utils';
import { pop } from '../../ui.js';

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;

// Same panel as the app's `pop` look; width is passed by the caller. Portaled, so scroll containers never clip it.
export function PopoverContent({ className, align = 'end', sideOffset = 12, collisionPadding = 8, ...props }) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn(pop, 'max-w-[var(--radix-popover-content-available-width)] outline-none', className)} {...props} />
    </PopoverPrimitive.Portal>
  );
}
