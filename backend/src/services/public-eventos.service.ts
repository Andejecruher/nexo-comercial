import { SourceChannel } from '@prisma/client';

import { env } from '../config/env.config';
import type { EventRepository, PublicEventRow } from '../repositories';
import type { CitizenRepository } from '../repositories/citizen.repository';
import { AppError } from '../utils/app-error';
import { citizenHasCompleteRegistrationProfile } from '../utils/citizen-profile';
import { normalizePhoneForStorage } from '../utils/phone-normalizer';
import { splitFullName } from '../utils/split-full-name';
import { getMondaySundayWeekBounds, parseWeekReferenceDate } from '../utils/week-range';
import type { AttendanceService } from './attendance.service';
import type { CitizensService } from './citizens.service';

export type PublicEventDto = {
  id: string;
  title: string;
  description: string | null;
  startsAt: string;
  endsAt: string | null;
  locationName: string | null;
  address: string | null;
  capacity: number | null;
};

export type PublicEventosWeekResponse = {
  weekStartsOn: string;
  weekEndsOn: string;
  timezone: string;
  events: PublicEventDto[];
};

export type PublicEventoAsistenciaResponse = {
  registration: {
    id: string;
    eventId: string;
    citizenId: string;
    registrationStatus: string;
    attendanceStatus: string;
    createdAt: string;
  };
  citizen: {
    id: string;
    phone: string;
    created: boolean;
    profileComplete: boolean;
  };
};

function toPublicEventDto(row: PublicEventRow): PublicEventDto {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt ? row.endsAt.toISOString() : null,
    locationName: row.locationName,
    address: row.address,
    capacity: row.capacity,
  };
}

export class PublicEventosService {
  constructor(
    private readonly events: EventRepository,
    private readonly citizensRepo: CitizenRepository,
    private readonly citizensService: CitizensService,
    private readonly attendanceService: AttendanceService,
    private readonly eventsTimeZone: string = env.PUBLIC_EVENTS_TZ,
  ) {}

  async listWeek(params: { referenceDateStr?: string }): Promise<PublicEventosWeekResponse> {
    const ref = parseWeekReferenceDate(params.referenceDateStr, this.eventsTimeZone);
    const bounds = getMondaySundayWeekBounds(this.eventsTimeZone, ref);

    const rows = await this.events.listPublishedInRange(bounds.rangeStartUtc, bounds.rangeEndUtc);

    return {
      weekStartsOn: bounds.weekStartsOn,
      weekEndsOn: bounds.weekEndsOn,
      timezone: bounds.timeZone,
      events: rows.map(toPublicEventDto),
    };
  }

  /**
   * RSVP público: evento publicado en la semana calendario actual (TZ configurada).
   * Crea ciudadano mínimo si no existe (sourceChannel event), sin pisar datos si ya existía.
   */
  async registerAttendance(params: {
    eventId: string;
    fullName: string;
    phoneRaw: string;
    email?: string;
    consentGiven?: boolean;
  }): Promise<PublicEventoAsistenciaResponse> {
    const phone = normalizePhoneForStorage(params.phoneRaw);
    if (phone.length < 10) {
      throw AppError.badRequest('Teléfono inválido');
    }

    const { name, lastName } = splitFullName(params.fullName);
    if (!name.trim() || !lastName?.trim()) {
      throw AppError.badRequest('Ingresá nombre y apellido');
    }

    const now = new Date();
    const weekBounds = getMondaySundayWeekBounds(this.eventsTimeZone, now);

    const event = await this.events.findPublishedInRangeById(
      params.eventId,
      weekBounds.rangeStartUtc,
      weekBounds.rangeEndUtc,
    );
    if (!event) {
      throw AppError.notFound('Evento no encontrado o no disponible en esta semana');
    }

    let citizen = await this.citizensRepo.findByNormalizedPhone(phone);

    if (!citizen && params.email?.trim()) {
      const emailTrim = params.email.trim();
      const byEmail = await this.citizensRepo.findByEmailInsensitive(emailTrim);
      if (byEmail) {
        if (byEmail.phone !== phone) {
          throw AppError.badRequest('El correo no coincide con el teléfono ingresado');
        }
        citizen = byEmail;
      }
    }

    let citizenCreated = false;
    if (!citizen) {
      await this.citizensService.create({
        phone,
        name: name || undefined,
        lastName,
        email: params.email?.trim() || undefined,
        consentGiven: params.consentGiven ?? false,
        sourceChannel: SourceChannel.event,
        interests: [],
      });
      citizenCreated = true;
      citizen = await this.citizensRepo.findByNormalizedPhone(phone);
    }

    if (!citizen) {
      throw AppError.conflict('No se pudo crear el ciudadano');
    }

    const reg = await this.attendanceService.register(params.eventId, {
      citizenId: citizen.id,
    });

    const profileComplete = citizenHasCompleteRegistrationProfile({
      name: citizen.name,
      phone: citizen.phone,
      neighborhoodId: citizen.neighborhoodId,
      neighborhood: citizen.neighborhood,
    });

    return {
      registration: {
        id: reg.id,
        eventId: reg.eventId,
        citizenId: reg.citizenId,
        registrationStatus: reg.registrationStatus,
        attendanceStatus: reg.attendanceStatus,
        createdAt: reg.createdAt.toISOString(),
      },
      citizen: {
        id: citizen.id,
        phone,
        created: citizenCreated,
        profileComplete,
      },
    };
  }
}
