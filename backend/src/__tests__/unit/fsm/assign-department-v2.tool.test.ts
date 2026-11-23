/**
 * Tests unitarios: AssignDepartmentV2Tool
 * Cubre:
 *  - output: flowState = DEPARTMENT_ROUTING (nunca HUMAN_FLOW), aiActive: false
 *    (opción A: el handoff a departamento silencia a la IA)
 *  - El tool NO escribe estado directamente (la transición la aplica FsmRouterV2)
 *  - Input inválido retorna error estructurado
 */
import { describe, expect, it } from '@jest/globals';
import { AssignDepartmentV2Tool } from '../../../ai/tools/assign-department-v2.tool';

describe('AssignDepartmentV2Tool — execute', () => {
  it('key debe ser "assignDepartment"', () => {
    const tool = new AssignDepartmentV2Tool();
    expect(tool.key).toBe('assignDepartment');
  });

  it('debe retornar flowState = DEPARTMENT_ROUTING (nunca HUMAN_FLOW)', async () => {
    const tool = new AssignDepartmentV2Tool();

    const result = await tool.execute({
      conversationId: 'conv-abc',
      departmentSlug: 'obras-publicas',
    });

    expect(result).toMatchObject({
      assigned: true,
      departmentSlug: 'obras-publicas',
      flowState: 'DEPARTMENT_ROUTING',
      aiActive: false,
    });
  });

  it('nunca debe reportar HUMAN_FLOW en el output', async () => {
    const tool = new AssignDepartmentV2Tool();

    const result = (await tool.execute({
      conversationId: 'conv-abc',
      departmentSlug: 'transito',
    })) as Record<string, unknown>;

    expect(result.flowState).not.toBe('HUMAN_FLOW');
  });

  it('debe retornar error estructurado en input inválido', async () => {
    const tool = new AssignDepartmentV2Tool();

    const result = await tool.execute({ conversationId: '', departmentSlug: 'x' });

    expect(result).toMatchObject({ error: 'INVALID_INPUT' });
  });
});
