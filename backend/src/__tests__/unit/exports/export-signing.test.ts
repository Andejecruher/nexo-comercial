import type { Request, Response } from 'express';
import { ExportController } from '../../../controllers/export.controller';
import { GCSFileStorageProvider } from '../../../services/ine/gcs-file-storage.provider';

function job(id: string, extra = {}) {
  return {
    id,
    module: 'citizens',
    status: 'ready',
    filePath: `exports/citizens/${id}.xlsx`,
    scopeSnapshot: { kind: 'admin' },
    expiresAt: new Date(Date.now() + 86400000),
    ...extra,
  };
}
function setup(jobs: unknown[]) {
  const prisma = {
    exportJob: {
      findMany: jest.fn().mockResolvedValue(jobs),
      findUnique: jest.fn().mockResolvedValue(jobs[0]),
    },
  };
  const storage = { getSignedUrl: jest.fn() };
  const controller = new ExportController(
    prisma as never,
    {} as never,
    undefined,
    storage as never,
  );
  const req = { user: { id: 'user' }, scope: { kind: 'admin' }, query: {}, params: { id: 'a' } };
  const res = { setHeader: jest.fn(), json: jest.fn(), status: jest.fn().mockReturnThis() };
  const next = jest.fn();
  return {
    prisma,
    storage,
    controller,
    req: req as unknown as Request,
    res: res as unknown as Response,
    json: res.json,
    next,
  };
}
afterEach(() => jest.restoreAllMocks());

it('starts all export signatures together, isolates a bad object and hides every object name', async () => {
  const { controller, req, res, json, next, storage, prisma } = setup([
    job('a'),
    job('bad'),
    job('c'),
  ]);
  const complete: (() => void)[] = [];
  storage.getSignedUrl.mockImplementation(
    (path: string) =>
      new Promise((resolve, reject) => {
        complete.push(() =>
          path.includes('bad')
            ? reject(new Error('private credential details'))
            : resolve(`https://storage.googleapis.com/signed-${complete.length}`),
        );
      }),
  );
  const pending = controller.list(req, res, next);
  // The database and scope checks precede signing.
  for (let n = 0; n < 10; n++) await Promise.resolve();
  expect(storage.getSignedUrl).toHaveBeenCalledTimes(3);
  expect(storage.getSignedUrl).toHaveBeenCalledWith('exports/citizens/a.xlsx', 7200000);
  complete.reverse().forEach((finish) => finish());
  await pending;
  expect(next).not.toHaveBeenCalled();
  expect(prisma.exportJob.findMany).toHaveBeenCalledWith(
    expect.objectContaining({
      where: { requestedByUserId: 'user' },
      take: 50,
    }),
  );
  const payload = json.mock.calls[0][0];
  expect(payload.items[1].cdn_url).toBeNull();
  expect(payload.items[0].cdn_url).toMatch(/^https:/);
  expect(payload.items[2].cdn_url).toMatch(/^https:/);
  expect(JSON.stringify(payload)).not.toMatch(/filePath|driveFileId|exports\/citizens|credential/);
});

it('does not sign expired, unfinished or unauthorized exports', async () => {
  const { controller, req, res, json, storage } = setup([
    job('expired', { expiresAt: new Date(0) }),
    job('pending', { status: 'processing' }),
    job('foreign'),
  ]);
  req.scope = { kind: 'none' };
  await controller.list(req, res, jest.fn());
  expect(storage.getSignedUrl).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledWith({ items: [] });
});

it('signs status responses without persisting the generated URL', async () => {
  const { controller, req, res, json, next, storage } = setup([job('a')]);
  storage.getSignedUrl.mockResolvedValue('https://storage.googleapis.com/temporary');
  await controller.status(req, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(json).toHaveBeenCalledWith(
    expect.objectContaining({ cdn_url: 'https://storage.googleapis.com/temporary' }),
  );
});

it('requests v4 read access for exactly two hours', async () => {
  const file = jest.fn();
  const storage = { bucket: jest.fn(() => ({ file })) };
  const signer = {
    getSignedUrl: jest.fn().mockResolvedValue('https://storage.googleapis.com/signed'),
  };
  const provider = new GCSFileStorageProvider(storage as never, 'voz_ciudadana', signer);
  const now = Date.now();
  jest.spyOn(Date, 'now').mockReturnValue(now);
  await expect(provider.getSignedUrl('exports/citizens/a.xlsx')).resolves.toMatch(/^https:/);
  expect(signer.getSignedUrl).toHaveBeenCalledWith({
    bucket: 'voz_ciudadana',
    objectName: 'exports/citizens/a.xlsx',
    method: 'GET',
    expires: new Date(now + 7200000),
  });
  await expect(provider.getSignedUrl('https://storage.googleapis.com/temporary')).rejects.toThrow();
});
