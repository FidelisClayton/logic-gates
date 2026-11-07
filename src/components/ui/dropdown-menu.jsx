import * as MenuPrimitive from '@radix-ui/react-dropdown-menu';
import { cn } from '@/lib/utils';
import { pop } from '../../ui.js';

export const DropdownMenu = MenuPrimitive.Root;
export const DropdownMenuTrigger = MenuPrimitive.Trigger;

export function DropdownMenuContent({ className, align = 'end', sideOffset = 12, collisionPadding = 8, ...props }) {
  return (
    <MenuPrimitive.Portal>
      <MenuPrimitive.Content align={align} sideOffset={sideOffset} collisionPadding={collisionPadding} className={cn(pop, 'flex flex-col outline-none', className)} {...props} />
    </MenuPrimitive.Portal>
  );
}

export function DropdownMenuItem({ className, ...props }) {
  return (
    <MenuPrimitive.Item
      className={cn('flex h-9 w-full shrink-0 cursor-pointer items-center gap-2 rounded-lg px-2.5 text-left outline-none data-[highlighted]:bg-hover pointer-coarse:h-11', className)}
      {...props}
    />
  );
}
