import { WhatsAppProvider } from '../../services/whatsapp/whatsapp.provider';

afterEach(() => jest.restoreAllMocks());
function provider() {
  return new WhatsAppProvider(
    {} as never,
    {
      resolve: jest
        .fn()
        .mockResolvedValue({ accessToken: 'fixture-token', appSecret: 'fixture-secret' }),
    } as never,
  );
}
it('returns a readable Meta body without materializing it into an ArrayBuffer', async () => {
  const body = new Response('streamed bytes', { headers: { 'content-length': '14' } });
  const arrayBuffer = jest.spyOn(body, 'arrayBuffer');
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json({ url: 'https://lookaside.fbsbx.com/media' }))
    .mockResolvedValueOnce(body);
  const stream = await provider().downloadMediaStream('media-id', {
    lineId: 'line',
    allowDefault: false,
  });
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  expect(Buffer.concat(chunks).toString()).toBe('streamed bytes');
  expect(arrayBuffer).not.toHaveBeenCalled();
  expect(fetchMock).toHaveBeenLastCalledWith(
    'https://lookaside.fbsbx.com/media',
    expect.objectContaining({ redirect: 'error', signal: expect.any(AbortSignal) }),
  );
});
it('rejects non-Meta destinations before sending download credentials', async () => {
  const fetchMock = jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json({ url: 'https://example.com/file' }));
  await expect(provider().downloadMediaStream('media-id')).rejects.toThrow(
    'MEDIA_DESTINATION_REJECTED',
  );
  expect(fetchMock).toHaveBeenCalledTimes(1);
});
it('rejects an oversized body before handing it to GCS', async () => {
  const body = new Response('large', { headers: { 'content-length': String(26 * 1024 * 1024) } });
  jest
    .spyOn(global, 'fetch')
    .mockResolvedValueOnce(Response.json({ url: 'https://lookaside.fbsbx.com/media' }))
    .mockResolvedValueOnce(body);
  await expect(provider().downloadMediaStream('media-id')).rejects.toThrow('MEDIA_SIZE_EXCEEDED');
  expect(body.bodyUsed).toBe(true);
});
