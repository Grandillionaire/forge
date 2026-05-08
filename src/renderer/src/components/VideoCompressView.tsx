import { useState } from 'react';
import { FileVideo2, X, Info } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { VideoCompressOptions } from '../../../preload/index';
import { Card } from './ui/Card';
import { Field, Select, Slider } from './ui/Field';
import { Button } from './ui/Button';

export function VideoCompressView() {
  const q = useFileQueue('video');
  const [resolution, setResolution] = useState<VideoCompressOptions['resolution']>('preserve');
  const [crf, setCrf] = useState(24);
  const [preset, setPreset] = useState<VideoCompressOptions['preset']>('medium');
  const [audioBitrate, setAudioBitrate] = useState<VideoCompressOptions['audioBitrate']>('128k');
  const [outputDir, setOutputDir] = useState('');

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    q.setRows((rs) =>
      rs.map((r) => ({ ...r, pct: 0, stage: 'Queued', error: undefined, outputPath: undefined })),
    );
    q.setRunning('running');
    const result = await window.forge.videoCompress(q.items, {
      resolution,
      crf,
      preset,
      audioBitrate,
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
      <Dropzone
        kind="video"
        onFiles={q.addPaths}
        hint="Shrink videos in bulk — downscale resolution, drop bitrate, keep audio."
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Resolution">
            <Select<string>
              value={resolution}
              onChange={(v) => setResolution(v as VideoCompressOptions['resolution'])}
              options={[
                { value: 'preserve', label: 'Preserve', sub: 'keep source size' },
                { value: '1080p', label: '1080p', sub: 'cap height at 1080' },
                { value: '720p', label: '720p', sub: 'common upload size' },
                { value: '480p', label: '480p', sub: 'tiny / SD' },
                { value: '360p', label: '360p', sub: 'thumbnail / preview' },
              ]}
            />
          </Field>
          <Field label={`CRF · ${crf}`}>
            <Slider
              value={crf}
              onChange={setCrf}
              min={18}
              max={32}
              bookends={['pristine', 'balanced', 'tiny']}
            />
          </Field>
          <Field label="Encoder preset">
            <Select<string>
              value={preset}
              onChange={(v) => setPreset(v as VideoCompressOptions['preset'])}
              options={[
                { value: 'ultrafast', label: 'ultrafast', sub: 'speed first' },
                { value: 'fast', label: 'fast' },
                { value: 'medium', label: 'medium', sub: 'default' },
                { value: 'slow', label: 'slow', sub: 'best size/quality' },
              ]}
            />
          </Field>
          <Field label="Audio">
            <Select<string>
              value={audioBitrate}
              onChange={(v) => setAudioBitrate(v as VideoCompressOptions['audioBitrate'])}
              options={[
                { value: '64k', label: '64 kbps', sub: 'voice / podcast' },
                { value: '128k', label: '128 kbps', sub: 'standard' },
                { value: '192k', label: '192 kbps', sub: 'music' },
                { value: '256k', label: '256 kbps', sub: 'high fidelity' },
                { value: 'preserve', label: 'Preserve', sub: 'copy source audio' },
              ]}
            />
          </Field>
        </div>
      </Card>

      <OutputDir value={outputDir} onChange={setOutputDir} />

      <div className="flex items-start gap-2 px-1 text-[11px] text-forge-text/45 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-forge-primary/70 mt-0.5 shrink-0" />
        <span>
          Single-pass H.264 with faststart for instant playback over the network. Resolution
          downscale only fires when the source is taller than the target — never upscales here.
          For making videos <em>bigger</em>, see the Video upscale tab.
        </span>
      </div>

      <FileList rows={q.rows} onRemove={q.remove} onClear={q.clear} kind="video" />

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
          icon={<FileVideo2 />}
        >
          {q.running
            ? 'Processing…'
            : `Compress ${q.items.length || ''} ${q.items.length === 1 ? 'video' : 'videos'}`.trim()}
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
