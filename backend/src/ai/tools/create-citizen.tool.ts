/**
 * CreateCitizenTool — internal AI tool.
 *
 * Responsabilidad:
 *  - Normalizar teléfono (sin "+", solo dígitos).
 *  - Deduplicar por teléfono (findOrCreate).
 *  - Aplicar consent si se indica.
 *  - Opcionalmente abrir conversación inicial.
 *
 * Contrato: execute(input: unknown): Promise<unknown>
 * No lanza AppError — devuelve error estructurado { error } para que el orchestrador lo maneje.
 */
import { z } from 'zod';
import { CitizenRepository } from '../../repositories/citizen.repository';
import { ConversationRepository } from '../../repositories/conversation.repository';
import { createStructuredLogger } from '../../utils/structured-logger';

const log = createStructuredLogger('CreateCitizenTool');

export const createCitizenSchema = z.object({
  phone: z.string().trim().min(7).max(20),
  profileName: z.string().trim().min(1).max(255).optional(),
  consentGiven: z.boolean().optional(),
  /** Si true, abre (o recupera) la conversación activa del ciudadano. */
  openConversation: z.boolean().optional(),
});

export type CreateCitizenInput = z.infer<typeof createCitizenSchema>;

export type CreateCitizenOutput = {
  citizenId: string;
  phone: string;
  name: string | undefined;
  lastName: string | undefined;
  created: boolean;
  alreadyExists: boolean;
  conversationId: string | undefined;
  guidance?: string;
};

export class CreateCitizenTool {
  readonly key = 'createCitizen';

  constructor(
    private readonly citizenRepo: CitizenRepository,
    private readonly conversationRepo: ConversationRepository,
  ) {}

  async execute(input: unknown): Promise<unknown> {
    log('debug', 'create_citizen.start');

    const parsed = createCitizenSchema.safeParse(input);
    if (!parsed.success) {
      log('warn', 'create_citizen.invalid_input', undefined, {
        issueCount: parsed.error.issues.length,
      });
      return { error: 'INVALID_INPUT', details: parsed.error.issues };
    }

    const data = parsed.data;

    try {
      // findByPhone para detectar si ya existía
      const existing = await this.citizenRepo.findByPhone(data.phone);
      const isNew = existing === null;

      const citizen =
        existing ?? (await this.citizenRepo.findOrCreate(data.phone, data.profileName));

      // Aplicar consent si se pasó explícitamente y aún no tiene
      if (data.consentGiven === true && !citizen.consentGiven) {
        await this.citizenRepo.giveConsent(citizen.id);
        log('debug', 'create_citizen.consent_granted', undefined, { citizenId: citizen.id });
      }

      let conversationId: string | undefined;
      if (data.openConversation === true) {
        const conv = await this.conversationRepo.findOrCreateCanonical(citizen.id);
        conversationId = conv.id;
        log('debug', 'create_citizen.conversation_ensured', undefined, { conversationId });
      }

      const result: CreateCitizenOutput = {
        citizenId: citizen.id,
        phone: citizen.phone ?? data.phone,
        name: citizen.name ?? undefined,
        lastName: citizen.lastName ?? undefined,
        created: isNew,
        alreadyExists: !isNew,
        conversationId,
        guidance: isNew
          ? 'Citizen created successfully. Continue with profile completion fields.'
          : 'Citizen already exists for this phone. Do not call createCitizen again in this turn; continue with updateCitizenProfile or confirmCitizenRegistration.',
      };

      log('debug', 'create_citizen.success', undefined, {
        citizenId: result.citizenId,
        conversationId: result.conversationId,
        created: result.created,
      });
      return result;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      log('error', 'create_citizen.error', undefined, {
        errorType: err instanceof Error ? err.name : 'UnknownError',
      });
      return { error: 'EXECUTION_ERROR', message };
    }
  }
}
