import { useRef, useState } from 'react';
import { useI18n } from '../I18n.jsx';
import { Icon } from '../icons.jsx';
import { btnPrimary, hit, iconBtn, input } from '../ui.js';
import { AlertDialog, AlertDialogCancel, AlertDialogAction, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogTitle, dialogBtn, dialogDanger } from '@/components/ui/alert-dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

export default function Sidebar({ items, current, overlay, onSwitch, onNew, onRename, onCopy, onDelete }) {
  const { t } = useI18n();
  const [edit, setEdit] = useState(null); // { id, mode: 'rename' | 'copy' }
  const [del, setDel] = useState(null); // the row being deleted: { id, name }
  const trigger = useRef({}); // row ⋯ buttons by id, so Cancel can hand focus back to the row that opened the dialog
  const delId = useRef(null);
  const picked = useRef(false); // a menu item was chosen: its action owns focus, so the menu must not return it to the trigger
  const done = () => setEdit(null);

  return (
    <nav data-sidebar aria-label={t('header.circuits')} className={`flex min-h-0 min-w-0 flex-col gap-0.5 border-r border-line bg-bg px-2 py-3 ${overlay ? 'absolute inset-y-0 left-0 z-30 w-60 shadow-pop' : ''}`}>
      <button className='mb-4 flex h-11 flex-none items-center gap-2 whitespace-nowrap rounded-lg border border-line px-2.5 text-muted hover:border-line2 hover:text-ink' onClick={onNew}>
        <Icon name="plus" /><span className="truncate">{t('cs.new')}</span>
      </button>
      <div className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto">
        {items.map((i) => {
          const cur = i.id === current;
          const mode = edit?.id === i.id ? edit.mode : null;
          const shell = `group relative flex min-h-11 flex-none items-center rounded-lg hover:bg-hover ${cur ? 'bg-hover' : ''}`;
          if (mode) {
            const copy = mode === 'copy';
            return (
              <form key={i.id} className={`${shell} gap-1.5 px-1.5`} onSubmit={(e) => {
                e.preventDefault();
                const name = e.currentTarget.elements.n.value.trim() || (copy ? t('cs.copyName', { name: i.name }) : i.name);
                done();
                (copy ? onCopy : onRename)(i.id, name);
              }}>
                <input name="n" aria-label={t(copy ? 'cs.copyLabel' : 'cs.renameLabel')} className={input} defaultValue={copy ? t('cs.copyName', { name: i.name }) : i.name} maxLength={100} autoFocus onFocus={(e) => e.target.select()} onKeyDown={(e) => e.key === 'Escape' && done()} />
                <button className={`${btnPrimary} ${hit}`} type="submit">{t(copy ? 'cs.copyDo' : 'cs.renameDo')}</button>
              </form>
            );
          }
          return (
            <div key={i.id} className={shell}>
              <button className="flex h-11 min-w-0 flex-1 items-center gap-2.5 rounded-lg pl-2.5 text-left" aria-current={cur} title={i.name} onClick={() => onSwitch(i.id)}>
                <span className="grid size-4 flex-none place-items-center text-sig">{cur && <Icon name="check" />}</span>
                <span className="min-w-0 flex-1 truncate font-medium">{i.name}</span>
                {i.unsaved && <span className="flex-none text-xs text-muted">{t('cs.unsaved')}</span>}
                <span className="flex-none text-xs text-muted tabular-nums" title={t('cs.parts', { n: i.count })} aria-label={t('cs.parts', { n: i.count })}>{i.count}</span>
              </button>
              <span className="mx-1 flex-none">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button ref={(el) => { trigger.current[i.id] = el; }} className={`${iconBtn} ${cur ? '' : 'opacity-0 group-focus-within:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100'} aria-expanded:opacity-100`} aria-label={`${t('cs.more')}: ${i.name}`}><Icon name="more" /></button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-44" onCloseAutoFocus={(e) => { if (picked.current) { picked.current = false; e.preventDefault(); } }}>
                    <DropdownMenuItem onSelect={() => { picked.current = true; setEdit({ id: i.id, mode: 'rename' }); }}><Icon name="pencil" /><span>{t('cs.rename')}</span></DropdownMenuItem>
                    <DropdownMenuItem onSelect={() => { picked.current = true; setEdit({ id: i.id, mode: 'copy' }); }}><Icon name="copy" /><span>{t('hd.copy')}</span></DropdownMenuItem>
                    <DropdownMenuItem className="text-danger" onSelect={() => { delId.current = i.id; setDel({ id: i.id, name: i.name }); }}><Icon name="trash" /><span>{t('cs.delete')}</span></DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </span>
            </div>
          );
        })}
      </div>
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent onCloseAutoFocus={(e) => { e.preventDefault(); trigger.current[delId.current]?.focus(); }}>
          <AlertDialogTitle>{t('cs.confirm', { name: del?.name })}</AlertDialogTitle>
          <AlertDialogDescription>{t('cs.confirmNote')}</AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel className={dialogBtn}>{t('cs.cancel')}</AlertDialogCancel>
            <AlertDialogAction className={dialogDanger} onClick={() => onDelete(del.id)}>{t('cs.delete')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </nav>
  );
}
