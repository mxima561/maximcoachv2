import { ElevenLabsClient } from "elevenlabs";
import type { VoiceSession } from "./session.js";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM"; // Rachel — general purpose

export class ElevenLabsTTS {
  private client: ElevenLabsClient;
  private session: VoiceSession;
  private voiceId: string;
  private aborted = false;

  constructor(session: VoiceSession, voiceId?: string) {
    this.client = new ElevenLabsClient({ apiKey: ELEVENLABS_API_KEY });
    this.session = session;
    this.voiceId = voiceId ?? DEFAULT_VOICE_ID;
  }

  setVoice(voiceId: string): void {
    this.voiceId = voiceId;
  }

  /**
   * Stream a sentence to TTS and pipe PCM audio chunks back to the client.
   * Returns when all audio for this sentence has been sent.
   */
  async speak(text: string): Promise<void> {
    if (this.aborted) return;
    if (!ELEVENLABS_API_KEY) {
      console.error(`[tts] session=${this.session.sessionId} ELEVENLABS_API_KEY not set`);
      return;
    }

    try {
      const audioStream = await this.client.textToSpeech.convertAsStream(
        this.voiceId,
        {
          text,
          model_id: "eleven_flash_v2_5",
          output_format: "pcm_16000",
        }
      );

      for await (const chunk of audioStream) {
        if (this.aborted) break;

        // chunk is a Buffer of PCM audio data
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk as ArrayBuffer);
        this.session.sendBinary(buffer);
      }
    } catch (err) {
      if (!this.aborted) {
        console.error(
          `[tts] session=${this.session.sessionId} error`,
          err instanceof Error ? err.message : err
        );
      }
    }
  }

  /**
   * Process multiple sentences sequentially.
   * Each sentence is sent to ElevenLabs as a separate request.
   */
  async speakSentences(sentences: string[]): Promise<void> {
    for (const sentence of sentences) {
      if (this.aborted) break;
      await this.speak(sentence);
    }
  }

  /**
   * Flush/abort current TTS stream on interruption.
   * Signals to stop sending audio and clear any pending sentences.
   */
  flush(): void {
    this.aborted = true;
  }

  /**
   * Reset abort state for a new response.
   */
  reset(): void {
    this.aborted = false;
  }
}
