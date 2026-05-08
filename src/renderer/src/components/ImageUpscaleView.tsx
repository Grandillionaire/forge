import { useEffect, useState } from 'react';
import { Sparkles, X, Cloud, Cpu, AlertTriangle, Eye, EyeOff, Trash2, ExternalLink } from 'lucide-react';
import { Dropzone } from './Dropzone';
import { OutputDir } from './OutputDir';
import { FileList } from './FileList';
import { useFileQueue } from '../lib/useFileQueue';
import type { CloudUpscaleModel, ImageUpscaleOptions } from '../../../preload/index';
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

const FAL_KEY_STORAGE = 'forge.fal.apiKey';

interface CloudModelOption {
  value: CloudUpscaleModel;
  label: string;
  approxUsd: number;
  sub: string;
}

const CLOUD_MODELS: CloudModelOption[] = [
  { value: 'fal-ai/aura-sr',         label: 'aura-sr',          approxUsd: 0.001, sub: 'cheap, fast, photographic' },
  { value: 'fal-ai/esrgan',          label: 'esrgan',           approxUsd: 0.005, sub: 'same as local but on their GPU' },
  { value: 'fal-ai/clarity-upscaler', label: 'clarity-upscaler', approxUsd: 0.04,  sub: 'premium photoreal · expensive' },
  { value: 'fal-ai/ccsr',            label: 'ccsr',             approxUsd: 0.04,  sub: 'content-aware · expensive' },
];

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
  const [engine, setEngine] = useState<'local' | 'cloud'>('local');
  const [preferAi, setPreferAi] = useState(true);
  const [cloudModel, setCloudModel] = useState<CloudUpscaleModel>('fal-ai/aura-sr');
  const [outputDir, setOutputDir] = useState('');
  // Fal.ai key — stored in localStorage, never leaves the device except via
  // direct API calls the user makes.
  const [falKey, setFalKey] = useState('');
  const [falKeyDraft, setFalKeyDraft] = useState('');
  const [falKeyVisible, setFalKeyVisible] = useState(false);

  useEffect(() => {
    try { setFalKey(localStorage.getItem(FAL_KEY_STORAGE) ?? ''); } catch { /* ignore */ }
  }, []);

  const saveFalKey = () => {
    const trimmed = falKeyDraft.trim();
    if (!trimmed) return;
    try { localStorage.setItem(FAL_KEY_STORAGE, trimmed); } catch { /* ignore */ }
    setFalKey(trimmed);
    setFalKeyDraft('');
  };
  const clearFalKey = () => {
    try { localStorage.removeItem(FAL_KEY_STORAGE); } catch { /* ignore */ }
    setFalKey('');
  };

  const start = async () => {
    if (q.items.length === 0 || !outputDir) return;
    if (engine === 'cloud' && !falKey) return;
    q.setRows((rs) =>
      rs.map((r) => ({ ...r, pct: 0, stage: 'Queued', error: undefined, outputPath: undefined, log: undefined, startedAt: undefined, outBytes: undefined })),
    );
    q.setRunning('running');
    const result = await window.forge.imageUpscale(q.items, {
      scale,
      model,
      outputFormat: format,
      outputDir,
      engine,
      preferAi,
      cloudModel: engine === 'cloud' ? cloudModel : undefined,
      apiKey: engine === 'cloud' ? falKey : undefined,
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
  const cloudModelInfo = CLOUD_MODELS.find((m) => m.value === cloudModel);
  const estCost = cloudModelInfo ? cloudModelInfo.approxUsd * q.items.length : 0;
  const cloudReady = engine !== 'cloud' || !!falKey;

  return (
    <div className="space-y-5">
      <Dropzone
        kind="image"
        onFiles={q.addPaths}
        hint="Bulk-upscale JPG, PNG, WebP, HEIC and more — up to 4× with AI."
      />

      {/* Engine picker — local vs cloud */}
      <Card padding="sm">
        <div className="flex items-stretch gap-2 p-1">
          <EngineButton
            active={engine === 'local'}
            onClick={() => setEngine('local')}
            icon={<Cpu className="w-4 h-4" />}
            title="Local"
            sub="Real-ESRGAN on your GPU · free · offline"
          />
          <EngineButton
            active={engine === 'cloud'}
            onClick={() => setEngine('cloud')}
            icon={<Cloud className="w-4 h-4" />}
            title="Cloud"
            sub="fal.ai · pay-per-image · best quality"
          />
        </div>
      </Card>

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

          {engine === 'local' ? (
            <Field label="Local model">
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
          ) : (
            <Field
              label="Cloud model"
              hint={
                cloudModelInfo && (
                  <span className="tabular-nums">
                    ≈ ${cloudModelInfo.approxUsd.toFixed(3)}/image
                  </span>
                )
              }
            >
              <Select<string>
                value={cloudModel}
                onChange={(v) => setCloudModel(v as CloudUpscaleModel)}
                options={CLOUD_MODELS.map((m) => ({
                  value: m.value,
                  label: m.label,
                  sub: m.sub,
                }))}
              />
            </Field>
          )}

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

          {engine === 'local' ? (
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
          ) : (
            <Field
              label="Estimated cost"
              hint={
                q.items.length === 0 ? (
                  <span className="text-forge-text/50">Drop images to estimate</span>
                ) : (
                  <span className="text-forge-text/55">
                    {q.items.length} {q.items.length === 1 ? 'image' : 'images'} · paid via fal.ai
                  </span>
                )
              }
            >
              <div className="input-base flex items-center font-bold tabular-nums text-forge-primaryHi">
                ${estCost.toFixed(3)}
              </div>
            </Field>
          )}
        </div>
      </Card>

      {/* Cloud-only: API key field */}
      {engine === 'cloud' && (
        <Card padding="sm">
          <div className="px-3 py-2 space-y-3">
            {!falKey ? (
              <>
                <div className="flex items-start gap-2 text-[12px] text-amber-200/85 leading-relaxed">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    Cloud upscaling sends your images to <strong>fal.ai</strong>. They charge you
                    directly per image. Forge stores the key only on this device.
                    <button
                      onClick={() => window.forge.openExternal('https://fal.ai/dashboard/keys')}
                      className="inline-flex items-center gap-1 ml-1 text-forge-primaryHi hover:underline"
                    >
                      Get a key <ExternalLink className="w-3 h-3" />
                    </button>
                  </div>
                </div>
                <div>
                  <label className="label-eyebrow">fal.ai API key</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="password"
                      className="input-base flex-1 font-mono text-[12px]"
                      placeholder="key_id:key_secret or fal-key-..."
                      value={falKeyDraft}
                      onChange={(e) => setFalKeyDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveFalKey();
                      }}
                      autoComplete="off"
                      spellCheck={false}
                    />
                    <Button onClick={saveFalKey} disabled={!falKeyDraft.trim()}>Save</Button>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-[12px] text-emerald-300/85">
                  <Cloud className="w-3.5 h-3.5" />
                  <span>fal.ai key configured</span>
                  {falKeyVisible && (
                    <code className="font-mono text-[11px] text-forge-text/55 ml-1">{falKey}</code>
                  )}
                  {!falKeyVisible && (
                    <code className="font-mono text-[11px] text-forge-text/55 ml-1">
                      ···{falKey.slice(-6)}
                    </code>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setFalKeyVisible((v) => !v)}
                    className="btn-icon"
                    title={falKeyVisible ? 'Hide key' : 'Show key'}
                  >
                    {falKeyVisible ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </button>
                  <button onClick={clearFalKey} className="btn-icon" title="Remove key">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </Card>
      )}

      {engine === 'local' && !realesrganAvailable && (
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
          disabled={q.items.length === 0 || !outputDir || !!q.running || !cloudReady}
          icon={engine === 'cloud' ? <Cloud /> : <Sparkles />}
        >
          {q.running
            ? 'Processing…'
            : engine === 'cloud'
            ? `Upscale on cloud · $${estCost.toFixed(3)}`
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

function EngineButton({
  active,
  onClick,
  icon,
  title,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  sub: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 text-left rounded-lg p-3 transition-colors ${
        active
          ? 'bg-primary-gradient-soft border border-forge-primary/40'
          : 'bg-white/[0.02] border border-white/[0.06] hover:border-white/[0.12]'
      }`}
    >
      <div className={`flex items-center gap-2 ${active ? 'text-forge-primaryHi' : 'text-forge-text/85'}`}>
        {icon}
        <span className="text-[13px] font-semibold">{title}</span>
      </div>
      <div className="text-[11px] text-forge-text/55 mt-0.5 leading-snug">{sub}</div>
    </button>
  );
}
