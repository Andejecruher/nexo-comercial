import { AIProvider, AIProviderName } from '../core/types';
import { AnthropicProvider } from './anthropic.provider';
import { NvidiaService } from '../services/nvidia.service';

/** Factory desacoplada de provider concreto. */
export class ProviderFactory {
  create(provider: AIProviderName): AIProvider {
    if (provider === 'anthropic') {
      return new AnthropicProvider();
    }
    return new NvidiaService();
  }
}
