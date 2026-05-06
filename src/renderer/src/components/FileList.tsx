import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, X, Image as ImageIcon, Film } from 'lucide-react';
import clsx from 'clsx';
import { basename, bytes, duration } from '../lib/format';

export interface FileRow {
  id: string;
  path: string;
  width?: number;
  height?: number;
  bytes?: number;
  durationSec?: number;
  thumbnail?: string;
  pct?: number;
  stage?: string;
  outputPath?: string;
  outBytes?: number;
  error?: string;
}

interface Props {
  rows: FileRow[];
  onRemove: (id: string) => void;
  onClear: () => void;
  kind: 'image' | 'video';
}

export function FileList({ rows, onRemove, onClear, kind }: Props) {
  if (rows.length === 0) return <EmptyState kind={kind} />;

  const totalBytes = rows.reduce((a, r) => a + (r.bytes ?? 0), 0);
  const doneCount = rows.filter((r) => r.pct === 100 && !r.error).length;
  const failCount = rows.filter((r) => r.error).length;

  return (
    <div className="glass rounded-2xl overflow-hidden">
      <div className="flex items-center justify-between px-5 h-12 border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="text-[11px] uppercase tracking-wider3 text-forge-primary font-bold">
            Queue
          </div>
          <div className="flex items-center gap-2 text-[11px] text-forge-text/65">
            <span className="tabular-nums font-bold text-forge-text">{rows.length}</span>
            <span>{kind === 'image' ? 'image' : 'video'}{rows.length === 1 ? '' : 's'}</span>
            <span className="text-forge-text/30">·</span>
            <span className="tabular-nums">{bytes(totalBytes)}</span>
            {doneCount > 0 && (
              <>
                <span className="text-forge-text/30">·</span>
                <span className="text-emerald-300/85 font-bold tabular-nums">{doneCount} done</span>
              </>
            )}
            {failCount > 0 && (
              <>
                <span className="text-forge-text/30">·</span>
                <span className="text-rose-300/85 font-bold tabular-nums">{failCount} failed</span>
              </>
            )}
          </div>
        </div>
        <button
          onClick={onClear}
          className="text-[10px] uppercase tracking-wider2 text-forge-text/45 hover:text-forge-primaryHi transition-colors"
        >
          Clear all
        </button>
      </div>
      <div className="max-h-[44vh] overflow-y-auto">
        <AnimatePresence initial={false}>
          {rows.map((r, i) => (
            <Row key={r.id} row={r} index={i} onRemove={() => onRemove(r.id)} kind={kind} />
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}

function Row({
  row,
  index,
  onRemove,
  kind,
}: {
  row: FileRow;
  index: number;
  onRemove: () => void;
  kind: 'image' | 'video';
}) {
  const done = row.pct === 100 && !row.error;
  const failed = !!row.error;
  const active = row.pct !== undefined && row.pct < 100 && !failed;
  const Icon = kind === 'image' ? ImageIcon : Film;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.018, 0.15) }}
      className="group relative flex items-center gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors"
    >
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/60 border border-white/[0.06] shrink-0">
        {row.thumbnail ? (
          <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className="w-4 h-4 text-forge-text/30" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[13px] truncate text-forge-text/95" title={row.path}>
            {basename(row.path)}
          </span>
          <StatusPill row={row} />
        </div>
        <div className="text-[11px] text-forge-text/45 flex gap-2.5 mt-0.5 tabular-nums">
          {row.width && row.height && (
            <span>{row.width}×{row.height}</span>
          )}
          <span>{bytes(row.bytes)}</span>
          {kind === 'video' && row.durationSec !== undefined && (
            <span>{duration(row.durationSec)}</span>
          )}
          {row.outBytes !== undefined && (
            <span className="text-forge-primary font-bold">→ {bytes(row.outBytes)}</span>
          )}
        </div>
        {row.pct !== undefined && (
          <div className="progress-track mt-2">
            <div
              className={clsx(
                'progress-fill',
                done && 'progress-fill-done',
                failed && 'progress-fill-fail',
              )}
              style={{ width: `${row.pct}%` }}
            />
          </div>
        )}
        {(row.stage || row.error) && (
          <div className={clsx('text-[10px] mt-1', failed ? 'text-rose-300' : active ? 'text-forge-primaryHi' : 'text-forge-text/45')}>
            {row.error ?? row.stage}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity">
        {row.outputPath && (
          <button
            className="btn-icon"
            onClick={() => window.forge.revealInFinder(row.outputPath!)}
            title="Reveal in Finder"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </button>
        )}
        <button className="btn-icon" onClick={onRemove} title="Remove from queue">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    </motion.div>
  );
}

function StatusPill({ row }: { row: FileRow }) {
  if (row.error) return <span className="pill pill-fail">Failed</span>;
  if (row.pct === 100) return <span className="pill pill-ok">Done</span>;
  if (row.pct !== undefined && row.pct > 0) return <span className="pill pill-accent">Processing</span>;
  if (row.pct === 0) return <span className="pill pill-primary">Queued</span>;
  return <span className="pill pill-mute">Ready</span>;
}

function EmptyState({ kind }: { kind: 'image' | 'video' }) {
  const Icon = kind === 'image' ? ImageIcon : Film;
  return (
    <div className="glass rounded-2xl py-10 text-center">
      <div className="flex flex-col items-center gap-3">
        <div className="w-12 h-12 rounded-2xl glass-strong flex items-center justify-center">
          <Icon className="w-5 h-5 text-forge-text/30" />
        </div>
        <div className="text-[12px] uppercase tracking-wider2 text-forge-text/40">
          Queue is empty
        </div>
        <div className="text-[11px] text-forge-text/30">
          Drop files above to get started.
        </div>
      </div>
    </div>
  );
}
