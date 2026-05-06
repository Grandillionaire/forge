import { useState } from 'react';
import { Minimize2, X, ShieldCheck } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { ImageCompressOptions } from '../../../preload/index';
import { Card } from './ui/Card';
import { Field, Select, Slider, Toggle } from './ui/Field';
import { Button } from './ui/Button';

export function ImageCompressView() {
  const q = useFileQueue('image');
  const [format, setFormat] = useState<ImageCompressOptions['format']>('jpeg');
  const [quality, setQuality] = useState(72);
  const [maxWidth, setMaxWidth] = useState<number>(0);
  const [strip, setStrip] = useState(true);
  const [artist, setArtist] = useState('');
  const [copyright, setCopyright] = useState('© Forge');
  const [description, setDescription] = useState('');
  const [outputDir, setOutputDir] = useState('');

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    q.setRows((rs) =>
      rs.map((r) => ({ ...r, pct: 0, stage: 'Queued', error: undefined, outputPath: undefined })),
    );
    q.setRunning('running');
    const result = await window.forge.imageCompress(q.items, {
      format,
      quality,
      maxWidth: maxWidth > 0 ? maxWidth : undefined,
      stripMetadata: strip,
      metadataOverrides: strip ? undefined : { artist, copyright, description },
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

  const totalIn = q.rows.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const totalOut = q.rows.reduce((a, r) => a + (r.outBytes ?? 0), 0);
  const savedPct =
    totalIn > 0 && totalOut > 0
      ? Math.round(((totalIn - totalOut) / totalIn) * 100)
      : 0;

  return (
    <div className="space-y-5">
      <Dropzone kind="image" onFiles={q.addPaths} hint="Compress, resize, and rewrite metadata in bulk." />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Output format">
            <Select<string>
              value={format}
              onChange={(v) => setFormat(v as ImageCompressOptions['format'])}
              options={[
                { value: 'jpeg', label: 'JPEG', sub: 'best for photos' },
                { value: 'webp', label: 'WebP', sub: 'smaller' },
                { value: 'avif', label: 'AVIF', sub: 'smallest' },
                { value: 'preserve', label: 'Preserve', sub: 'keep original' },
              ]}
            />
          </Field>
          <Field label={`Quality · ${quality}`}>
            <Slider
              value={quality}
              onChange={setQuality}
              min={1}
              max={100}
              bookends={['tiny', 'balanced', 'pristine']}
            />
          </Field>
          <Field label="Max width" hint={<>Set to <span className="font-bold tabular-nums">0</span> to keep original</>}>
            <input
              type="number"
              className="input-base"
              value={maxWidth}
              onChange={(e) => setMaxWidth(Math.max(0, Number(e.target.value)))}
              placeholder="px"
              min={0}
            />
          </Field>
          <Field label="Metadata">
            <div className="flex items-center gap-2 h-9">
              <Toggle on={strip} onChange={setStrip} />
              <span className="text-[12.5px] text-forge-text/85 flex items-center gap-1.5">
                {strip ? (
                  <>
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-300/85" />
                    Strip all (EXIF, GPS, ICC)
                  </>
                ) : (
                  <>Keep & rewrite</>
                )}
              </span>
            </div>
          </Field>
        </div>
      </Card>

      {!strip && (
        <Card>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            <Field label="Artist / Creator">
              <input
                className="input-base"
                value={artist}
                onChange={(e) => setArtist(e.target.value)}
                placeholder="Forge"
              />
            </Field>
            <Field label="Copyright">
              <input
                className="input-base"
                value={copyright}
                onChange={(e) => setCopyright(e.target.value)}
              />
            </Field>
            <Field label="Description">
              <input
                className="input-base"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </Field>
          </div>
        </Card>
      )}

      <OutputDir value={outputDir} onChange={setOutputDir} />

      <FileList rows={q.rows} onRemove={q.remove} onClear={q.clear} kind="image" />

      {totalOut > 0 && (
        <div className="flex items-center justify-end gap-3 text-[12px] text-forge-text/70">
          <span>Total saved</span>
          <span className="text-forge-primary font-bold tabular-nums text-[14px]">
            {savedPct}%
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={start}
          disabled={q.items.length === 0 || !outputDir || !!q.running}
          icon={<Minimize2 />}
        >
          {q.running
            ? 'Processing…'
            : `Compress ${q.items.length || ''} ${q.items.length === 1 ? 'file' : 'files'}`.trim()}
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
