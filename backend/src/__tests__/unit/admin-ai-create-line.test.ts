/**
 * Unit tests: AdminAiController.createLine
 *
 * Verifies the WhatsApp/Meta payload maps to CommunicationLine columns,
 * encrypts secrets, and stores departmentIds in metadata.
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { ZodError } from 'zod';
import { AppError } from '../../utils/app-error';

const AGENT_ID = '9d1f7d90-0b68-434b-8ca2-2f79fa9a2f01';

const mockEncrypt = jest.fn((plain: string) => `encrypted:${plain}`);

jest.mock('../../utils/crypto', () => ({
  encrypt: (plain: string) => mockEncrypt(plain),
}));

const mockRepo = {
  findAgentById: jest.fn(
    async (_id: string): Promise<{ id: string; name: string } | null> => ({
      id: AGENT_ID,
      name: 'Agent',
    }),
  ),
  findLineByChannelAndExternalIdentifier: jest.fn(
    async (_channel: string, _externalIdentifier: string): Promise<{ id: string } | null> => null,
  ),
  createLine: jest.fn(async (data: Record<string, unknown>) => ({ id: 'line-1', ...data })),
};

jest.mock('../../repositories/admin-ai.repository', () => ({
  AdminAiRepository: jest.fn().mockImplementation(() => mockRepo),
}));

import { AdminAiController } from '../../controllers/admin-ai.controller';

function makeRes() {
  const res: {
    statusCode?: number;
    body?: unknown;
    status: (code: number) => typeof res;
    json: (payload: unknown) => typeof res;
  } = {
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.body = payload;
      return this;
    },
  };
  return res;
}

const DEPARTMENT_IDS = [
  '23561152-d9c7-4fec-99b8-69a4edaf48ac',
  '28982d7a-5151-498b-9823-50256d2327a4',
];

const CREATE_BODY = {
  displayName: 'Voz Ciudadana Test',
  phoneNumber: '+529601000000',
  channel: 'whatsapp',
  provider: 'meta',
  whatsappPhoneNumberId: '1204681739405005',
  whatsappBusinessAccountId: '4566308287021401',
  whatsappAppId: '1476951221097127',
  whatsappAppSecret: 'dummy-app-secret',
  whatsappAccessToken: 'dummy-access-token',
  isActive: true,
  isDefault: false,
  aiEnabled: true,
  agentId: AGENT_ID,
  departmentIds: DEPARTMENT_IDS,
};

describe('AdminAiController.createLine', () => {
  let controller: AdminAiController;
  let next: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    mockEncrypt.mockImplementation((plain: string) => `encrypted:${plain}`);
    mockRepo.findAgentById.mockResolvedValue({ id: AGENT_ID, name: 'Agent' });
    mockRepo.findLineByChannelAndExternalIdentifier.mockResolvedValue(null);
    mockRepo.createLine.mockImplementation(async (data: Record<string, unknown>) => ({
      id: 'line-1',
      ...data,
    }));
    controller = new AdminAiController({} as never);
    next = jest.fn();
  });

  it('persists WhatsApp columns, encrypted secrets, and departmentIds', async () => {
    const req = { body: CREATE_BODY } as never;
    const res = makeRes();

    await controller.createLine(req, res as never, next as never);

    expect(next).not.toHaveBeenCalled();
    expect(mockRepo.findLineByChannelAndExternalIdentifier).toHaveBeenCalledWith(
      'whatsapp',
      '1204681739405005',
    );
    expect(mockRepo.createLine).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'whatsapp',
        provider: 'meta',
        displayName: 'Voz Ciudadana Test',
        phoneNumber: '+529601000000',
        externalIdentifier: '1204681739405005',
        whatsappPhoneNumberId: '1204681739405005',
        whatsappBusinessAccountId: '4566308287021401',
        whatsappAppId: '1476951221097127',
        whatsappAccessToken: 'encrypted:dummy-access-token',
        whatsappAppSecret: 'encrypted:dummy-app-secret',
        isActive: true,
        isDefault: false,
        aiEnabled: true,
        agentId: AGENT_ID,
        metadata: { departmentIds: DEPARTMENT_IDS },
      }),
    );
    expect(mockEncrypt).toHaveBeenCalledWith('dummy-access-token');
    expect(mockEncrypt).toHaveBeenCalledWith('dummy-app-secret');
    expect(res.statusCode).toBe(201);
    expect(res.body).toEqual({
      line: expect.objectContaining({
        externalIdentifier: '1204681739405005',
        whatsappPhoneNumberId: '1204681739405005',
      }),
    });
  });

  it('rejects aiEnabled without agentId', async () => {
    const req = { body: { ...CREATE_BODY, agentId: undefined } } as never;
    const res = makeRes();

    await controller.createLine(req, res as never, next as never);

    expect(mockRepo.createLine).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(ZodError));
  });

  it('rejects duplicate channel + whatsappPhoneNumberId', async () => {
    mockRepo.findLineByChannelAndExternalIdentifier.mockResolvedValue({ id: 'existing' });
    const req = { body: CREATE_BODY } as never;
    const res = makeRes();

    await controller.createLine(req, res as never, next as never);

    expect(mockRepo.createLine).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    const err = next.mock.calls[0][0] as AppError;
    expect(err.statusCode).toBe(409);
  });
});
