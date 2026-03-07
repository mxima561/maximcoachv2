import { spawn } from "child_process";
import { Readable } from "stream";

/**
 * Compress raw PCM audio to Opus/OGG using ffmpeg.
 * Input: 16-bit PCM, 16kHz, mono
 * Output: Opus in OGG container (~20x smaller)
 */
export function compressPcmToOpus(pcmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f", "s16le",           // input format: signed 16-bit little-endian
      "-ar", "16000",          // sample rate: 16kHz
      "-ac", "1",              // channels: mono
      "-i", "pipe:0",          // read from stdin
      "-c:a", "libopus",       // encode with Opus
      "-b:a", "24k",           // bitrate: 24kbps (good quality for speech)
      "-application", "voip",  // optimize for speech
      "-f", "ogg",             // output container
      "pipe:1",                // write to stdout
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];

    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {}); // suppress ffmpeg stderr noise

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`ffmpeg not found: ${err.message}. Install ffmpeg to enable audio compression.`));
    });

    // Pipe PCM data to ffmpeg stdin
    const readable = Readable.from(pcmBuffer);
    readable.pipe(ffmpeg.stdin);
  });
}

/**
 * Compress raw PCM to MP3 using ffmpeg (fallback when Opus not supported).
 */
export function compressPcmToMp3(pcmBuffer: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const ffmpeg = spawn("ffmpeg", [
      "-f", "s16le",
      "-ar", "16000",
      "-ac", "1",
      "-i", "pipe:0",
      "-c:a", "libmp3lame",
      "-b:a", "32k",
      "-f", "mp3",
      "pipe:1",
    ], {
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    ffmpeg.stdout.on("data", (chunk: Buffer) => chunks.push(chunk));
    ffmpeg.stderr.on("data", () => {});

    ffmpeg.on("close", (code) => {
      if (code === 0) {
        resolve(Buffer.concat(chunks));
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });

    ffmpeg.on("error", (err) => {
      reject(new Error(`ffmpeg not found: ${err.message}`));
    });

    const readable = Readable.from(pcmBuffer);
    readable.pipe(ffmpeg.stdin);
  });
}
