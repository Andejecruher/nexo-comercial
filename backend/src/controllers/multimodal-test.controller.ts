/**
 * multimodal-test.controller.ts — Internal test endpoints for the decoupled
 * multimodal layer. Each handler accepts ONE file via multipart/form-data,
 * parses options from the query string, and returns the full traced result
 * envelope (steps, timings, per-stage errors) WITHOUT invoking the agent.
 */
import { NextFunction, Request, Response } from 'express';
import {
  MultimodalFileKind,
  MultimodalTestFile,
  MultimodalTestResult,
} from '../services/multimodal-test/contracts';
import { buildAgentContext } from '../services/multimodal-test/agent-context.builder';
import { MultimodalTestOrchestrator } from '../services/multimodal-test/multimodal-test.orchestrator';
import { parseMultimodalTestOptions } from '../services/multimodal-test/multimodal-test.options';
import { parseMultipartFile } from '../services/multimodal-test/multipart-parser';
import { AppError } from '../utils/app-error';

export class MultimodalTestController {
  constructor(private readonly orchestrator: MultimodalTestOrchestrator) {}

  /** POST /internal/test/audio/transcribe */
  transcribeAudio = (req: Request, res: Response, next: NextFunction): Promise<void> =>
    this.handle(req, res, next, 'audio');

  /** POST /internal/test/document/extract */
  extractDocument = (req: Request, res: Response, next: NextFunction): Promise<void> =>
    this.handle(req, res, next, 'document');

  /** POST /internal/test/image/analyze */
  analyzeImage = (req: Request, res: Response, next: NextFunction): Promise<void> =>
    this.handle(req, res, next, 'image');

  /** POST /internal/test/video/process */
  processVideo = (req: Request, res: Response, next: NextFunction): Promise<void> =>
    this.handle(req, res, next, 'video');

  /** POST /internal/multimodal/test — unified endpoint (auto-detects kind) */
  testUnified = (req: Request, res: Response, next: NextFunction): Promise<void> =>
    this.handle(req, res, next, null);

  private async handle(
    req: Request,
    res: Response,
    next: NextFunction,
    kind: MultimodalFileKind | null,
  ): Promise<void> {
    try {
      const file = this.parseFile(req);
      const options = parseMultimodalTestOptions(req.query as Record<string, unknown>);
      const result =
        kind === null
          ? await this.orchestrator.run(file, options)
          : await this.orchestrator.runAs(kind, file, options);
      if (result.status === 'failed') {
        // Full envelope is always returned so the trace (steps/timings/errors)
        // is never lost; the HTTP status reflects the primary stage error.
        const primary = result.errors[0]?.statusCode ?? 500;
        res.status(primary).json(this.toResponse(result));
        return;
      }
      res.status(200).json(this.toResponse(result));
    } catch (error) {
      // Pre-pipeline validation errors (size/mime/no-pipeline) reach the global
      // handler; their AppError codes identify the failing stage.
      next(error);
    }
  }

  private parseFile(req: Request): MultimodalTestFile {
    if (!Buffer.isBuffer(req.body)) {
      throw AppError.badRequest('Se requiere multipart/form-data con un archivo');
    }
    const parsed = parseMultipartFile(req.body, req.headers['content-type'] ?? '');
    if (!parsed) {
      throw AppError.badRequest('No se encontró ningún archivo en la solicitud multipart');
    }
    return {
      filename: parsed.filename,
      mimeType: parsed.mimeType,
      buffer: parsed.contents,
    };
  }

  /** Adds the agent-ready context so results can be reused without re-running. */
  private toResponse(result: MultimodalTestResult): Record<string, unknown> {
    const agentContext = buildAgentContext([result]);
    return {
      ...result,
      agentContext,
    };
  }
}
