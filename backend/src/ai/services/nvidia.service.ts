import OpenAI from 'openai';
import { env } from '../../config/env.config';
import { AppError } from '../../utils/app-error';
import {
  LLAMA_VISION_SYSTEM_PROMPT,
  NEMOTRON_SYSTEM_PROMPT,
  NVIDIA_MODELS,
} from '../config/multimodal-prompts';
import { AIProvider, AIProviderInput, AIResponse } from '../core/types';
import { OpenAIProvider } from '../providers/openai.provider';
import { NvidiaRivaService } from './nvidia-riva.service';

type NvidiaClient = Pick<OpenAI, 'chat'>;

interface NvidiaServiceDeps {
  chatProvider?: AIProvider;
  createClient?: (baseURL: string) => NvidiaClient;
  transcriber?: Pick<NvidiaRivaService, 'transcribeAudio'>;
}

export interface NvidiaMediaInput {
  bytes: Buffer;
  mimeType: string;
  abortSignal?: AbortSignal;
  correlationId?: string;
  sourceMessageId?: string;
}

/** Adaptador NVIDIA: Riva para audio, SDK OpenAI para Vision y el chat existente. */
export class NvidiaService implements AIProvider {
  private readonly chatProvider: AIProvider;
  private readonly transcriber: Pick<NvidiaRivaService, 'transcribeAudio'>;

  constructor(private readonly deps: NvidiaServiceDeps = {}) {
    this.chatProvider = deps.chatProvider ?? new OpenAIProvider();
    this.transcriber = deps.transcriber ?? new NvidiaRivaService();
  }

  transcribeAudio(input: NvidiaMediaInput): Promise<string> {
    return this.transcriber.transcribeAudio(input);
  }

  async analyzeImage(input: NvidiaMediaInput): Promise<string> {
    const mimeType = input.mimeType.toLowerCase().split(';')[0].trim();
    if (
      !['image/jpeg', 'image/png'].includes(mimeType) ||
      !input.bytes.length ||
      input.bytes.length > 5 * 1024 * 1024
    ) {
      throw AppError.badRequest('Imagen vacía, demasiado grande o de formato no permitido');
    }

    const result = await this.createClient(
      'https://integrate.api.nvidia.com/v1',
    ).chat.completions.create(
      {
        model: NVIDIA_MODELS.vision,
        messages: [
          {
            role: 'user',
            content: [
              // Llama Vision no admite role=system con imágenes en su plantilla multimodal.
              { type: 'text', text: LLAMA_VISION_SYSTEM_PROMPT },
              {
                type: 'image_url',
                image_url: { url: `data:${mimeType};base64,${input.bytes.toString('base64')}` },
              },
            ],
          },
        ],
        max_tokens: 1024,
        temperature: 0.1,
        stream: false,
      },
      { signal: input.abortSignal },
    );
    const text = result.choices[0]?.message.content?.trim();
    if (!text) throw new AppError('Empty image analysis', 502, 'AI_EMPTY_IMAGE_ANALYSIS');
    return text;
  }

  chatWithNemotron(input: AIProviderInput): Promise<AIResponse> {
    return this.chatProvider.generate({
      ...input,
      model: NVIDIA_MODELS.chat,
      messages: [{ role: 'system', content: NEMOTRON_SYSTEM_PROMPT }, ...input.messages],
    });
  }

  generate(input: AIProviderInput): Promise<AIResponse> {
    return input.model === NVIDIA_MODELS.chat
      ? this.chatWithNemotron(input)
      : this.chatProvider.generate(input);
  }

  private createClient(baseURL: string): NvidiaClient {
    if (this.deps.createClient) return this.deps.createClient(baseURL);
    if (!env.NVIDIA_API_KEY) {
      throw new AppError('NVIDIA_API_KEY is missing', 503, 'AI_PROVIDER_UNAVAILABLE');
    }
    return new OpenAI({
      apiKey: env.NVIDIA_API_KEY,
      baseURL,
      timeout: env.NVIDIA_MULTIMODAL_TIMEOUT_MS,
      maxRetries: 0,
    });
  }
}
