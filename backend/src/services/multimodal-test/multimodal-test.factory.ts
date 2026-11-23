/**
 * multimodal-test.factory.ts — Composition root for the multimodal test layer.
 */
import { ProviderRegistry } from './provider-registry';
import { AudioTestPipeline } from './pipelines/audio-test.pipeline';
import { DocumentTestPipeline } from './pipelines/document-test.pipeline';
import { ImageTestPipeline } from './pipelines/image-test.pipeline';
import { VideoTestPipeline } from './pipelines/video-test.pipeline';
import { RivaSttProvider } from './providers/riva-stt.provider';
import { DocumentAiOcrProvider } from './providers/document-ai-ocr.provider';
import { NativeDocumentTextStub } from './providers/native-document-text.stub';
import { NvidiaVisionProvider } from './providers/nvidia-vision.provider';
import { ImageHeaderMetadataProvider } from './providers/image-header-metadata.provider';
import {
  FfmpegVideoAudioExtractor,
  FfmpegVideoFrameExtractor,
  FfprobeMetadataProvider,
} from './providers/ffmpeg-media.tools';
import { MultimodalTestOrchestrator } from './multimodal-test.orchestrator';

export function createMultimodalTestOrchestrator(): MultimodalTestOrchestrator {
  // Audio pipeline registry
  const audioRegistry = new ProviderRegistry()
    .register('stt', new RivaSttProvider())
    .register('mediaMetadata', new FfprobeMetadataProvider());

  // Document pipeline registry
  const documentRegistry = new ProviderRegistry()
    .register('documentText', new NativeDocumentTextStub())
    .register('ocr', new DocumentAiOcrProvider())
    .register('mediaMetadata', new FfprobeMetadataProvider());

  // Image pipeline registry
  const imageRegistry = new ProviderRegistry()
    .register('imageAnalysis', new NvidiaVisionProvider())
    .register('ocr', new DocumentAiOcrProvider())
    .register('mediaMetadata', new ImageHeaderMetadataProvider());

  // Video pipeline registry
  const videoRegistry = new ProviderRegistry()
    .register('mediaMetadata', new FfprobeMetadataProvider())
    .register('videoAudio', new FfmpegVideoAudioExtractor())
    .register('stt', new RivaSttProvider())
    .register('videoFrames', new FfmpegVideoFrameExtractor());

  const pipelines = {
    audio: new AudioTestPipeline(audioRegistry),
    document: new DocumentTestPipeline(documentRegistry),
    image: new ImageTestPipeline(imageRegistry),
    video: new VideoTestPipeline(videoRegistry),
  };

  return new MultimodalTestOrchestrator(pipelines);
}

export { createMultimodalTestOrchestrator as createMultimodalTest };
