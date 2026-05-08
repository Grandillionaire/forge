import ffmpegStaticDefault from 'ffmpeg-static';
import ffprobeInstaller from '@ffprobe-installer/ffprobe';
import ffmpeg from 'fluent-ffmpeg';

// ffmpeg-static returns the binary path as the default export.
// @ffprobe-installer/ffprobe has correct per-arch binaries (the older ffprobe-static
// shipped an x86_64 binary in its darwin/arm64 directory — broken on Apple Silicon).
const ffmpegPath = (ffmpegStaticDefault as unknown as string) || '';
const ffprobePath = ffprobeInstaller.path;

if (ffmpegPath) ffmpeg.setFfmpegPath(ffmpegPath);
if (ffprobePath) ffmpeg.setFfprobePath(ffprobePath);

export { ffmpeg, ffmpegPath, ffprobePath };

export interface ProbeResult {
  width: number;
  height: number;
  durationSec: number;
  fps: number;
  hasAudio: boolean;
  bitrate: number;
}

export interface AudioProbeResult {
  durationSec: number;
  bitrate: number;
  sampleRate: number;
  channels: number;
  codec: string;
}

/**
 * Light-weight audio probe — succeeds for any file with at least one audio
 * stream. probeVideo() throws when there's no video stream, so audio-only
 * files (mp3, wav, flac, ...) need their own path.
 */
export function probeAudio(path: string): Promise<AudioProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err);
      const a = data.streams.find((s) => s.codec_type === 'audio');
      if (!a) return reject(new Error('No audio stream'));
      resolve({
        durationSec: Number(data.format.duration ?? 0),
        bitrate: Number(data.format.bit_rate ?? a.bit_rate ?? 0),
        sampleRate: Number(a.sample_rate ?? 0),
        channels: a.channels ?? 0,
        codec: a.codec_name ?? '',
      });
    });
  });
}

export function probeVideo(path: string): Promise<ProbeResult> {
  return new Promise((resolve, reject) => {
    ffmpeg.ffprobe(path, (err, data) => {
      if (err) return reject(err);
      const stream = data.streams.find((s) => s.codec_type === 'video');
      if (!stream) return reject(new Error('No video stream'));
      const audio = data.streams.some((s) => s.codec_type === 'audio');
      const [num, den] = (stream.r_frame_rate ?? '30/1').split('/').map(Number);
      resolve({
        width: stream.width ?? 0,
        height: stream.height ?? 0,
        durationSec: Number(data.format.duration ?? 0),
        fps: den ? num / den : 30,
        hasAudio: audio,
        bitrate: Number(data.format.bit_rate ?? 0),
      });
    });
  });
}
