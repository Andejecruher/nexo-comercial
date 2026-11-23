import express from 'express';
import request from 'supertest';
import { createTemplatesRouter } from '../../routes/templates.routes';
import { WhatsAppLineConfigResolver } from '../../services/whatsapp/whatsapp-line-config.resolver';
import { TemplateStatusService } from '../../services/templates/template-status.service';
import { errorHandler } from '../../middlewares/errorHandler';
jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (_req: unknown, _res: unknown, next: () => void) => next(),
}));
jest.mock('../../middlewares/permission.middleware', () => ({
  requireAnyPermission: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  requirePermissions: () => (_req: unknown, _res: unknown, next: () => void) => next(),
}));

describe('legacy template listing response contract', () => {
  afterEach(() => jest.restoreAllMocks());
  it('does not reclassify a malformed HTTP 200 list response as a Meta rejection', async () => {
    jest.spyOn(WhatsAppLineConfigResolver.prototype, 'resolve').mockResolvedValue({
      businessAccountId: '123',
      accessToken: 'private-token',
    } as never);
    jest.spyOn(TemplateStatusService.prototype, 'cursor').mockResolvedValue('1');
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => {
        throw new SyntaxError('Unexpected upstream JSON');
      },
    } as never);
    const app = express();
    app.use('/templates', createTemplatesRouter({} as never));
    app.use(errorHandler);
    const errors = jest.spyOn(console, 'error').mockImplementation();
    const res = await request(app).get('/templates/line?limit=1');
    expect(res.status).toBe(500);
    expect(res.body).toEqual({
      success: false,
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(errors.mock.calls.flat().join(' ')).not.toContain('private-token');
  });
});
