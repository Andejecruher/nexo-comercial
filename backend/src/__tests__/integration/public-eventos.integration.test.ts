import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import request from 'supertest';

import { PublicEventosController } from '../../controllers/public-eventos.controller';
import type { PublicEventosService } from '../../services/public-eventos.service';
import { createTestApp } from '../setup/test-app';

type AsyncFn<TArgs extends unknown[], TResult> = (...args: TArgs) => Promise<TResult>;

const mockWeek = {
  weekStartsOn: '2026-05-04',
  weekEndsOn: '2026-05-10',
  timezone: 'America/Mexico_City',
  events: [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      title: 'Encuentro',
      description: 'Desc',
      startsAt: '2026-05-06T16:00:00.000Z',
      endsAt: null,
      locationName: 'Parque',
      address: null,
      capacity: 100,
    },
  ],
};

const mockAsistencia = {
  registration: {
    id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    eventId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    citizenId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    registrationStatus: 'registered',
    attendanceStatus: 'pending',
    createdAt: '2026-05-05T12:00:00.000Z',
  },
  citizen: {
    id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    phone: '5296112345678',
    created: true,
    profileComplete: false,
  },
};

const publicEventosService = {
  listWeek: jest.fn<AsyncFn<[{ referenceDateStr?: string }], typeof mockWeek>>(),
  registerAttendance: jest.fn<AsyncFn<[unknown], typeof mockAsistencia>>(),
};

describe('Public — eventos (integración enrutamiento)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    publicEventosService.listWeek.mockResolvedValue(mockWeek);
    publicEventosService.registerAttendance.mockResolvedValue(mockAsistencia);
  });

  const app = createTestApp((_app, router) => {
    const ctrl = new PublicEventosController(
      publicEventosService as unknown as PublicEventosService,
    );
    router.get('/public/eventos/semana', (req, res, next) => {
      void ctrl.listWeek(req, res, next);
    });
    router.post('/public/eventos/:eventId/asistencia', (req, res, next) => {
      void ctrl.registerAttendance(req, res, next);
    });
  });

  it('GET /public/eventos/semana devuelve semana y eventos', async () => {
    const res = await request(app)
      .get('/public/eventos/semana')
      .query({ referenceDate: '2026-05-05' });
    expect(res.status).toBe(200);
    expect(res.body.events).toHaveLength(1);
    expect(publicEventosService.listWeek).toHaveBeenCalledWith({ referenceDateStr: '2026-05-05' });
  });

  it('GET /public/eventos/semana 400 si referenceDate mal formado', async () => {
    const res = await request(app)
      .get('/public/eventos/semana')
      .query({ referenceDate: 'invalid' });
    expect(res.status).toBe(400);
    expect(publicEventosService.listWeek).not.toHaveBeenCalled();
  });

  it('POST /public/eventos/:eventId/asistencia 201 con cuerpo válido', async () => {
    const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const res = await request(app)
      .post(`/public/eventos/${eventId}/asistencia`)
      .send({ fullName: 'Ana López', phone: '9611234567', consentGiven: true });
    expect(res.status).toBe(201);
    expect(res.body.citizen.created).toBe(true);
    expect(publicEventosService.registerAttendance).toHaveBeenCalledWith(
      expect.objectContaining({
        eventId,
        fullName: 'Ana López',
        consentGiven: true,
      }),
    );
  });

  it('POST asistencia 400 si falta apellido en fullName', async () => {
    const eventId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const res = await request(app)
      .post(`/public/eventos/${eventId}/asistencia`)
      .send({ fullName: 'Solo', phone: '9611234567' });
    expect(res.status).toBe(400);
    expect(publicEventosService.registerAttendance).not.toHaveBeenCalled();
  });
});
