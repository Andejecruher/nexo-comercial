import { MessageService } from '../../services/message.service';

describe('MessageService.sendContactMessage', () => {
  it('builds a Meta contacts payload from the selected citizen and preserves the citizen snapshot', async () => {
    const citizen = {
      id: '550e8400-e29b-41d4-a716-446655440010',
      name: 'María',
      lastName: 'González',
      phone: '+52 1 55-1234-5678',
      email: 'maria@example.com',
      neighborhood: 'La Candelaria',
    };
    const message = {
      id: 'message-1',
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      body: 'María González',
      messageType: 'contacts',
      direction: 'outbound',
      createdAt: new Date(),
    };
    const messageRepo = {
      findByIdempotencyKey: jest.fn().mockResolvedValue(null),
      findConversationWithCitizenPhone: jest.fn().mockResolvedValue({
        id: '550e8400-e29b-41d4-a716-446655440001',
        citizen: { phone: '5215511111111' },
        meta: { communicationLineId: '550e8400-e29b-41d4-a716-446655440099' },
      }),
      customerWindow: jest.fn().mockResolvedValue({ isOpen: true }),
      createInTransaction: jest.fn().mockResolvedValue(message),
    };
    const outboxProcessor = { enqueue: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      citizen: { findUnique: jest.fn().mockResolvedValue(citizen) },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) =>
        fn({ outboxEvent: { create: jest.fn().mockResolvedValue({}) } }),
      ),
    };
    const service = new MessageService(
      messageRepo as never,
      outboxProcessor as never,
      undefined,
      prisma as never,
    );

    await service.sendContactMessage({
      conversationId: '550e8400-e29b-41d4-a716-446655440001',
      senderId: '550e8400-e29b-41d4-a716-446655440002',
      idempotencyKey: 'contact-card-1',
      citizenId: citizen.id,
    });

    expect(prisma.citizen.findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: citizen.id } }),
    );
    expect(messageRepo.createInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        messageType: 'contacts',
        body: 'María González',
        meta: expect.objectContaining({ contactCitizenId: citizen.id }),
      }),
    );
    expect(outboxProcessor.enqueue).toHaveBeenCalledWith(
      '5215511111111',
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to: '5215511111111',
        type: 'contacts',
        contacts: [
          {
            name: {
              formatted_name: 'María González',
              first_name: 'María',
              last_name: 'González',
            },
            phones: [{ phone: '5215512345678', type: 'CELL', wa_id: '5215512345678' }],
            emails: [{ email: 'maria@example.com', type: 'WORK' }],
            addresses: [{ street: 'La Candelaria', type: 'HOME' }],
          },
        ],
      },
      'contact-card-1',
      '550e8400-e29b-41d4-a716-446655440001',
      { lineId: '550e8400-e29b-41d4-a716-446655440099' },
    );
  });
});
