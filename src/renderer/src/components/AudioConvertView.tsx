import { useState } from 'react';
import { AudioLines, X, Info } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { AudioConvertOptions } from '../../../preload/index';
import { Card } from './ui/Card';
import { Field, Select } from './ui/Field';
import { Button } from './ui/Button';

const LOSSLESS = new Set<AudioConvertOptions['format']>(['wav', 'flac']);

export function AudioConvertView() {
  const q = useFileQueue('audio');
  const [format, setFormat] = useState<AudioConvertOptions['format']>('mp3');
  const [bitrate, setBitrate] = useState<AudioConvertOptions['bitrate']>('192k');
  const [sampleRate, setSampleRate] = useState<AudioConvertOptions['sampleRate']>('preserve');
  const [channels, setChannels] = useState<AudioConvertOptions['channels']>('preserve');
  const [outputDir, setOutputDir] = useState('');

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    q.setRows((rs) =>
      rs.map((r) => ({
        ...r,
        pct: 0,
        stage: 'Queued',
        error: undefined,
        outputPath: undefined,
        log: undefined,
        startedAt: undefined,
        outBytes: undefined,
      })),
    );
    q.setRunning('running');
    const result = await window.forge.audioConvert(q.items, {
      format,
      bitrate,
      sampleRate,
      channels,
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

  const isLossless = LOSSLESS.has(format);
  const totalIn = q.rows.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const totalOut = q.rows.reduce((a, r) => a + (r.outBytes ?? 0), 0);
  const savedPct =
    totalIn > 0 && totalOut > 0
      ? Math.round(((totalIn - totalOut) / totalIn) * 100)
      : 0;

  return (
    <div className="space-y-5">
      <Dropzone
        kind="audio"
        onFiles={q.addPaths}
        hint="Convert MP3 / WAV / FLAC / AAC / OGG / Opus / M4A. Set bitrate, sample rate, channels."
      />

      <Card>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <Field label="Output format">
            <Select<string>
              value={format}
              onChange={(v) => setFormat(v as AudioConvertOptions['format'])}
              options={[
                { value: 'mp3',  label: 'MP3',  sub: 'universal · lossy' },
                { value: 'm4a',  label: 'M4A',  sub: 'AAC in MP4 · lossy' },
                { value: 'aac',  label: 'AAC',  sub: 'raw AAC · lossy' },
                { value: 'wav',  label: 'WAV',  sub: 'lossless · big' },
                { value: 'flac', label: 'FLAC', sub: 'lossless · compressed' },
                { value: 'ogg',  label: 'OGG',  sub: 'Vorbis · lossy' },
                { value: 'opus', label: 'Opus', sub: 'modern · efficient' },
              ]}
            />
          </Field>
          <Field
            label="Bitrate"
            hint={
              isLossless ? (
                <span>Ignored — {format.toUpperCase()} is lossless.</span>
              ) : undefined
            }
          >
            <Select<string>
              value={bitrate}
              onChange={(v) => setBitrate(v as AudioConvertOptions['bitrate'])}
              options={[
                { value: '64k',  label: '64 kbps',  sub: 'voice · podcast' },
                { value: '96k',  label: '96 kbps',  sub: 'low fi' },
                { value: '128k', label: '128 kbps', sub: 'standard MP3' },
                { value: '160k', label: '160 kbps' },
                { value: '192k', label: '192 kbps', sub: 'common default' },
                { value: '256k', label: '256 kbps', sub: 'music' },
                { value: '320k', label: '320 kbps', sub: 'max quality' },
                { value: 'preserve', label: 'Preserve', sub: 'match source' },
              ]}
            />
          </Field>
          <Field label="Sample rate">
            <Select<string>
              value={sampleRate}
              onChange={(v) => setSampleRate(v as AudioConvertOptions['sampleRate'])}
              options={[
                { value: 'preserve', label: 'Preserve', sub: 'match source' },
                { value: '22050', label: '22.05 kHz', sub: 'voice' },
                { value: '44100', label: '44.1 kHz',  sub: 'CD quality' },
                { value: '48000', label: '48 kHz',    sub: 'video standard' },
              ]}
            />
          </Field>
          <Field label="Channels">
            <Select<string>
              value={channels}
              onChange={(v) => setChannels(v as AudioConvertOptions['channels'])}
              options={[
                { value: 'preserve', label: 'Preserve', sub: 'match source' },
                { value: 'mono',     label: 'Mono',     sub: 'voice / podcast' },
                { value: 'stereo',   label: 'Stereo',   sub: 'music / standard' },
              ]}
            />
          </Field>
        </div>
      </Card>

      <OutputDir value={outputDir} onChange={setOutputDir} />

      <div className="flex items-start gap-2 px-1 text-[11px] text-forge-text/45 leading-relaxed">
        <Info className="w-3.5 h-3.5 text-forge-primary/70 mt-0.5 shrink-0" />
        <span>
          Single FFmpeg pass per file. Lossy → lossless re-encodes preserve only what
          the source already contained — converting an MP3 to FLAC won't restore quality
          that wasn't there.
        </span>
      </div>

      <FileList rows={q.rows} onRemove={q.remove} onClear={q.clear} kind="audio" />

      {totalOut > 0 && (
        <div className="flex items-center justify-end gap-3 text-[12px] text-forge-text/70">
          <span>Total {savedPct >= 0 ? 'saved' : 'grown'}</span>
          <span className="text-forge-primary font-bold tabular-nums text-[14px]">
            {Math.abs(savedPct)}%
          </span>
        </div>
      )}

      <div className="flex items-center gap-3">
        <Button
          onClick={start}
          disabled={q.items.length === 0 || !outputDir || !!q.running}
          icon={<AudioLines />}
        >
          {q.running
            ? 'Converting…'
            : `Convert ${q.items.length || ''} ${q.items.length === 1 ? 'file' : 'files'}`.trim()}
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
