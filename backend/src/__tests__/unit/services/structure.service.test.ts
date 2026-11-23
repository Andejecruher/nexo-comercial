import { describe, expect, it, jest } from '@jest/globals';
import {
  CreateStructureSchema,
  StructureService,
  UpdateStructureSchema,
  toStructureSlug,
} from '../../../services/structure.service';
import { AppError } from '../../../utils/app-error';

type AsyncMock<Args extends unknown[] = [], Result = unknown> = (...args: Args) => Promise<Result>;

function createRepo() {
  return {
    findById: jest.fn<AsyncMock<[string], unknown>>(),
    findBySlug: jest.fn<AsyncMock<[string], unknown>>(),
    list: jest.fn<AsyncMock<[{ includeInactive?: boolean }], unknown[]>>(),
    create: jest.fn<AsyncMock<[unknown], unknown>>(),
    update: jest.fn<AsyncMock<[string, unknown], unknown>>(),
    countActiveCoordinators: jest.fn<AsyncMock<[string], number>>(),
  };
}

describe('toStructureSlug', () => {
  it('normalizes accented names to kebab-case', () => {
    expect(toStructureSlug('Movilización Territorial')).toBe('movilizacion-territorial');
  });
});

describe('StructureService', () => {
  it('creates a structure with a derived unique slug', async () => {
    const repo = createRepo();
    repo.findBySlug.mockResolvedValue(null);
    repo.create.mockResolvedValue({
      id: 'struct-1',
      name: 'Territorial',
      slug: 'territorial',
      isActive: true,
    });
    const service = new StructureService(repo as never);

    const result = await service.create({
      name: 'Territorial',
      color: '#10B981',
      managerFirstName: '  Ana  ',
      managerLastName: '',
      managerPhone: null,
    });

    expect(result.slug).toBe('territorial');
    expect(repo.create).toHaveBeenCalledWith({
      name: 'Territorial',
      slug: 'territorial',
      color: '#10B981',
      isActive: true,
      managerFirstName: 'Ana',
      managerLastName: null,
      managerPhone: null,
    });
  });

  it('requires a 6-digit HEX color and uppercases it', () => {
    expect(() => CreateStructureSchema.parse({ name: 'Territorial' })).toThrow();
    expect(CreateStructureSchema.parse({ name: 'Territorial', color: '#10b981' })).toMatchObject({
      color: '#10B981',
    });
    expect(() => UpdateStructureSchema.parse({ color: 'red' })).toThrow();
  });

  it('blocks deactivation when active coordinators exist', async () => {
    const repo = createRepo();
    repo.findById.mockResolvedValue({ id: 'struct-1', isActive: true });
    repo.countActiveCoordinators.mockResolvedValue(2);
    const service = new StructureService(repo as never);

    await expect(service.deactivate('struct-1')).rejects.toMatchObject({
      statusCode: 409,
      code: 'CONFLICT',
    });
    expect(repo.update).not.toHaveBeenCalled();
  });

  it('soft-deletes a structure without active coordinators', async () => {
    const repo = createRepo();
    repo.findById.mockResolvedValue({ id: 'struct-1', isActive: true });
    repo.countActiveCoordinators.mockResolvedValue(0);
    repo.update.mockResolvedValue({ id: 'struct-1', isActive: false });
    const service = new StructureService(repo as never);

    const result = await service.deactivate('struct-1');

    expect(result).toMatchObject({ isActive: false });
    expect(repo.update).toHaveBeenCalledWith('struct-1', { isActive: false });
  });

  it('throws 404 when the structure is missing', async () => {
    const repo = createRepo();
    repo.findById.mockResolvedValue(null);
    const service = new StructureService(repo as never);

    await expect(service.getById('missing')).rejects.toBeInstanceOf(AppError);
  });

  it('updates color and clears empty encargado fields', async () => {
    const repo = createRepo();
    repo.findById.mockResolvedValue({ id: 'struct-1', isActive: true });
    repo.update.mockResolvedValue({ id: 'struct-1', color: '#EF4444' });
    const service = new StructureService(repo as never);

    await service.update('struct-1', {
      color: '#ef4444',
      managerFirstName: '',
      managerLastName: 'Torres',
    });

    expect(repo.update).toHaveBeenCalledWith('struct-1', {
      color: '#EF4444',
      managerFirstName: null,
      managerLastName: 'Torres',
    });
  });
});
