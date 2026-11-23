import type { Request, Response, NextFunction } from 'express';
import { ok } from '../utils/api-response';
import type { EmailDiagnosticsService } from '../services/email-diagnostics.service';

export class EmailDiagnosticsController {
  constructor(private readonly service: EmailDiagnosticsService) {}

  configuration = (_req: Request, res: Response): void => {
    res.json(ok(this.service.getConfigurationStatus()));
  };

  connection = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json(ok(await this.service.checkConnection(req.user?.id ?? 'unknown')));
    } catch (error) {
      next(error);
    }
  };

  sendText = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        ...ok(await this.service.sendText(req.body, req.user?.id ?? 'unknown')),
        message: 'El correo de prueba fue enviado al proveedor correctamente.',
      });
    } catch (error) {
      next(error);
    }
  };

  sendHtml = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      res.json({
        ...ok(await this.service.sendHtml(req.body, req.user?.id ?? 'unknown')),
        message: 'El correo HTML de prueba fue enviado al proveedor correctamente.',
      });
    } catch (error) {
      next(error);
    }
  };

  sendInvitationPreview = async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      res.json({
        ...ok(await this.service.sendInvitationPreview(req.body, req.user?.id ?? 'unknown')),
        message: 'La vista previa de invitación fue enviada al proveedor correctamente.',
      });
    } catch (error) {
      next(error);
    }
  };
}
