import { useState } from 'react';
import { Sparkles, X } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { ImageUpscaleOptions } from '../../../preload/index';
import { Card } from './ui/Card';
import { Field, Select, Toggle } from './ui/Field';
import { Button } from './ui/Button';
import { AiBadge, AiInstallBanner } from './AiInstallBanner';

interface Props {
  realesrganAvailable: boolean;
  onInstallRealesrgan: () => void;
  installing: boolean;
  installStage: string;
}

export function ImageUpscaleView({
  realesrganAvailable,
  onInstallRealesrgan,
  installing,
  installStage,
}: Props) {
  const q = useFileQueue('image');
  const [scale, setScale] = useState<2 | 3 | 4>(4);
  const [model, setModel] = useState<ImageUpscaleOptions['model']>('realesrgan-x4plus');
  const [format, setFormat] = useState<ImageUpscaleOptions['outputFormat']>('png');
  const [preferAi, setPreferAi] = useState(true);
  const [outputDir, setOutputDir] = useState('');

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    q.setRows((rs) =>
      rs.map((r) => ({ ...r, pct: 0, stage: 'Queued', error: undefined, outputPath: undefined })),
    );
    q.setRunning('running');
    const result = await window.forge.imageUpscale(q.items, {
      scale,
      model,
      outputFormat: format,
      outputDir,
      preferAi,
    });
    q.setRows((rs) =>
      rs.map((r) => {
        const m = result.items.find((x) => x.itemId === r.id);
        if (!m) return r;
        return {
          ...r,
          pct: 100,
          stage: m.ok ? 'Done' : 'Failed',
          error: m.ok ? undefined : m.error,
          outputPath: m.outputPath,
          outBytes: m.bytesOut,
        };
      }),
    );
    q.setRunning(null);
  };

  const aiActive = preferAi && realesrganAvailable;

  return (
    <div className="space-y-5">
      <Dropzone
        kind="image"
        onFiles={q.addPaths}
        hint="Bulk-upscale JPG, PNG, WebP, HEIC and more — up to 4× with AI."
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Scale factor">
            <Select<number>
              value={scale}
              onChange={(v) => setScale(v as 2 | 3 | 4)}
              options={[
                { value: 2, label: '2×', sub: 'double resolution' },
                { value: 3, label: '3×', sub: 'triple' },
                { value: 4, label: '4×', sub: 'best quality' },
              ]}
            />
          </Field>
          <Field label="Model">
            <Select<string>
              value={model}
              onChange={(v) => setModel(v as ImageUpscaleOptions['model'])}
              options={[
                { value: 'realesrgan-x4plus', label: 'x4plus', sub: 'photographic' },
                { value: 'realesrgan-x4plus-anime', label: 'x4plus-anime', sub: 'illustration' },
                { value: 'realesr-animevideov3', label: 'animevideo-v3', sub: 'line art' },
              ]}
            />
          </Field>
          <Field label="Output format">
            <Select<string>
              value={format}
              onChange={(v) => setFormat(v as ImageUpscaleOptions['outputFormat'])}
              options={[
                { value: 'png', label: 'PNG', sub: 'lossless' },
                { value: 'jpg', label: 'JPG', sub: 'smaller' },
                { value: 'webp', label: 'WebP', sub: 'modern' },
              ]}
            />
          </Field>
          <Field
            label="AI engine"
            hint={
              <AiBadge
                on={aiActive}
                fallbackLabel={preferAi ? 'AI not installed — Lanczos fallback' : 'Lanczos resize (Sharp)'}
              />
            }
          >
            <Toggle
              on={preferAi}
              onChange={setPreferAi}
              label={<span>Prefer AI when available</span>}
            />
          </Field>
        </div>
      </Card>

      {!realesrganAvailable && (
        <AiInstallBanner
          installing={installing}
          installStage={installStage}
          onInstall={onInstallRealesrgan}
        />
      )}

      <OutputDir value={outputDir} onChange={setOutputDir} />

      <FileList rows={q.rows} onRemove={q.remove} onClear={q.clear} kind="image" />

      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={start}
          disabled={q.items.length === 0 || !outputDir || !!q.running}
          icon={<Sparkles />}
        >
          {q.running
            ? 'Processing…'
            : `Upscale ${q.items.length || ''} ${q.items.length === 1 ? 'image' : 'images'}`.trim()}
        </Button>
        {q.running && (
          <Button
            variant="ghost"
            onClick={() => q.running && window.forge.cancelJob(q.running)}
            icon={<X />}
          >
            Cancel
          </Button>
        )}
      </div>
    </div>
  );
}
