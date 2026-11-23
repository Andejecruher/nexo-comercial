import type { Request, Response } from 'express';
import { UsersController } from '../../controllers/users.controller';
import { authMiddleware } from '../../middlewares/auth.middleware';
import { Prisma } from '@prisma/client';
import { UserService } from '../../services/user.service';
import type { UserRepository } from '../../repositories/user.repository';
import type { AuditService } from '../../services/audit.service';

jest.mock('../../config/env.config', () => ({ env: {} }));
jest.mock('../../utils/token.util', () => ({
  verifyAccessToken: jest.fn(() => ({
    sub: 'owner',
    type: 'access',
    email: 'owner@example.com',
    roles: [],
  })),
  generateAccessToken: jest.fn(() => 'valid-token'),
}));
jest.mock('@prisma/client', () => {
  const mock = jest.requireActual('../__mocks__/@prisma/client');
  return {
    ...mock,
    Prisma: {
      ...mock.Prisma,
      PrismaClientKnownRequestError: class extends Error {
        code = 'P2002';
      },
    },
  };
});

const row = {
  id: 'owner',
  fullName: 'Persona Ejemplo',
  email: 'owner@example.com',
  phone: null,
  isActive: true,
  createdAt: new Date('2026-01-01'),
  userRoles: [{ role: { id: 'role', name: 'Operador', slug: 'operador' } }],
};

function setup() {
  const users = {
    findProfile: jest.fn().mockResolvedValue(row),
    findOtherProfileByEmail: jest.fn().mockResolvedValue(null),
    updateProfile: jest.fn().mockImplementation(async (_id, data) => ({ ...row, ...data })),
  };
  const service = new UserService(users as unknown as UserRepository);
  const controller = new UsersController(service, {} as AuditService);
  async function call(method: 'getMyProfile' | 'updateMyProfile', body?: unknown) {
    const req = { user: { id: 'owner' }, body } as Request;
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    await controller[method](req, res as unknown as Response, next);
    const error = next.mock.calls[0]?.[0];
    return {
      status: error?.statusCode ?? res.status.mock.calls[0]?.[0] ?? 200,
      body: res.json.mock.calls[0]?.[0],
    };
  }
  return { users, call };
}

describe('Perfil propio', () => {
  it('requiere autenticación', () => {
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    authMiddleware({ headers: {} } as Request, res as unknown as Response, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('lee el perfil sin contraseñas ni campos internos', async () => {
    const { call, users } = setup();
    users.findProfile.mockResolvedValue({ ...row, hashedPassword: 'secret' } as typeof row);
    const response = await call('getMyProfile');
    expect(response.status).toBe(200);
    expect(response.body.user).toEqual({
      id: 'owner',
      nombre: row.fullName,
      correo: row.email,
      telefono: null,
      roles: [row.userRoles[0].role],
      fechaRegistro: row.createdAt,
    });
    expect(users.findProfile).toHaveBeenCalledWith('owner');
  });

  it('ignora campos protegidos y actualiza solo al usuario autenticado', async () => {
    const { call, users } = setup();
    const response = await call('updateMyProfile', {
      nombre: ' Nuevo Nombre ',
      correo: 'NEW@EXAMPLE.COM',
      telefono: '+52 (961) 123-4567',
      id: 'victim',
      rol: 'SUPER_ADMIN',
      isActive: false,
      password: 'hack',
      fullName: 'hack',
    });
    expect(response.status).toBe(200);
    expect(users.updateProfile).toHaveBeenCalledWith('owner', {
      fullName: 'Nuevo Nombre',
      email: 'new@example.com',
      phone: '+52 (961) 123-4567',
    });
    expect(response.body.user.nombre).toBe('Nuevo Nombre');
  });

  it.each([
    { correo: 'incorrecto' },
    { telefono: '123' },
    { telefono: '+52abc1234567' },
    { nombre: '' },
    { correo: null },
  ])('rechaza formatos inválidos: %j', async (payload) => {
    const { call, users } = setup();
    expect((await call('updateMyProfile', payload)).status).toBe(422);
    expect(users.updateProfile).not.toHaveBeenCalled();
  });

  it.each([{}, { rol: 'SUPER_ADMIN' }, []])(
    'rechaza solicitudes sin campos editables: %j',
    async (payload) => {
      const { call } = setup();
      expect((await call('updateMyProfile', payload)).status).toBe(400);
    },
  );

  it('rechaza un correo usado por otra cuenta', async () => {
    const { call, users } = setup();
    users.findOtherProfileByEmail.mockResolvedValue({ id: 'other' } as never);
    expect((await call('updateMyProfile', { correo: 'other@example.com' })).status).toBe(409);
    expect(users.findOtherProfileByEmail).toHaveBeenCalledWith('other@example.com', 'owner');
    expect(users.updateProfile).not.toHaveBeenCalled();
  });

  it('maneja conflictos concurrentes de correo', async () => {
    const { call, users } = setup();
    users.updateProfile.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError('duplicate', { code: 'P2002', clientVersion: '5' }),
    );
    expect((await call('updateMyProfile', { correo: 'new@example.com' })).status).toBe(409);
  });

  it('permite borrar el teléfono y conservar el correo propio', async () => {
    const { call, users } = setup();
    expect((await call('updateMyProfile', { telefono: '', correo: row.email })).status).toBe(200);
    expect(users.updateProfile).toHaveBeenCalledWith('owner', { phone: null, email: row.email });
  });
});
