import { useEffect, useState } from 'react';
import { Trash2 } from 'lucide-react';
import { Button, IconButton, Input, PasswordInput } from '@/components/ui';
import { cn } from '@/lib/utils';
import type { SetupField } from '@/lib/electron';

export function SetupFieldRow({
  field,
  onSave,
  onClear,
}: {
  field: SetupField;
  onSave: (value: string) => void;
  onClear: () => void;
}) {
  const savedValue = field.value ?? '';
  const [draft, setDraft] = useState(savedValue);

  useEffect(() => setDraft(savedValue), [savedValue]);

  const canSave = draft.trim().length > 0 && draft !== savedValue;
  const InputComponent = field.secret ? PasswordInput : Input;

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="flex-1 text-xs font-medium text-fg-muted">{field.label}</span>
        <span
          className={cn(
            'rounded px-1.5 py-px text-[10px] uppercase tracking-wide',
            field.isSet ? 'bg-green-500/15 text-green-300' : 'bg-amber-500/15 text-amber-300',
          )}
        >
          {field.isSet ? 'set' : 'required'}
        </span>
        {field.isSet && (
          <IconButton icon={Trash2} label={`Clear ${field.label}`} onClick={onClear} />
        )}
      </div>
      <div className="flex gap-2">
        <div className="flex-1">
          <InputComponent
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && canSave && onSave(draft)}
            placeholder={field.secret && field.isSet ? 'Replace…' : field.placeholder}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        <Button variant="primary" disabled={!canSave} onClick={() => onSave(draft)}>
          Save
        </Button>
      </div>
      {field.hint && <p className="text-xs text-fg-subtle">{field.hint}</p>}
    </div>
  );
}
