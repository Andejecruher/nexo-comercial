import { DeliveryStatusService } from '../../services/whatsapp/delivery-status.service';
const receipt = {
  wamid: 'wamid.fixture',
  recipientPhone: '',
  status: 'delivered' as const,
  timestamp: '1700000000',
};
it('retains an unmatched receipt and recovers after provider id binding', async () => {
  const log: any = {
    id: 'log',
    rawPayload: { kind: 'delivery-receipts-v1', statuses: [receipt], attempts: 0 },
  };
  const prisma: any = {
    webhookEventLog: {
      findMany: jest.fn().mockResolvedValue([log]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    $transaction: jest.fn(async (fn: any) => fn({})),
  };
  const repository: any = {
    upsertStatusInTransaction: jest
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValue({
        created: true,
        messageId: 'message',
        conversationId: 'conversation',
        wamid: receipt.wamid,
        status: 'delivered',
        timestamp: new Date(1700000000000),
      }),
  };
  const notifier: any = {
    isEnabled: () => true,
    notifyCritical: jest.fn().mockResolvedValue(undefined),
  };
  const service = new DeliveryStatusService(prisma, repository, notifier);
  await service.reconcile();
  expect(prisma.webhookEventLog.updateMany).toHaveBeenLastCalledWith(
    expect.objectContaining({ data: { rawPayload: expect.objectContaining({ attempts: 1 }) } }),
  );
  await service.reconcile();
  expect(prisma.webhookEventLog.updateMany).toHaveBeenLastCalledWith(
    expect.objectContaining({ data: { processedOk: true } }),
  );
  expect(notifier.notifyCritical).toHaveBeenCalledWith(
    expect.any(Object),
    expect.objectContaining({
      messageStatusPatch: expect.objectContaining({ messageId: 'message', status: 'delivered' }),
    }),
  );
});
it('does not emit another notification for a duplicate receipt', async () => {
  const prisma: any = { $transaction: async (fn: any) => fn({}) };
  const repository: any = {
    upsertStatusInTransaction: jest.fn().mockResolvedValue({ created: false }),
  };
  const notifier: any = { isEnabled: () => true, notifyCritical: jest.fn() };
  await expect(
    new DeliveryStatusService(prisma, repository, notifier).apply([receipt]),
  ).resolves.toBe(true);
  expect(notifier.notifyCritical).not.toHaveBeenCalled();
});
