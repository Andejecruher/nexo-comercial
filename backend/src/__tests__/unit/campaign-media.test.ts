import {
  buildCampaignPayload,
  createCampaignSchema,
} from '../../services/campaigns/campaign-contract';
import {
  CampaignMediaService,
  validateCampaignMedia,
} from '../../services/campaigns/campaign-media.service';
import { CampaignService } from '../../services/campaigns/campaign.service';
import { TemplateManagementService } from '../../services/templates/template-management.service';

const id = '00000000-0000-4000-8000-000000000001';
const template = {
  id: '123',
  name: 'aviso',
  language: 'es_MX',
  category: 'UTILITY',
  status: 'APPROVED',
  components: [
    { type: 'HEADER', format: 'DOCUMENT' },
    { type: 'BODY', text: 'Hola {{1}}' },
  ],
};
const file = {
  filename: 'aviso.pdf',
  mimeType: 'application/pdf',
  buffer: Buffer.from('%PDF-1.7\nexample'),
};
const url = 'https://storage.googleapis.com/nexo_comercial_public/campanas/Aviso/file.pdf';
const viewUrl = url;
afterEach(() => jest.restoreAllMocks());

describe('Campaign media', () => {
  it.each(['IMAGE', 'VIDEO', 'DOCUMENT'])(
    'builds the %s header without losing text parameters',
    (kind) => {
      const mediaTemplate = {
        ...template,
        components: [{ type: 'HEADER', format: kind }, template.components[1]],
      };
      const parameters = buildCampaignPayload(
        mediaTemplate,
        { 'header.media': url, 'body.1': 'Ana' },
        '525512345678',
        id,
      ).template.components;
      expect(parameters).toEqual([
        {
          type: 'header',
          parameters: [{ type: kind.toLowerCase(), [kind.toLowerCase()]: { link: url } }],
        },
        { type: 'body', parameters: [{ type: 'text', text: 'Ana' }] },
      ]);
      expect(() => buildCampaignPayload(mediaTemplate, {}, '525512345678', id)).toThrow('adjunto');
    },
  );
  it('rejects spoofed types, wrong header types and oversized files before GCS', () => {
    expect(() => validateCampaignMedia(file, 'DOCUMENT')).not.toThrow();
    expect(() => validateCampaignMedia(file, 'IMAGE')).toThrow();
    expect(() =>
      validateCampaignMedia({ ...file, buffer: Buffer.from('fake') }, 'DOCUMENT'),
    ).toThrow();
    const large = Buffer.alloc(17 * 1024 * 1024);
    large.write('%PDF-');
    expect(() => validateCampaignMedia({ ...file, buffer: large }, 'DOCUMENT')).toThrow('16 MB');
  });
  function fixture() {
    jest.spyOn(TemplateManagementService.prototype, 'assertOwnership').mockResolvedValue(template);
    const create = jest.fn().mockImplementation(async ({ data }) => data);
    const storage = {
      uploadStream: jest.fn().mockResolvedValue({
        objectId: 'campanas/Aviso/00000000-0000-4000-8000-000000000001-aviso.pdf',
      }),
      delete: jest.fn().mockResolvedValue(undefined),
    };
    const service = new CampaignMediaService(
      { campaignAttachment: { create } } as never,
      storage as never,
      'nexo_comercial_public',
    );
    return { service, create, storage };
  }
  it('stores under the campaign name and persists the static URL from the public bucket', async () => {
    const { service, storage, create } = fixture();
    const result = await service.upload({ name: 'Aviso', lineId: id, templateId: '123' }, id, file);
    expect(storage.uploadStream).toHaveBeenCalledWith(
      expect.objectContaining({
        path: `campanas/Aviso/${result.id}-aviso.pdf`,
      }),
    );
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          createdBy: id,
          lineId: id,
          url: `https://storage.googleapis.com/nexo_comercial_public/campanas/Aviso/${result.id}-aviso.pdf`,
          viewUrl: `https://storage.googleapis.com/nexo_comercial_public/campanas/Aviso/${result.id}-aviso.pdf`,
          mediaType: 'DOCUMENT',
        }),
      }),
    );
  });
  it('cleans up the uploaded file when persistence fails', async () => {
    const { service, storage, create } = fixture();
    create.mockRejectedValue(new Error('failure'));
    await expect(
      service.upload({ name: 'Aviso', lineId: id, templateId: '123' }, id, file),
    ).rejects.toMatchObject({ code: 'CAMPAIGN_GCS_UPLOAD_FAILED' });
    expect(storage.delete).toHaveBeenCalledWith(
      'campanas/Aviso/00000000-0000-4000-8000-000000000001-aviso.pdf',
    );
  });
});

describe('Campaign attachment binding', () => {
  const input = createCampaignSchema.parse({
    name: 'Aviso',
    purpose: 'Info',
    lineId: id,
    templateId: '123',
    consentConfirmed: true,
    attachmentId: id,
    mappings: { 'body.1': { mode: 'static', value: 'Ana' } },
    audience: { source: 'csv', phoneColumn: 'phone', rows: [{ phone: '525512345678' }] },
  });
  function fixture(attachment: unknown) {
    jest
      .spyOn(TemplateManagementService.prototype, 'config')
      .mockResolvedValue({ phoneNumberId: '12345' } as never);
    jest.spyOn(TemplateManagementService.prototype, 'assertOwnership').mockResolvedValue(template);
    const createMany = jest.fn().mockResolvedValue({ count: 1 });
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const findFirst = jest.fn().mockResolvedValue(attachment);
    const prisma = {
      campaign: { findUnique: jest.fn().mockResolvedValue(null) },
      campaignAttachment: { findFirst },
      $transaction: jest.fn(async (fn) =>
        fn({
          campaign: { create: jest.fn().mockResolvedValue({}) },
          campaignRecipient: { createMany },
          campaignAttachment: { updateMany },
        }),
      ),
    };
    return {
      service: new CampaignService(prisma as never),
      prisma,
      createMany,
      updateMany,
      findFirst,
    };
  }
  it('rejects missing, foreign, already claimed or incompatible media', async () => {
    for (const attachment of [null, { id, mediaType: 'IMAGE', url }]) {
      const { service, prisma, findFirst } = fixture(attachment);
      await expect(service.create(input, id, id)).rejects.toMatchObject({ statusCode: 400 });
      expect(findFirst).toHaveBeenCalledWith({
        where: { id, createdBy: id, lineId: id, templateId: '123', campaignId: null },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    }
  });
  it('snapshots the server-owned URL into recipients and claims the attachment atomically', async () => {
    const { service, createMany, updateMany } = fixture({ id, mediaType: 'DOCUMENT', url });
    const result = await service.create(input, id, id);
    expect(result.id).toBe(id);
    expect(createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          campaignId: id,
          variables: { 'body.1': 'Ana', 'header.media': url },
        }),
      ],
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id, createdBy: id, campaignId: null },
      data: { campaignId: id },
    });
  });
  it('rolls back if another request already claimed the attachment', async () => {
    const { service, updateMany, createMany } = fixture({ id, mediaType: 'DOCUMENT', url });
    updateMany.mockResolvedValue({ count: 0 });
    await expect(service.create(input, id, id)).rejects.toMatchObject({ statusCode: 409 });
    expect(createMany).not.toHaveBeenCalled();
  });
});
