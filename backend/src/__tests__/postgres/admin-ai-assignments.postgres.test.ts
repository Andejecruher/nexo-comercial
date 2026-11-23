import { afterAll, beforeAll, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import express from 'express';
import request from 'supertest';
import { AgentRegistry } from '../../ai/registry/agent.registry';
import { TopicRegistry } from '../../ai/registry/topic.registry';
import { errorHandler } from '../../middlewares/errorHandler';
import { createAdminAiRouter } from '../../routes/admin-ai.routes';
import type { PrismaService } from '../../services/prisma.service';

jest.mock('../../middlewares/auth.middleware', () => ({
  authMiddleware: (req: { user?: object }, _res: unknown, next: () => void) => {
    req.user = { id: 'test-admin', roles: [] };
    next();
  },
}));
let mockPermissions = ['ai.view', 'ai.create'];
jest.mock('../../services/authorization.service', () => ({
  AuthorizationService: jest.fn().mockImplementation(() => ({
    getUserPermissionSlugs: jest.fn(async () => mockPermissions),
  })),
}));

describe('AI admin assignments → runtime — real PostgreSQL', () => {
  const prisma = new PrismaClient();
  const db = prisma as PrismaService;
  const registry = new TopicRegistry(db);
  const app = express();
  app.use(express.json());
  app.use('/admin/ai', createAdminAiRouter(db));
  app.use(errorHandler);
  const agentIds: string[] = [];
  const topicIds: string[] = [];
  const promptIds: string[] = [];
  let agentId: string;
  let otherAgentId: string;
  let lineId: string;
  const externalIdentifier = randomUUID();
  const resolve = (messageText = 'hola') => registry.resolve({ agentId, messageText });
  const assignment = (index = 0, isDefault = true, priority = 100) => ({
    topicId: topicIds[index],
    promptId: promptIds[index],
    isDefault,
    priority,
  });
  const save = (assignments: unknown[], target = agentId) =>
    request(app).put(`/admin/ai/agents/${target}/topics`).send({ assignments });

  beforeAll(async () => {
    for (const label of ['new', 'existing']) {
      const agent = await prisma.aiAgent.create({
        data: {
          slug: `assignments-${randomUUID()}`,
          name: label,
          provider: 'openai',
          model: 'test-model',
        },
      });
      agentIds.push(agent.id);
    }
    [agentId, otherAgentId] = agentIds;
    for (const label of ['general', 'eventos']) {
      const topic = await prisma.aiTopic.create({
        data: {
          slug: `assignments-${randomUUID()}`,
          name: label,
          matcherKeywords: label === 'eventos' ? ['evento'] : [],
        },
      });
      topicIds.push(topic.id);
      const prompt = await prisma.aiPrompt.create({
        data: {
          topicId: topic.id,
          name: `Prompt ${label}`,
          content: `Responde sobre ${label}`,
        },
      });
      promptIds.push(prompt.id);
    }
    await prisma.aiAgentTopic.create({ data: { agentId: otherAgentId, ...assignment() } });
    const line = await prisma.communicationLine.create({
      data: {
        externalIdentifier,
        displayName: 'Assignment test',
        aiEnabled: true,
        agentId,
      },
    });
    lineId = line.id;
  });
  beforeEach(async () => {
    mockPermissions = ['ai.view', 'ai.create'];
    await prisma.aiAgentTopic.deleteMany({ where: { agentId } });
    await prisma.aiTopic.updateMany({ where: { id: { in: topicIds } }, data: { isActive: true } });
    await prisma.aiPrompt.updateMany({
      where: { id: { in: promptIds } },
      data: { isActive: true },
    });
  });
  afterAll(async () => {
    await prisma.communicationLine.deleteMany({ where: { id: lineId } });
    await prisma.aiAgent.deleteMany({ where: { id: { in: agentIds } } });
    await prisma.aiPrompt.deleteMany({ where: { id: { in: promptIds } } });
    await prisma.aiTopic.deleteMany({ where: { id: { in: topicIds } } });
    await prisma.$disconnect();
  });

  it('reproduces metadata-only failure and connects line → agent → topic → prompt through the API', async () => {
    await prisma.aiAgent.update({
      where: { id: agentId },
      data: {
        metadata: { topicIds, promptIds, topP: 0.9 },
      },
    });
    const lineAgent = await new AgentRegistry(db).resolveLineAgent({
      channel: 'whatsapp',
      externalIdentifier,
    });
    expect(lineAgent?.agent.id).toBe(agentId);
    expect(await resolve()).toBeUndefined();
    const res = await save([assignment()]);
    expect(res.status).toBe(200);
    expect(res.body.topicAssignments).toHaveLength(1);
    expect(await resolve()).toEqual(
      expect.objectContaining({
        topicId: topicIds[0],
        promptId: promptIds[0],
        promptContent: 'Responde sobre general',
      }),
    );
    const detail = await request(app).get(`/admin/ai/agents/${agentId}/detail`);
    expect(detail.status).toBe(200);
    expect(detail.body.topicAssignments[0].prompt.id).toBe(promptIds[0]);
    expect(detail.body.lines[0].id).toBe(lineId);
    expect(detail.body.agent.metadata.topP).toBe(0.9);
    const list = await request(app).get('/admin/ai/agents');
    expect(list.status).toBe(200);
    expect(
      list.body.agents.find((item: { id: string }) => item.id === agentId).topics[0].promptId,
    ).toBe(promptIds[0]);
  });

  it('uses keywords, priority and default, updates prompts, removes links and preserves other agents', async () => {
    await prisma.aiTopic.update({
      where: { id: topicIds[0] },
      data: { matcherKeywords: ['evento'] },
    });
    expect((await save([assignment(), assignment(1, false, 10)])).status).toBe(200);
    expect((await resolve('evento mañana'))?.topicId).toBe(topicIds[1]);
    expect((await resolve())?.topicId).toBe(topicIds[0]);
    // REGISTERING keeps the default, even when a keyword matches another topic.
    expect(
      (await registry.resolve({ agentId, messageText: 'evento', flowState: 'REGISTERING' }))
        ?.topicId,
    ).toBe(topicIds[0]);
    expect((await save([assignment(1)])).status).toBe(200);
    expect((await resolve())?.promptId).toBe(promptIds[1]);
    expect((await save([])).status).toBe(200);
    expect(await resolve()).toBeUndefined();
    expect((await registry.resolve({ agentId: otherAgentId, messageText: 'hola' }))?.promptId).toBe(
      promptIds[0],
    );
  });

  it('changes the prompt on an existing topic and supports global conversation prompts', async () => {
    expect((await save([assignment()])).status).toBe(200);
    const global = await prisma.aiPrompt.create({
      data: { name: 'Global test', type: 'system', content: 'Nuevo prompt global' },
    });
    promptIds.push(global.id);
    expect((await save([{ ...assignment(), promptId: global.id }])).status).toBe(200);
    expect((await resolve())?.promptContent).toBe('Nuevo prompt global');
    await prisma.aiPrompt.update({ where: { id: global.id }, data: { type: 'tool' } });
    expect((await save([{ ...assignment(), promptId: global.id }])).status).toBe(400);
  });

  it('serializes simultaneous replacements so a single default remains', async () => {
    const results = await Promise.all([save([assignment()]), save([assignment(1)])]);
    expect(results.map((result) => result.status)).toEqual([200, 200]);
    const active = await prisma.aiAgentTopic.findMany({ where: { agentId, isActive: true } });
    expect(active).toHaveLength(1);
    expect(active[0].isDefault).toBe(true);
    expect((await resolve())?.promptId).toBe(active[0].promptId);
  });

  it('rejects invalid configurations without altering working assignments', async () => {
    expect((await save([assignment()])).status).toBe(200);
    const invalid = [
      [assignment(), assignment()],
      [assignment(), assignment(1)],
      [assignment(0, false)],
      [{ ...assignment(), promptId: promptIds[1] }],
      [{ ...assignment(), promptId: randomUUID() }],
      [{ ...assignment(), topicId: randomUUID() }],
      [{ ...assignment(), priority: -1 }],
      [{ ...assignment(), promptId: 'invalid' }],
    ];
    for (const payload of invalid) {
      expect((await save(payload)).status).toBe(400);
      expect((await resolve())?.promptId).toBe(promptIds[0]);
    }
    await prisma.aiPrompt.update({ where: { id: promptIds[1] }, data: { isActive: false } });
    expect((await save([assignment(1)])).status).toBe(400);
    await prisma.aiTopic.update({ where: { id: topicIds[1] }, data: { isActive: false } });
    expect((await save([assignment(1)])).status).toBe(400);
    expect((await resolve())?.promptId).toBe(promptIds[0]);
  });

  it('requires the existing admin permissions and reports missing agents', async () => {
    mockPermissions = ['ai.view'];
    expect((await save([assignment()])).status).toBe(403);
    expect(await resolve()).toBeUndefined();
    mockPermissions = ['ai.view', 'ai.create'];
    expect((await save([assignment()], randomUUID())).status).toBe(404);
  });
});
