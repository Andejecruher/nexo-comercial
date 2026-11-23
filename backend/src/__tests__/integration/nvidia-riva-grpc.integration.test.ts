import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  jest,
} from '@jest/globals';
import {
  ChannelCredentials,
  credentials,
  loadPackageDefinition,
  Metadata,
  Server,
  ServerCredentials,
  ServerDuplexStream,
  ServiceDefinition,
  status,
} from '@grpc/grpc-js';
import { loadSync } from '@grpc/proto-loader';
import { join } from 'path';
import { env } from '../../config/env.config';
import { NvidiaRivaService, RivaRecognitionClient } from '../../ai/services/nvidia-riva.service';

interface WireRequest {
  streamingConfig?: { config: { encoding: string; sampleRateHertz: number; languageCode: string } };
  audioContent?: Buffer;
}
interface WireResponse {
  results: { isFinal: boolean; alternatives: { transcript: string }[] }[];
}

describe('NVIDIA Riva — transporte gRPC local con protocolos oficiales', () => {
  const server = new Server();
  const pcm = Buffer.alloc(150_000, 7);
  let address: string;
  let service: NvidiaRivaService;
  let requests: WireRequest[];
  let metadata: Metadata;
  let fail = false;
  let ClientConstructor: new (
    address: string,
    credentials: ChannelCredentials,
  ) => RivaRecognitionClient;

  Object.assign(env, { NVIDIA_API_KEY: env.NVIDIA_API_KEY });

  beforeAll(async () => {
    const definition = loadSync(join(__dirname, '../../ai/services/riva/proto/riva_asr.proto'), {
      includeDirs: [join(__dirname, '../../ai/services')],
      enums: String,
      bytes: Buffer,
    });
    const packages = loadPackageDefinition(definition) as unknown as {
      nvidia: {
        riva: {
          asr: {
            RivaSpeechRecognition: {
              new (address: string, credentials: ChannelCredentials): RivaRecognitionClient;
              service: ServiceDefinition;
            };
          };
        };
      };
    };
    ClientConstructor = packages.nvidia.riva.asr.RivaSpeechRecognition;
    server.addService(packages.nvidia.riva.asr.RivaSpeechRecognition.service, {
      streamingRecognize(call: ServerDuplexStream<WireRequest, WireResponse>) {
        metadata = call.metadata;
        call.on('data', (request: WireRequest) => requests.push(request));
        call.on('end', () => {
          if (fail) {
            call.emit('error', { code: status.UNAVAILABLE, details: 'Test service unavailable' });
            return;
          }
          call.write({
            results: [{ isFinal: true, alternatives: [{ transcript: 'hay un bache' }] }],
          });
          call.write({
            results: [{ isFinal: true, alternatives: [{ transcript: 'en calle Hidalgo' }] }],
          });
          call.end();
        });
      },
    });
    const port = await new Promise<number>((resolve, reject) => {
      server.bindAsync('127.0.0.1:0', ServerCredentials.createInsecure(), (error, port) => {
        if (error) reject(error);
        else resolve(port);
      });
    });
    address = `127.0.0.1:${port}`;
  });

  beforeEach(() => {
    requests = [];
    fail = false;
    jest.replaceProperty(env, 'NVIDIA_API_KEY', 'nvapi-local-test');
    service = new NvidiaRivaService({
      createClient: () => new ClientConstructor(address, credentials.createInsecure()),
      transcoder: { transcodeToPcm16k: async () => pcm },
    });
  });
  afterEach(() => {
    service?.close();
    jest.restoreAllMocks();
  });
  afterAll(() => server.forceShutdown());

  it('envía configuración, metadatos y todo el PCM; recibe y une los resultados finales', async () => {
    const transcript = await service.transcribeAudio({
      bytes: Buffer.from('audio'),
      mimeType: 'audio/ogg',
    });
    expect(transcript).toBe('hay un bache en calle Hidalgo');
    expect(metadata.get('authorization')).toEqual(['Bearer nvapi-local-test']);
    expect(metadata.get('function-id')).toEqual([env.NVIDIA_RIVA_FUNCTION_ID]);
    expect(requests[0]?.streamingConfig?.config).toMatchObject({
      encoding: 'LINEAR_PCM',
      sampleRateHertz: 16000,
      languageCode: 'es-US',
    });
    const chunks = requests.slice(1).map((request) => request.audioContent!);
    expect(chunks).toHaveLength(3);
    expect(Buffer.concat(chunks)).toEqual(pcm);
  });

  it('traduce un error gRPC real en un fallo recuperable por el middleware', async () => {
    fail = true;
    await expect(
      service.transcribeAudio({ bytes: Buffer.from('audio'), mimeType: 'audio/ogg' }),
    ).rejects.toMatchObject({ statusCode: 503, code: 'AI_RIVA_UNAVAILABLE' });
  });
});
