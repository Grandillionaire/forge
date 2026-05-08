import { useState } from 'react';
import { Wand2, X, Info } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { VideoUpscaleOptions } from '../../../preload/index';
import { Card } from './ui/Card';
import { Field, Select, Slider } from './ui/Field';
import { Button } from './ui/Button';
import { AiInstallBanner } from './AiInstallBanner';

interface Props {
  realesrganAvailable: boolean;
  onInstallRealesrgan: () => void;
  installing: boolean;
  installStage: string;
}

export function VideoUpscaleView({
  realesrganAvailable,
  onInstallRealesrgan,
  installing,
  installStage,
}: Props) {
  const q = useFileQueue('video');
  const [scale, setScale] = useState<2 | 3 | 4>(2);
  const [model, setModel] = useState<VideoUpscaleOptions['model']>('realesr-animevideov3');
  const [crf, setCrf] = useState(18);
  const [preset, setPreset] = useState<VideoUpscaleOptions['preset']>('medium');
  const [outputDir, setOutputDir] = useState('');

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    q.setRows((rs) =>
      rs.map((r) => ({ ...r, pct: 0, stage: 'Queued', error: undefined, outputPath: undefined, log: undefined, startedAt: undefined, outBytes: undefined })),
    );
    q.setRunning('running');
    const result = await window.forge.videoUpscale(q.items, {
      scale,
      model,
      crf,
      preset,
      outputDir,
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

  return (
    <div className="space-y-5">
      <Dropzone kind="video" onFiles={q.addPaths} hint="Bulk-upscale MP4, MOV, MKV, WebM. Audio is preserved." />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Scale">
            <Select<number>
              value={scale}
              onChange={(v) => setScale(v as 2 | 3 | 4)}
              options={[
                { value: 2, label: '2×', sub: 'fast' },
                { value: 3, label: '3×', sub: 'balanced' },
                { value: 4, label: '4×', sub: 'max quality' },
              ]}
            />
          </Field>
          <Field label="Model">
            <Select<string>
              value={model}
              onChange={(v) => setModel(v as VideoUpscaleOptions['model'])}
              options={[
                { value: 'realesr-animevideov3', label: 'animevideo-v3', sub: 'sharp, fast' },
                { value: 'realesrgan-x4plus', label: 'x4plus', sub: 'photographic' },
              ]}
            />
          </Field>
          <Field label={`CRF · ${crf}`}>
            <Slider
              value={crf}
              onChange={setCrf}
              min={14}
              max={28}
              bookends={['pristine', 'balanced', 'tiny']}
            />
          </Field>
          <Field label="Encoder preset">
            <Select<string>
              value={preset}
              onChange={(v) => setPreset(v as VideoUpscaleOptions['preset'])}
              options={[
                { value: 'ultrafast', label: 'ultrafast' },
                { value: 'fast', label: 'fast' },
                { value: 'medium', label: 'medium' },
                { value: 'slow', label: 'slow', sub: 'best size/quality' },
              ]}
            />
          </Field>
        </div>
      </Card>

      {!realesrganAvailable && (
        <AiInstallBanner
          installing={installing}
          installStage={installStage}
          onInstall={onInstallRealesrgan}
          required
        />
      )}

      <OutputDir value={outputDir} onChange={setOutputDir} />

      <div className="flex items-start gap-2 px-1 text-[11px] text-forge-text/45 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-forge-primary/70 mt-0.5 shrink-0" />
        <span>
          Pipeline: extract frames → AI upscale per frame → reassemble with original audio
          (H.264, faststart). Heavy work — large clips can take many minutes per minute of footage.
        </span>
      </div>

      <FileList rows={q.rows} onRemove={q.remove} onClear={q.clear} kind="video" />

      <div className="flex items-center gap-3">
        <Button
          onClick={start}
          disabled={q.items.length === 0 || !outputDir || !!q.running || !realesrganAvailable}
          icon={<Wand2 />}
        >
          {q.running
            ? 'Processing…'
            : `Upscale ${q.items.length || ''} ${q.items.length === 1 ? 'video' : 'videos'}`.trim()}
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
