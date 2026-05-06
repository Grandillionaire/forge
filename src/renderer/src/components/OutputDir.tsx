import { useEffect } from 'react';
import { FolderOpen, FolderSearch } from 'lucide-react';
import { Field } from './ui/Field';
import { Button } from './ui/Button';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export function OutputDir({ value, onChange }: Props) {
  useEffect(() => {
    if (!value) window.forge.defaultOutputDir().then(onChange);
  }, [value, onChange]);

  const pick = async () => {
    const dir = await window.forge.pickDirectory();
    if (dir) onChange(dir);
  };

  return (
    <Field label="Output folder">
      <div className="flex gap-2">
        <div
          className="input-base flex-1 flex items-center text-forge-text/85 truncate"
          title={value}
        >
          <FolderOpen className="w-3.5 h-3.5 text-forge-primary/80 mr-2 shrink-0" />
          <span className="truncate">{value || '—'}</span>
        </div>
        <Button variant="ghost" onClick={pick} icon={<FolderSearch />}>
          Choose
        </Button>
        <Button
          variant="ghost"
          onClick={() => value && window.forge.openPath(value)}
          disabled={!value}
        >
          Open
        </Button>
      </div>
    </Field>
  );
}
