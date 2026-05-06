import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FileRow } from '../components/FileList';
import type { ProgressEvent } from '../../../preload/index';

let _id = 0;
const nextId = () => `f${++_id}`;

export function useFileQueue(kind: 'image' | 'video') {
  const [rows, setRows] = useState<FileRow[]>([]);
  const [running, setRunning] = useState<string | null>(null); // jobId

  // Subscribe to job:progress for the lifetime of this hook
  useEffect(() => {
    const off = window.forge.onProgress((e: ProgressEvent) => {
      setRows((rs) =>
        rs.map((r) =>
          r.id === e.itemId
            ? {
                ...r,
                pct: e.pct,
                stage: e.stage,
                outputPath: e.outputPath ?? r.outputPath,
              }
            : r,
        ),
      );
    });
    return () => {
      off();
    };
  }, []);

  const addPaths = useCallback(
    async (paths: string[]) => {
      // Dedupe
      setRows((rs) => {
        const have = new Set(rs.map((r) => r.path));
        const fresh = paths.filter((p) => !have.has(p));
        if (fresh.length === 0) return rs;
        const newRows: FileRow[] = fresh.map((p) => ({ id: nextId(), path: p }));
        // probe asynchronously
        window.forge.probe(fresh).then((probes) => {
          setRows((rs2) =>
            rs2.map((r) => {
              const probe = probes.find((p) => p.path === r.path);
              return probe?.ok
                ? {
                    ...r,
                    width: probe.width,
                    height: probe.height,
                    bytes: probe.bytes,
                    durationSec: probe.durationSec,
                    thumbnail: probe.thumbnail,
                  }
                : r;
            }),
          );
        });
        return [...rs, ...newRows];
      });
    },
    [],
  );

  const remove = useCallback((id: string) => {
    setRows((rs) => rs.filter((r) => r.id !== id));
  }, []);

  const clear = useCallback(() => setRows([]), []);

  const items = useMemo(
    () => rows.map((r) => ({ id: r.id, inputPath: r.path })),
    [rows],
  );

  return {
    rows,
    setRows,
    items,
    addPaths,
    remove,
    clear,
    running,
    setRunning,
    kind,
  };
}
