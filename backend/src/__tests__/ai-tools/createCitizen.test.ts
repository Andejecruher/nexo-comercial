/**
 * Unit tests: CreateCitizenTool
 *
 * Casos:
 *  - Ciudadano nuevo (retorna created: true)
 *  - Ciudadano existente (retorna created: false, sin duplicado)
 *  - Input inválido → error estructurado INVALID_INPUT
 *  - Consent: se llama giveConsent solo cuando consentGiven=true y citizen.consentGiven=false
 *  - openConversation: se llama findOrCreateCanonical cuando flag=true
 */
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { CreateCitizenTool } from '../../ai/tools/create-citizen.tool';
import { withEnv } from '../helpers/with-env';

function makeCitizenRepoMock() {
  return {
    findByPhone: jest.fn<() => Promise<object | null>>(),
    findOrCreate: jest.fn<() => Promise<object>>(),
    giveConsent: jest.fn<() => Promise<object>>(),
    updateLeadStatus: jest.fn<() => Promise<object>>(),
  };
}

function makeConversationRepoMock() {
  return {
    findOrCreateCanonical: jest.fn<() => Promise<{ id: string; status: string }>>(),
  };
}

const BASE_CITIZEN = {
  id: 'cit-001',
  phone: '521234567890',
  name: 'Juan',
  lastName: 'Perez',
  consentGiven: false,
};

const BASE_CONVERSATION = { id: 'conv-001', status: 'open' };

describe('CreateCitizenTool', () => {
  let citizenRepo: ReturnType<typeof makeCitizenRepoMock>;
  let conversationRepo: ReturnType<typeof makeConversationRepoMock>;
  let tool: CreateCitizenTool;

  beforeEach(() => {
    citizenRepo = makeCitizenRepoMock();
    conversationRepo = makeConversationRepoMock();
    // @ts-ignore — mock parcial
    tool = new CreateCitizenTool(citizenRepo, conversationRepo);
  });

  it('devuelve error INVALID_INPUT cuando el phone es muy corto', async () => {
    const result = await tool.execute({ phone: '123' });
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('devuelve error INVALID_INPUT cuando input es null', async () => {
    const result = await tool.execute(null);
    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });

  it('crea ciudadano nuevo cuando no existe', async () => {
    citizenRepo.findByPhone.mockResolvedValue(null);
    // @ts-ignore
    citizenRepo.findOrCreate.mockResolvedValue(BASE_CITIZEN);

    const result = await tool.execute({ phone: '521234567890' });

    expect(citizenRepo.findByPhone).toHaveBeenCalledWith('521234567890');
    expect(citizenRepo.findOrCreate).toHaveBeenCalledWith('521234567890', undefined);
    expect(result).toMatchObject({
      citizenId: 'cit-001',
      phone: '521234567890',
      created: true,
      conversationId: undefined,
    });
  });

  it('does not expose citizen PII in debug logs', async () => {
    const restore = withEnv({ LOG_LEVEL: 'debug' });
    const debugSpy = jest.spyOn(console, 'debug').mockImplementation(() => undefined);
    citizenRepo.findByPhone.mockResolvedValue(null);
    // @ts-ignore
    citizenRepo.findOrCreate.mockResolvedValue(BASE_CITIZEN);

    try {
      await tool.execute({ phone: '521234567890', profileName: 'Juan Perez' });

      const serializedLogs = debugSpy.mock.calls.map(([entry]) => String(entry)).join('\n');
      expect(serializedLogs).toContain('create_citizen.success');
      expect(serializedLogs).not.toContain('521234567890');
      expect(serializedLogs).not.toContain('Juan Perez');
    } finally {
      debugSpy.mockRestore();
      restore();
    }
  });

  it('retorna ciudadano existente sin crear duplicado', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);

    const result = await tool.execute({ phone: '521234567890', profileName: 'Juan Perez' });

    expect(citizenRepo.findOrCreate).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      citizenId: 'cit-001',
      created: false,
    });
  });

  it('llama giveConsent cuando consentGiven=true y citizen.consentGiven=false', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue({ ...BASE_CITIZEN, consentGiven: false });
    // @ts-ignore
    citizenRepo.giveConsent.mockResolvedValue({ ...BASE_CITIZEN, consentGiven: true });

    await tool.execute({ phone: '521234567890', consentGiven: true });

    expect(citizenRepo.giveConsent).toHaveBeenCalledWith('cit-001');
  });

  it('NO llama giveConsent cuando citizen.consentGiven ya es true', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue({ ...BASE_CITIZEN, consentGiven: true });

    await tool.execute({ phone: '521234567890', consentGiven: true });

    expect(citizenRepo.giveConsent).not.toHaveBeenCalled();
  });

  it('abre conversación cuando openConversation=true', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);
    conversationRepo.findOrCreateCanonical.mockResolvedValue(BASE_CONVERSATION);

    const result = await tool.execute({ phone: '521234567890', openConversation: true });

    expect(conversationRepo.findOrCreateCanonical).toHaveBeenCalledWith('cit-001');
    expect(result).toMatchObject({ conversationId: 'conv-001' });
  });

  it('NO abre conversación cuando openConversation no se pasa', async () => {
    // @ts-ignore
    citizenRepo.findByPhone.mockResolvedValue(BASE_CITIZEN);

    const result = await tool.execute({ phone: '521234567890' });

    expect(conversationRepo.findOrCreateCanonical).not.toHaveBeenCalled();
    expect(result).toMatchObject({ conversationId: undefined });
  });

  it('devuelve EXECUTION_ERROR si el repo falla', async () => {
    citizenRepo.findByPhone.mockRejectedValue(new Error('DB connection error'));

    const result = await tool.execute({ phone: '521234567890' });

    expect(result).toMatchObject({ error: 'EXECUTION_ERROR', message: 'DB connection error' });
  });
});
