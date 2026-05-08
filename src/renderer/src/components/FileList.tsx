import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { ExternalLink, X, Image as ImageIcon, Film, Loader2, Activity, AudioLines } from 'lucide-react';
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
  // Latest informational line from the binary backing this job (ncnn, ffmpeg).
  // Surfaced as small text under the stage so progress is visible even between
  // percentage ticks (e.g., during GPU init).
  log?: string;
  // Wall-clock timestamp (ms) of when work started — used to render a live
  // elapsed-time counter while the row is active.
  startedAt?: number;
}

interface Props {
  rows: FileRow[];
  onRemove: (id: string) => void;
  onClear: () => void;
  kind: 'image' | 'video' | 'audio';
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
            <span>{kind === 'image' ? 'image' : kind === 'video' ? 'video' : 'audio file'}{rows.length === 1 ? '' : 's'}</span>
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
  kind: 'image' | 'video' | 'audio';
}) {
  const done = row.pct === 100 && !row.error;
  const failed = !!row.error;
  const active = row.pct !== undefined && row.pct < 100 && !failed;
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : AudioLines;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: 12 }}
      transition={{ duration: 0.18, delay: Math.min(index * 0.018, 0.15) }}
      className="group relative flex items-start gap-3 px-5 py-3 border-b border-white/[0.04] last:border-b-0 hover:bg-white/[0.015] transition-colors"
    >
      <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-black/60 border border-white/[0.06] shrink-0">
        {row.thumbnail ? (
          <img src={row.thumbnail} alt="" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <Icon className={`w-4 h-4 ${kind === 'audio' ? 'text-forge-primaryHi/60' : 'text-forge-text/30'}`} />
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
        <div className="text-[11px] text-forge-text/45 flex gap-2.5 mt-0.5 tabular-nums flex-wrap">
          {row.width && row.height && (
            <span>{row.width}×{row.height}</span>
          )}
          <span>{bytes(row.bytes)}</span>
          {(kind === 'video' || kind === 'audio') && row.durationSec !== undefined && (
            <span>{duration(row.durationSec)}</span>
          )}
          {row.outBytes !== undefined && (
            <span className="text-forge-primary font-bold">→ {bytes(row.outBytes)}</span>
          )}
          {active && row.startedAt !== undefined && <Elapsed since={row.startedAt} />}
        </div>
        {row.pct !== undefined && (
          <div className="progress-track mt-2">
            <div
              className={clsx(
                'progress-fill',
                done && 'progress-fill-done',
                failed && 'progress-fill-fail',
              )}
              style={{ width: `${Math.max(row.pct, 1)}%` }}
            />
          </div>
        )}

        {/* Stage line — what step we're on, or the error if failed */}
        {(row.stage || row.error) && (
          <div
            className={clsx(
              'flex items-center gap-1.5 mt-1.5 text-[10.5px]',
              failed ? 'text-rose-300' : active ? 'text-forge-primaryHi' : 'text-forge-text/55',
            )}
          >
            {active && <Loader2 className="w-3 h-3 animate-spin shrink-0" />}
            {failed && <X className="w-3 h-3 shrink-0" />}
            <span className="font-semibold">{row.error ? 'Failed' : row.stage}</span>
            {!failed && row.pct !== undefined && active && (
              <span className="text-forge-text/45 tabular-nums">· {row.pct.toFixed(0)}%</span>
            )}
          </div>
        )}

        {/* Live log line — what the underlying binary is currently doing */}
        {active && row.log && (
          <div className="flex items-center gap-1.5 mt-1 text-[10px] text-forge-text/40 font-mono">
            <Activity className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{row.log}</span>
          </div>
        )}

        {/* Error detail block — wraps so users can read the whole message */}
        {failed && (
          <div className="text-[10.5px] text-rose-300/80 mt-1.5 leading-relaxed bg-rose-500/[0.06] border border-rose-400/15 rounded p-2 whitespace-pre-wrap break-words">
            {row.error}
          </div>
        )}
      </div>

      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
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

/**
 * Live elapsed-time counter, updates once per second. Only mounted while the
 * row is active so we don't have a permanent timer per row.
 */
function Elapsed({ since }: { since: number }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const sec = Math.max(0, Math.floor((now - since) / 1000));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return (
    <span className="text-forge-primaryHi/70">
      {m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}s`}
    </span>
  );
}

function StatusPill({ row }: { row: FileRow }) {
  if (row.error) return <span className="pill pill-fail">Failed</span>;
  if (row.pct === 100) return <span className="pill pill-ok">Done</span>;
  if (row.pct !== undefined && row.pct > 0) return <span className="pill pill-accent">Processing</span>;
  if (row.pct === 0) return <span className="pill pill-primary">Queued</span>;
  return <span className="pill pill-mute">Ready</span>;
}

function EmptyState({ kind }: { kind: 'image' | 'video' | 'audio' }) {
  const Icon = kind === 'image' ? ImageIcon : kind === 'video' ? Film : AudioLines;
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
