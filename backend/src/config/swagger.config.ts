/**
 * Especificación OpenAPI 3.0 del backend Nexo Comercial.
 *
 * DECISIÓN DE DISEÑO: spec programática pura (sin swagger-jsdoc).
 *
 * Motivo: swagger-jsdoc parsea comentarios JSDoc en runtime buscando archivos
 * mediante globs. En producción (Docker/dist/) los archivos compilados no
 * incluyen la carpeta `docs/` (no es importada por ningún módulo), por lo que
 * swagger-jsdoc nunca la encuentra y devuelve 0 paths.
 *
 * Al definir la spec como objeto TypeScript plano:
 *  - No hay globs, no hay resolución de rutas en runtime.
 *  - El compilador verifica la coherencia del objeto.
 *  - La spec es idéntica en dev, prod y Docker sin configuración adicional.
 *  - swagger-jsdoc ya no es necesaria como dependencia.
 */

// Tipos mínimos de OpenAPI 3.0 definidos localmente para no depender de openapi-types.
// Suficiente para tipar la spec completa con seguridad en TypeScript.
type SchemaObject = Record<string, unknown>;
type ResponseObject = Record<string, unknown>;
type SecuritySchemeObject = Record<string, unknown>;
type PathsObject = Record<string, unknown>;
type OpenAPIDocument = {
  openapi: string;
  info: Record<string, unknown>;
  servers?: Array<{ url: string; description?: string }>;
  tags?: Array<{ name: string; description?: string }>;
  components?: {
    schemas?: Record<string, SchemaObject>;
    responses?: Record<string, ResponseObject>;
    securitySchemes?: Record<string, SecuritySchemeObject>;
  };
  paths: PathsObject;
};

export type SwaggerSpecParams = {
  port: number;
  base_url: string;
};

// ─── Schemas reutilizables ────────────────────────────────────────────────────

const schemas: Record<string, SchemaObject> = {
  ErrorResponse: {
    type: 'object',
    required: ['error'],
    properties: {
      error: {
        type: 'string',
        description: 'Mensaje de error legible',
        example: 'Credenciales inválidas',
      },
      code: {
        type: 'string',
        description: 'Código de error de la aplicación',
        example: 'UNAUTHORIZED',
      },
    },
  },
  ValidationErrorResponse: {
    type: 'object',
    required: ['error', 'details'],
    properties: {
      error: { type: 'string', example: 'Datos inválidos' },
      details: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            path: { type: 'array', items: { type: 'string' } },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  RateLimitErrorResponse: {
    type: 'object',
    required: ['error', 'code'],
    properties: {
      error: {
        type: 'string',
        example: 'Demasiados intentos de inicio de sesión. Intentá nuevamente en 15 minutos.',
      },
      code: { type: 'string', enum: ['RATE_LIMITED', 'ACCOUNT_LOCKED'], example: 'RATE_LIMITED' },
    },
  },

  EmailTestSendTextRequest: {
    type: 'object',
    required: ['to', 'subject', 'message'],
    additionalProperties: false,
    properties: {
      to: { type: 'string', format: 'email', example: 'destinatario@example.com' },
      subject: { type: 'string', maxLength: 120 },
      message: { type: 'string', maxLength: 2000 },
    },
  },
  EmailTestSendHtmlRequest: {
    type: 'object',
    required: ['to', 'subject', 'title', 'message'],
    additionalProperties: false,
    properties: {
      to: { type: 'string', format: 'email' },
      subject: { type: 'string', maxLength: 120 },
      title: { type: 'string', maxLength: 120 },
      message: { type: 'string', maxLength: 2000 },
    },
  },
  EmailTestInvitationPreviewRequest: {
    type: 'object',
    required: ['to', 'recipientName'],
    additionalProperties: false,
    properties: {
      to: { type: 'string', format: 'email' },
      recipientName: { type: 'string', maxLength: 120, example: 'Usuario de prueba' },
    },
  },
  NewsletterSubscribeRequest: {
    type: 'object',
    required: ['email'],
    properties: {
      email: { type: 'string', format: 'email', example: 'ciudadana@example.com' },
      name: { type: 'string', maxLength: 255, example: 'María' },
      source: { type: 'string', maxLength: 50, example: 'footer', default: 'footer' },
    },
  },
  NewsletterUnsubscribeRequest: {
    type: 'object',
    required: ['token'],
    properties: {
      token: {
        type: 'string',
        minLength: 64,
        maxLength: 64,
        description: 'Token opaco recibido por correo (64 caracteres hex)',
      },
    },
  },
  PublicEventItem: {
    type: 'object',
    required: ['id', 'title', 'startsAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string' },
      description: { type: 'string', nullable: true },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time', nullable: true },
      locationName: { type: 'string', nullable: true },
      address: { type: 'string', nullable: true },
      capacity: { type: 'integer', nullable: true },
    },
  },
  PublicEventWeekResponse: {
    type: 'object',
    required: ['weekStartsOn', 'weekEndsOn', 'timezone', 'events'],
    properties: {
      weekStartsOn: { type: 'string', example: '2026-05-04' },
      weekEndsOn: { type: 'string', example: '2026-05-10' },
      timezone: { type: 'string', example: 'America/Mexico_City' },
      events: { type: 'array', items: { $ref: '#/components/schemas/PublicEventItem' } },
    },
  },
  PublicEventoAsistenciaRequest: {
    type: 'object',
    required: ['fullName', 'phone'],
    properties: {
      fullName: { type: 'string', minLength: 2, maxLength: 500, example: 'María López Pérez' },
      phone: { type: 'string', minLength: 10, maxLength: 30, example: '529611234567' },
      email: { type: 'string', format: 'email', nullable: true },
      consentGiven: { type: 'boolean', description: 'Opcional; default false al crear ciudadano' },
    },
  },
  PublicEventoAsistenciaResponse: {
    type: 'object',
    required: ['registration', 'citizen'],
    properties: {
      registration: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          eventId: { type: 'string', format: 'uuid' },
          citizenId: { type: 'string', format: 'uuid' },
          registrationStatus: { type: 'string' },
          attendanceStatus: { type: 'string' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      citizen: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          phone: { type: 'string' },
          created: { type: 'boolean' },
          profileComplete: { type: 'boolean' },
        },
      },
    },
  },
  AuthTokenPair: {
    type: 'object',
    required: ['accessToken', 'refreshToken'],
    properties: {
      accessToken: {
        type: 'string',
        description: 'JWT de acceso de corta duración (default 15min)',
      },
      refreshToken: {
        type: 'string',
        description: 'JWT de refresco de larga duración (default 7d), single-use con rotación',
      },
    },
  },
  PanelRole: {
    type: 'string',
    enum: ['SUPER_ADMIN', 'COORDINADOR', 'CAPTURISTA', 'OPERADOR_CHAT', 'LIDER'],
    description: 'Rol del usuario en el panel administrativo',
    example: 'SUPER_ADMIN',
  },
  User: {
    type: 'object',
    required: ['id', 'email', 'roles'],
    properties: {
      id: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
      email: { type: 'string', format: 'email', example: 'admin@nexocomercial.mx' },
      fullName: { type: 'string', nullable: true, example: 'Ana García' },
      roles: { type: 'array', items: { $ref: '#/components/schemas/PanelRole' } },
      isActive: { type: 'boolean', description: 'Presente en respuestas de admin', example: true },
      createdAt: {
        type: 'string',
        format: 'date-time',
        description: 'Presente en respuestas de admin',
        example: '2024-01-15T10:30:00.000Z',
      },
    },
  },
  LoginRequest: {
    type: 'object',
    required: ['email', 'password'],
    properties: {
      email: { type: 'string', format: 'email', example: 'admin@nexocomercial.mx' },
      password: { type: 'string', minLength: 1, example: 'changeme_in_production_123!' },
      deviceId: {
        type: 'string',
        description: 'Identificador estable del dispositivo',
        example: 'browser-chrome-desktop-uuid',
      },
    },
  },
  RefreshRequest: {
    type: 'object',
    required: ['refreshToken'],
    properties: {
      refreshToken: { type: 'string', example: 'eyJhbGciOiJIUzI1NiJ9...' },
      deviceId: { type: 'string', example: 'browser-chrome-desktop-uuid' },
    },
  },
  LogoutRequest: {
    type: 'object',
    properties: {
      refreshToken: { type: 'string', description: 'Refresh token a invalidar' },
      logoutAll: {
        type: 'boolean',
        description: 'Invalida TODAS las sesiones del usuario',
        example: false,
      },
    },
  },
  RegisterAdminRequest: {
    type: 'object',
    required: ['email', 'password', 'fullName', 'roles'],
    properties: {
      email: { type: 'string', format: 'email', example: 'nuevo.admin@nexocomercial.mx' },
      password: { type: 'string', minLength: 8, example: 'PasswordSeguro123!' },
      fullName: { type: 'string', minLength: 2, example: 'Carlos Rodríguez' },
      roles: {
        type: 'array',
        minItems: 1,
        items: { $ref: '#/components/schemas/PanelRole' },
        example: ['COORDINADOR'],
      },
    },
  },
  CreateUserRequest: {
    type: 'object',
    required: ['email', 'password', 'fullName'],
    properties: {
      email: { type: 'string', format: 'email', example: 'operador@vozciudadana.gob' },
      password: { type: 'string', minLength: 8, example: 'PasswordSeguro123!' },
      fullName: { type: 'string', minLength: 2, example: 'María López' },
      isActive: { type: 'boolean', example: true },
      roleIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        description: 'IDs de roles a asignar al crear el usuario (opcional)',
      },
    },
  },
  UpdateUserRequest: {
    type: 'object',
    properties: {
      fullName: { type: 'string', minLength: 2, example: 'María López Actualizado' },
      password: { type: 'string', minLength: 8, example: 'PasswordNuevo123!' },
      isActive: { type: 'boolean', example: true },
    },
  },
  CursorPaginationMeta: {
    type: 'object',
    required: ['hasNextPage', 'count'],
    properties: {
      nextCursor: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'Cursor para solicitar la siguiente página',
      },
      hasNextPage: {
        type: 'boolean',
        example: true,
      },
      count: {
        type: 'integer',
        minimum: 0,
        example: 20,
      },
    },
  },
  NeighborhoodCatalog: {
    type: 'object',
    required: ['id', 'name', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Centro' },
      description: { type: 'string', nullable: true, example: 'Zona céntrica de la ciudad' },
      zone: { type: 'string', nullable: true, example: 'Norte' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateNeighborhoodRequest: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 255, example: 'Centro' },
      description: { type: 'string', nullable: true, example: 'Zona céntrica de la ciudad' },
      zone: { type: 'string', nullable: true, example: 'Norte' },
    },
  },
  UpdateNeighborhoodRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 255, example: 'Centro Histórico' },
      description: { type: 'string', nullable: true, example: 'Descripción actualizada' },
      zone: { type: 'string', nullable: true, example: 'Centro' },
    },
  },
  TagCatalog: {
    type: 'object',
    required: ['id', 'name', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'infraestructura' },
      description: { type: 'string', nullable: true, example: 'Temas de obras públicas' },
      color: { type: 'string', nullable: true, example: '#0EA5E9' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateTagRequest: {
    type: 'object',
    required: ['name'],
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100, example: 'infraestructura' },
      description: { type: 'string', nullable: true, example: 'Temas de obras públicas' },
      color: { type: 'string', nullable: true, example: '#0EA5E9' },
    },
  },
  UpdateTagRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', minLength: 2, maxLength: 100, example: 'infraestructura-local' },
      description: { type: 'string', nullable: true, example: 'Descripción actualizada' },
      color: { type: 'string', nullable: true, example: '#F97316' },
    },
  },
  DepartmentCatalog: {
    type: 'object',
    required: ['id', 'slug', 'name', 'isActive', 'keywords', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      slug: { type: 'string', example: 'general' },
      name: { type: 'string', example: 'Atención General' },
      description: { type: 'string', nullable: true, example: 'Canal de atención general' },
      isActive: { type: 'boolean', example: true },
      keywords: { type: 'array', items: { type: 'string' }, example: ['general', 'ayuda'] },

      schedule: { type: 'array', items: { $ref: '#/components/schemas/DepartmentScheduleDay' } },
      scheduleExceptions: {
        type: 'array',
        items: { $ref: '#/components/schemas/DepartmentScheduleException' },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  DepartmentTimeInterval: {
    type: 'object',
    required: ['startTime', 'endTime'],
    properties: {
      startTime: { type: 'string', example: '08:00' },
      endTime: { type: 'string', example: '14:00' },
    },
  },
  DepartmentScheduleDay: {
    type: 'object',
    required: ['dayOfWeek', 'isOpen', 'intervals'],
    properties: {
      dayOfWeek: {
        type: 'string',
        enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
      },
      isOpen: { type: 'boolean' },
      intervals: { type: 'array', items: { $ref: '#/components/schemas/DepartmentTimeInterval' } },
    },
  },
  DepartmentExceptionRecurrenceType: {
    type: 'string',
    enum: ['NONE', 'YEARLY', 'WEEKLY', 'SPECIFIC_WEEKDAYS'],
    description:
      'NONE conserva startDate/endDate. YEARLY usa mes/día anual y permite cruzar año; 29 de febrero solo aplica en años bisiestos. WEEKLY usa una fecha ancla y días activos. SPECIFIC_WEEKDAYS aplica a días semanales concretos. Las vigencias son inclusivas.',
  },
  DepartmentScheduleException: {
    type: 'object',
    required: ['type', 'recurrenceType', 'intervals'],
    properties: {
      type: { type: 'string', enum: ['PARTIALLY_OPEN', 'PARTIALLY_CLOSED', 'FULLY_CLOSED'] },
      recurrenceType: { $ref: '#/components/schemas/DepartmentExceptionRecurrenceType' },
      startDate: { type: 'string', format: 'date', nullable: true, example: '2026-09-16' },
      endDate: { type: 'string', format: 'date', nullable: true, example: '2026-09-16' },
      recurrenceStartsOn: { type: 'string', format: 'date', nullable: true, example: '2026-01-01' },
      recurrenceEndsOn: { type: 'string', format: 'date', nullable: true, example: '2026-12-31' },
      yearlyStartMonth: { type: 'integer', minimum: 1, maximum: 12, example: 9 },
      yearlyStartDay: { type: 'integer', minimum: 1, maximum: 31, example: 16 },
      yearlyEndMonth: { type: 'integer', minimum: 1, maximum: 12, example: 9 },
      yearlyEndDay: { type: 'integer', minimum: 1, maximum: 31, example: 16 },
      weeklyAnchorDate: { type: 'string', format: 'date', nullable: true, example: '2026-08-03' },
      weekdays: {
        type: 'array',
        items: {
          type: 'string',
          enum: ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'],
        },
        example: ['FRIDAY'],
      },
      reason: { type: 'string', nullable: true },
      intervals: { type: 'array', items: { $ref: '#/components/schemas/DepartmentTimeInterval' } },
    },
    examples: {
      nonRecurring: {
        value: {
          type: 'FULLY_CLOSED',
          recurrenceType: 'NONE',
          startDate: '2026-09-16',
          endDate: '2026-09-16',
          intervals: [],
        },
      },
      yearlySingleDay: {
        value: {
          type: 'FULLY_CLOSED',
          recurrenceType: 'YEARLY',
          recurrenceStartsOn: '2026-01-01',
          recurrenceEndsOn: null,
          yearlyStartMonth: 9,
          yearlyStartDay: 16,
          yearlyEndMonth: 9,
          yearlyEndDay: 16,
          intervals: [],
        },
      },
      yearlyCrossYear: {
        value: {
          type: 'FULLY_CLOSED',
          recurrenceType: 'YEARLY',
          recurrenceStartsOn: '2026-01-01',
          yearlyStartMonth: 12,
          yearlyStartDay: 30,
          yearlyEndMonth: 1,
          yearlyEndDay: 2,
          intervals: [],
        },
      },
      everyFriday: {
        value: {
          type: 'PARTIALLY_CLOSED',
          recurrenceType: 'SPECIFIC_WEEKDAYS',
          recurrenceStartsOn: '2026-08-01',
          recurrenceEndsOn: '2026-12-31',
          weekdays: ['FRIDAY'],
          intervals: [{ startTime: '12:00', endTime: '14:00' }],
        },
      },
      weeklyPattern: {
        value: {
          type: 'FULLY_CLOSED',
          recurrenceType: 'WEEKLY',
          recurrenceStartsOn: '2026-08-01',
          weeklyAnchorDate: '2026-08-03',
          weekdays: ['TUESDAY', 'THURSDAY'],
          intervals: [],
        },
      },
    },
  },
  DepartmentAvailabilityResponse: {
    type: 'object',
    properties: {
      department: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          slug: { type: 'string' },
          name: { type: 'string' },
          status: { type: 'string', enum: ['ACTIVE', 'INACTIVE'] },
        },
      },
      requestedAt: { type: 'string', format: 'date-time' },
      timezone: { type: 'string', example: 'America/Mexico_City' },
      isAvailable: { type: 'boolean' },
      reason: {
        type: 'string',
        enum: [
          'DEPARTMENT_INACTIVE',
          'NO_SCHEDULE_CONFIGURED',
          'CLOSED_DAY',
          'OUTSIDE_BUSINESS_HOURS',
          'REGULAR_SCHEDULE',
          'EXCEPTION_PARTIALLY_OPEN',
          'EXCEPTION_PARTIALLY_CLOSED',
          'EXCEPTION_FULLY_CLOSED',
        ],
      },
      effectiveSchedule: {
        type: 'array',
        items: { $ref: '#/components/schemas/DepartmentTimeInterval' },
      },
      currentInterval: {
        nullable: true,
        allOf: [{ $ref: '#/components/schemas/DepartmentTimeInterval' }],
      },
      recurrenceType: { $ref: '#/components/schemas/DepartmentExceptionRecurrenceType' },
      appliedException: {
        type: 'object',
        nullable: true,
        properties: {
          id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['PARTIALLY_OPEN', 'PARTIALLY_CLOSED', 'FULLY_CLOSED'] },
          recurrenceType: { $ref: '#/components/schemas/DepartmentExceptionRecurrenceType' },
          reason: { type: 'string', nullable: true },
        },
      },
      nextChangeAt: { type: 'string', format: 'date-time', nullable: true },
      nextAvailableAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  CreateDepartmentRequest: {
    type: 'object',
    required: ['slug', 'name'],
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', example: 'obras-publicas' },
      name: { type: 'string', minLength: 2, maxLength: 255, example: 'Obras Públicas' },
      description: { type: 'string', nullable: true, example: 'Gestión de infraestructura urbana' },
      isActive: { type: 'boolean', example: true },
      keywords: { type: 'array', items: { type: 'string' }, example: ['bache', 'pavimento'] },
      schedule: {
        type: 'array',
        items: { $ref: '#/components/schemas/DepartmentScheduleDay' },
        description: 'Inicio inclusivo, fin exclusivo. No se permiten cruces de medianoche.',
      },
      scheduleExceptions: {
        type: 'array',
        items: { $ref: '#/components/schemas/DepartmentScheduleException' },
        description:
          'Rangos no recurrentes y vigencias recurrentes inclusivos. Precedencia: puntual, anual, semanal, días específicos. Conflictos del mismo nivel se rechazan; una puntual puede sobrescribir una recurrente. No se generan ocurrencias futuras.',
      },
    },
  },
  UpdateDepartmentRequest: {
    type: 'object',
    properties: {
      slug: { type: 'string', pattern: '^[a-z0-9]+(?:-[a-z0-9]+)*$', example: 'obras' },
      name: { type: 'string', minLength: 2, maxLength: 255, example: 'Obras' },
      description: { type: 'string', nullable: true, example: 'Descripción actualizada' },
      isActive: { type: 'boolean', example: false },
      keywords: { type: 'array', items: { type: 'string' }, example: ['alumbrado', 'banqueta'] },
      schedule: { type: 'array', items: { $ref: '#/components/schemas/DepartmentScheduleDay' } },
      scheduleExceptions: {
        type: 'array',
        items: { $ref: '#/components/schemas/DepartmentScheduleException' },
      },
    },
  },
  ConversationFlowState: {
    type: 'string',
    enum: ['REGISTERING', 'DEPARTMENT_ROUTING', 'BOT_FLOW', 'HUMAN_FLOW', 'ESCALATED', 'CLOSED'],
    description: 'Estado del flujo de la conversación',
    example: 'BOT_FLOW',
  },
  SendTextRequest: {
    type: 'object',
    required: ['to', 'body'],
    properties: {
      to: {
        type: 'string',
        minLength: 10,
        description: 'Número E.164 o formato aceptado por WhatsApp Cloud API',
        example: '5491123456789',
      },
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
        example: 'Hola, ¿en qué te puedo ayudar?',
      },
      conversationId: {
        type: 'string',
        format: 'uuid',
        description: 'Opcional — vincula el envío a una conversación existente',
        example: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  },
  HandoverRequest: {
    type: 'object',
    required: ['conversationId'],
    properties: {
      conversationId: {
        type: 'string',
        format: 'uuid',
        example: '550e8400-e29b-41d4-a716-446655440000',
      },
    },
  },
  ConversationCitizen: {
    type: 'object',
    required: ['id', 'phone'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      phone: { type: 'string' },
      name: { type: 'string', nullable: true },
    },
  },
  ConversationMeta: {
    type: 'object',
    properties: {
      flowState: { $ref: '#/components/schemas/ConversationFlowState' },
      version: { type: 'integer', example: 0 },
      lockedByUserId: { type: 'string', format: 'uuid', nullable: true },
      departmentSlug: { type: 'string', nullable: true },
      handoverAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  ConversationItem: {
    type: 'object',
    required: ['id', 'citizen'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      status: { type: 'string', example: 'open' },
      channel: { type: 'string', example: 'whatsapp' },
      assignedUserId: { type: 'string', format: 'uuid', nullable: true },
      assignedDept: { type: 'string', nullable: true },
      citizen: { $ref: '#/components/schemas/ConversationCitizen' },
      meta: { $ref: '#/components/schemas/ConversationMeta' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  ConversationListResponse: {
    type: 'object',
    properties: {
      items: { type: 'array', items: { $ref: '#/components/schemas/ConversationItem' } },
      meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
    },
  },
  AssignRequest: {
    type: 'object',
    properties: {
      userId: { type: 'string', format: 'uuid' },
      departmentSlug: { type: 'string' },
    },
  },
  AssignResponse: {
    type: 'object',
    properties: {
      assigned: { type: 'boolean' },
      conversationId: { type: 'string', format: 'uuid' },
      agentId: { type: 'string', format: 'uuid' },
    },
  },
  TransferRequest: {
    type: 'object',
    required: ['toUserId'],
    properties: {
      toUserId: { type: 'string', format: 'uuid' },
      departmentSlug: { type: 'string' },
    },
  },
  TransferResponse: {
    type: 'object',
    properties: {
      transferred: { type: 'boolean' },
      conversationId: { type: 'string', format: 'uuid' },
      toUserId: { type: 'string', format: 'uuid' },
    },
  },
  ActionResultSimple: {
    type: 'object',
    properties: { ok: { type: 'boolean' } },
  },
  MessageType: {
    type: 'string',
    enum: [
      'text',
      'image',
      'audio',
      'video',
      'document',
      'location',
      'template',
      'interactive',
      'system',
    ],
    description: 'Tipo de mensaje',
    example: 'text',
  },
  MessageStatusValue: {
    type: 'string',
    enum: ['sent', 'delivered', 'read', 'failed'],
    description: 'Estado de entrega de un mensaje outbound',
    example: 'delivered',
  },
  MessageDeliveryStatus: {
    type: 'object',
    required: ['id', 'messageId', 'wamid', 'status', 'timestamp'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      messageId: { type: 'string', format: 'uuid' },
      wamid: { type: 'string', example: 'wamid.HBgLNTQ5...AA' },
      status: { $ref: '#/components/schemas/MessageStatusValue' },
      errorCode: { type: 'integer', nullable: true, example: null },
      errorTitle: { type: 'string', nullable: true, example: null },
      timestamp: { type: 'string', format: 'date-time' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  AttachmentRecord: {
    type: 'object',
    required: ['id', 'storageKey', 'mimeType', 'fileSizeBytes', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      storageKey: { type: 'string', example: 'uploads/2026/04/documento.pdf' },
      mimeType: { type: 'string', example: 'application/pdf' },
      fileSizeBytes: {
        type: 'string',
        description: 'Tamaño en bytes (string para precisión BigInt)',
        example: '98765',
      },
      originalFilename: { type: 'string', nullable: true, example: 'documento.pdf' },
      cdnUrl: { type: 'string', nullable: true, example: 'https://cdn.example.com/documento.pdf' },
      messageId: { type: 'string', format: 'uuid', nullable: true },
      uploadedBy: { type: 'string', format: 'uuid', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  MessageRecord: {
    type: 'object',
    required: ['id', 'conversationId', 'body', 'direction', 'messageType', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      conversationId: { type: 'string', format: 'uuid' },
      body: { type: 'string', example: 'Hola, ¿en qué te puedo ayudar?' },
      direction: {
        type: 'string',
        enum: ['inbound', 'outbound'],
        example: 'outbound',
      },
      messageType: { $ref: '#/components/schemas/MessageType' },
      externalMessageId: { type: 'string', nullable: true, example: 'wamid.HBgLNTQ5...AA' },
      meta: { type: 'object', description: 'Metadata adicional del mensaje', example: {} },
      createdAt: { type: 'string', format: 'date-time' },
      statuses: {
        type: 'array',
        items: { $ref: '#/components/schemas/MessageDeliveryStatus' },
        description: 'Timeline de estados de entrega (solo mensajes outbound)',
      },
      attachmentsViaMessageId: {
        type: 'array',
        items: { $ref: '#/components/schemas/AttachmentRecord' },
        description: 'Attachments vinculados a este mensaje',
      },
    },
  },
  MessageListResponse: {
    type: 'object',
    required: ['items', 'meta'],
    properties: {
      items: {
        type: 'array',
        items: { $ref: '#/components/schemas/MessageRecord' },
      },
      meta: {
        type: 'object',
        required: ['hasNextPage'],
        properties: {
          nextCursor: { type: 'string', format: 'uuid', nullable: true },
          hasNextPage: { type: 'boolean', example: false },
        },
      },
    },
  },
  SendConversationMessageRequest: {
    type: 'object',
    required: ['body'],
    properties: {
      body: {
        type: 'string',
        minLength: 1,
        maxLength: 4096,
        description: 'Texto del mensaje',
        example: '¡Hola! Tu solicitud fue recibida.',
      },
      messageType: {
        $ref: '#/components/schemas/MessageType',
        description: 'Tipo de mensaje (default: text)',
      },
    },
  },
  SendConversationMessageResponse: {
    type: 'object',
    required: ['message', 'idempotencyKey'],
    properties: {
      message: { $ref: '#/components/schemas/MessageRecord' },
      idempotencyKey: {
        type: 'string',
        format: 'uuid',
        description: 'Clave de idempotencia usada (provista o generada automáticamente)',
        example: '550e8400-e29b-41d4-a716-446655440099',
      },
    },
  },
  AddAttachmentRequest: {
    type: 'object',
    required: ['storageKey', 'mimeType', 'fileSizeBytes'],
    properties: {
      storageKey: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
        description: 'Ruta del archivo en el storage (S3/GCS/local)',
        example: 'uploads/2026/04/documento.pdf',
      },
      mimeType: {
        type: 'string',
        minLength: 1,
        maxLength: 127,
        description: 'MIME type del archivo',
        example: 'application/pdf',
      },
      fileSizeBytes: {
        type: 'string',
        pattern: '^[0-9]+$',
        description:
          'Tamaño en bytes como string numérico (evita pérdida de precisión BigInt en JSON)',
        example: '98765',
      },
      originalFilename: {
        type: 'string',
        maxLength: 512,
        description: 'Nombre original del archivo (opcional)',
        example: 'documento.pdf',
      },
      cdnUrl: {
        type: 'string',
        format: 'uri',
        description: 'URL pública del archivo en CDN (opcional)',
        example: 'https://cdn.example.com/uploads/documento.pdf',
      },
    },
  },
  AuditLogRecord: {
    type: 'object',
    required: ['id', 'action', 'targetType', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      actorId: {
        type: 'string',
        format: 'uuid',
        nullable: true,
        description: 'null si la acción fue del sistema',
      },
      action: {
        type: 'string',
        example: 'user.create',
        description: 'Código de la acción auditada',
      },
      targetType: { type: 'string', example: 'User', description: 'Tipo del recurso afectado' },
      targetId: { type: 'string', nullable: true, example: '550e8400-e29b-41d4-a716-446655440000' },
      metadata: {
        type: 'object',
        description: 'Datos adicionales de la acción',
        example: { email: 'nuevo@vozciudadana.gob' },
      },
      ip: { type: 'string', nullable: true, example: '192.168.1.1' },
      userAgent: { type: 'string', nullable: true, example: 'Mozilla/5.0...' },
      createdAt: { type: 'string', format: 'date-time' },
    },
  },
  InboxEventRecord: {
    type: 'object',
    required: ['id', 'wamid', 'phone', 'status', 'retryCount', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      wamid: {
        type: 'string',
        example: 'wamid.HBgLNTQ5...AA',
        description: 'ID único del mensaje en Meta',
      },
      phone: { type: 'string', example: '+5491123456789' },
      status: {
        type: 'string',
        enum: ['pending', 'processing', 'processed', 'failed', 'dead_lettered'],
        example: 'failed',
      },
      retryCount: { type: 'integer', minimum: 0, example: 3 },
      lastError: { type: 'string', nullable: true, example: 'Connection timeout' },
      lastErrorAt: { type: 'string', format: 'date-time', nullable: true },
      idempotencyKey: { type: 'string', nullable: true, example: 'wamid.HBgLNTQ5...AA' },
      createdAt: { type: 'string', format: 'date-time' },
      processedAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  OutboxEventRecord: {
    type: 'object',
    required: ['id', 'phone', 'status', 'retryCount', 'idempotencyKey', 'createdAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      conversationId: { type: 'string', format: 'uuid', nullable: true },
      phone: { type: 'string', example: '+5491187654321' },
      status: {
        type: 'string',
        enum: ['pending', 'sending', 'sent', 'failed', 'dead_lettered'],
        example: 'failed',
      },
      retryCount: { type: 'integer', minimum: 0, example: 5 },
      nextRetryAt: { type: 'string', format: 'date-time', nullable: true },
      lastError: { type: 'string', nullable: true, example: 'Meta API error 500' },
      wamid: { type: 'string', nullable: true, example: 'wamid.HBgLNTQ5...AA' },
      idempotencyKey: { type: 'string', example: 'idem_outbox_001' },
      createdAt: { type: 'string', format: 'date-time' },
      sentAt: { type: 'string', format: 'date-time', nullable: true },
    },
  },
  SystemConfig: {
    type: 'object',
    properties: {
      message: { type: 'string', example: 'Configuración del sistema (solo SUPERADMIN)' },
      features: {
        type: 'object',
        properties: {
          rbacEnabled: { type: 'boolean' },
          refreshTokenRotation: { type: 'boolean' },
          refreshTokenStorage: { type: 'string', example: 'postgres' },
          multiSession: { type: 'boolean' },
          auditLog: { type: 'boolean' },
          rateLimiting: { type: 'boolean' },
          progressiveLockout: { type: 'boolean' },
        },
      },
    },
  },
  // ── Eventos ciudadanos ──────────────────────────────────────────────────────
  EventStatus: {
    type: 'string',
    enum: ['draft', 'published', 'completed', 'cancelled'],
    description: 'Estado del evento',
    example: 'published',
  },
  EventType: {
    type: 'string',
    enum: ['townhall', 'community', 'volunteer', 'campaign', 'rally'],
    description: 'Tipo de evento',
    example: 'townhall',
  },
  RegistrationStatus: {
    type: 'string',
    enum: ['invited', 'registered', 'confirmed', 'cancelled', 'waitlist'],
    description: 'Estado del registro del ciudadano al evento',
    example: 'registered',
  },
  AttendanceStatus: {
    type: 'string',
    enum: ['pending', 'attended', 'no_show'],
    description: 'Estado de asistencia del ciudadano al evento',
    example: 'attended',
  },
  EventRecord: {
    type: 'object',
    required: ['id', 'title', 'slug', 'eventType', 'status', 'startsAt', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', maxLength: 255, example: 'Asamblea vecinal 2026' },
      slug: { type: 'string', example: 'asamblea-vecinal-2026' },
      description: { type: 'string', nullable: true, example: 'Encuentro con vecinos del centro' },
      eventType: { $ref: '#/components/schemas/EventType' },
      status: { $ref: '#/components/schemas/EventStatus' },
      startsAt: { type: 'string', format: 'date-time', example: '2026-05-10T18:00:00.000Z' },
      endsAt: { type: 'string', format: 'date-time', nullable: true },
      locationName: { type: 'string', nullable: true, example: 'Salón Municipal' },
      neighborhood: { type: 'string', nullable: true, example: 'Centro' },
      address: { type: 'string', nullable: true, example: 'Av. Rivadavia 1234' },
      latitude: { type: 'string', nullable: true, example: '-34.6037' },
      longitude: { type: 'string', nullable: true, example: '-58.3816' },
      capacity: { type: 'integer', nullable: true, example: 100 },
      organizerUserId: { type: 'string', format: 'uuid', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateEventRequest: {
    type: 'object',
    required: ['title', 'startsAt'],
    properties: {
      title: { type: 'string', minLength: 2, maxLength: 255, example: 'Asamblea vecinal 2026' },
      description: {
        type: 'string',
        maxLength: 10000,
        example: 'Encuentro con vecinos del centro',
      },
      eventType: { $ref: '#/components/schemas/EventType' },
      status: { $ref: '#/components/schemas/EventStatus' },
      startsAt: { type: 'string', format: 'date-time', example: '2026-05-10T18:00:00.000Z' },
      endsAt: { type: 'string', format: 'date-time', nullable: true },
      locationName: { type: 'string', maxLength: 255, example: 'Salón Municipal' },
      neighborhood: { type: 'string', maxLength: 255, example: 'Centro' },
      address: { type: 'string', maxLength: 500, example: 'Av. Rivadavia 1234' },
      capacity: { type: 'integer', minimum: 1, example: 100 },
    },
  },
  UpdateEventRequest: {
    type: 'object',
    description: 'Al menos un campo debe estar presente',
    properties: {
      title: {
        type: 'string',
        minLength: 2,
        maxLength: 255,
        example: 'Asamblea vecinal 2026 (actualizado)',
      },
      description: { type: 'string', maxLength: 10000 },
      eventType: { $ref: '#/components/schemas/EventType' },
      status: { $ref: '#/components/schemas/EventStatus' },
      startsAt: { type: 'string', format: 'date-time' },
      endsAt: { type: 'string', format: 'date-time' },
      locationName: { type: 'string', maxLength: 255 },
      neighborhood: { type: 'string', maxLength: 255 },
      address: { type: 'string', maxLength: 500 },
      capacity: { type: 'integer', minimum: 1 },
    },
  },
  InviteEventRequest: {
    type: 'object',
    required: ['message'],
    description: 'Al menos tagIds o neighborhoodIds debe estar presente',
    properties: {
      message: {
        type: 'string',
        minLength: 1,
        maxLength: 1024,
        example: '¡Te invitamos a la asamblea vecinal del 10 de mayo en el Salón Municipal!',
      },
      tagIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        description: 'IDs de etiquetas para filtrar ciudadanos',
        minItems: 1,
      },
      neighborhoodIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        description: 'IDs de barrios para filtrar ciudadanos',
        minItems: 1,
      },
    },
  },
  InviteEventResponse: {
    type: 'object',
    required: ['result'],
    properties: {
      result: {
        type: 'object',
        required: ['queued', 'alreadyInvited'],
        properties: {
          queued: { type: 'integer', example: 42, description: 'Invitaciones enviadas a la cola' },
          alreadyInvited: {
            type: 'integer',
            example: 8,
            description: 'Ciudadanos ya con registro activo',
          },
        },
      },
    },
  },
  RegistrationCitizen: {
    type: 'object',
    required: ['id', 'name', 'phone'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', example: 'Ana García' },
      phone: { type: 'string', example: '+5491123456789' },
    },
  },
  EventRegistrationRecord: {
    type: 'object',
    required: [
      'id',
      'eventId',
      'citizenId',
      'registrationStatus',
      'attendanceStatus',
      'sourceChannel',
      'createdAt',
      'updatedAt',
      'citizen',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      eventId: { type: 'string', format: 'uuid' },
      citizenId: { type: 'string', format: 'uuid' },
      registrationStatus: { $ref: '#/components/schemas/RegistrationStatus' },
      attendanceStatus: { $ref: '#/components/schemas/AttendanceStatus' },
      checkedInAt: { type: 'string', format: 'date-time', nullable: true },
      sourceChannel: { type: 'string', example: 'web' },
      notes: { type: 'string', nullable: true },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
      citizen: { $ref: '#/components/schemas/RegistrationCitizen' },
    },
  },
  RegisterEventRequest: {
    type: 'object',
    required: ['citizenId'],
    properties: {
      citizenId: { type: 'string', format: 'uuid', description: 'ID del ciudadano a registrar' },
      notes: { type: 'string', maxLength: 1000, description: 'Notas opcionales del operador' },
    },
  },
  CheckInEventRequest: {
    type: 'object',
    properties: {
      notes: { type: 'string', maxLength: 1000, description: 'Notas opcionales del operador' },
    },
  },
  // ── Analytics ──────────────────────────────────────────────────────────────
  AnalyticsTicketKPIs: {
    type: 'object',
    required: [
      'openTickets',
      'inProgressTickets',
      'resolvedTickets',
      'closedTickets',
      'slaBreachedTickets',
    ],
    properties: {
      openTickets: { type: 'integer', minimum: 0, example: 12 },
      inProgressTickets: { type: 'integer', minimum: 0, example: 5 },
      resolvedTickets: { type: 'integer', minimum: 0, example: 48 },
      closedTickets: { type: 'integer', minimum: 0, example: 120 },
      slaBreachedTickets: { type: 'integer', minimum: 0, example: 3 },
    },
  },
  AnalyticsTicketTimings: {
    type: 'object',
    required: ['avgFirstResponseTime', 'avgResolutionTime', 'avgHandleTime'],
    properties: {
      avgFirstResponseTime: {
        type: 'number',
        format: 'float',
        description: 'Tiempo promedio de primera respuesta del agente (minutos)',
        example: 4.5,
      },
      avgResolutionTime: {
        type: 'number',
        format: 'float',
        description: 'Tiempo promedio de resolución desde apertura (minutos)',
        example: 42.3,
      },
      avgHandleTime: {
        type: 'number',
        format: 'float',
        description: 'Tiempo promedio de manejo total (minutos, alias de avgResolutionTime)',
        example: 42.3,
      },
    },
  },
  AnalyticsDailyVolume: {
    type: 'object',
    required: ['date', 'opened', 'closed'],
    properties: {
      date: { type: 'string', format: 'date', example: '2026-05-01' },
      opened: { type: 'integer', minimum: 0, example: 18 },
      closed: { type: 'integer', minimum: 0, example: 15 },
    },
  },
  AnalyticsSlaMetrics: {
    type: 'object',
    required: ['met', 'breached', 'complianceRate'],
    properties: {
      met: { type: 'integer', minimum: 0, example: 95 },
      breached: { type: 'integer', minimum: 0, example: 5 },
      complianceRate: {
        type: 'number',
        format: 'float',
        minimum: 0,
        maximum: 1,
        description: 'Tasa de cumplimiento SLA (0–1)',
        example: 0.95,
      },
    },
  },
  AnalyticsFlowMetrics: {
    type: 'object',
    required: ['botFlow', 'humanFlow', 'escalated'],
    properties: {
      botFlow: { type: 'integer', minimum: 0, example: 230 },
      humanFlow: { type: 'integer', minimum: 0, example: 87 },
      escalated: { type: 'integer', minimum: 0, example: 12 },
    },
  },
  AnalyticsAgentPerformance: {
    type: 'object',
    required: [
      'agentId',
      'name',
      'ticketsHandled',
      'avgResponseTime',
      'avgResolutionTime',
      'slaCompliance',
    ],
    properties: {
      agentId: { type: 'string', format: 'uuid', example: '550e8400-e29b-41d4-a716-446655440000' },
      name: { type: 'string', example: 'Ana García' },
      ticketsHandled: { type: 'integer', minimum: 0, example: 34 },
      avgResponseTime: {
        type: 'number',
        format: 'float',
        description: 'Tiempo promedio de primera respuesta (minutos)',
        example: 3.8,
      },
      avgResolutionTime: {
        type: 'number',
        format: 'float',
        description: 'Tiempo promedio de resolución (minutos)',
        example: 38.2,
      },
      slaCompliance: {
        type: 'number',
        format: 'float',
        minimum: 0,
        maximum: 1,
        description: 'Tasa de cumplimiento SLA del agente (0–1)',
        example: 0.97,
      },
    },
  },
  AnalyticsDepartmentDistribution: {
    type: 'object',
    required: ['department', 'count'],
    properties: {
      department: { type: 'string', example: 'obras-publicas' },
      count: { type: 'integer', minimum: 0, example: 42 },
    },
  },
  AnalyticsDashboardResponse: {
    type: 'object',
    required: ['kpis', 'timings', 'dailyVolume', 'sla', 'flow'],
    properties: {
      kpis: { $ref: '#/components/schemas/AnalyticsTicketKPIs' },
      timings: { $ref: '#/components/schemas/AnalyticsTicketTimings' },
      dailyVolume: {
        type: 'array',
        items: { $ref: '#/components/schemas/AnalyticsDailyVolume' },
      },
      sla: { $ref: '#/components/schemas/AnalyticsSlaMetrics' },
      flow: { $ref: '#/components/schemas/AnalyticsFlowMetrics' },
    },
  },
  AnalyticsTicketsResponse: {
    type: 'object',
    required: ['kpis', 'timings', 'dailyVolume', 'sla'],
    properties: {
      kpis: { $ref: '#/components/schemas/AnalyticsTicketKPIs' },
      timings: { $ref: '#/components/schemas/AnalyticsTicketTimings' },
      dailyVolume: {
        type: 'array',
        items: { $ref: '#/components/schemas/AnalyticsDailyVolume' },
      },
      sla: { $ref: '#/components/schemas/AnalyticsSlaMetrics' },
    },
  },
  AnalyticsAgentsResponse: {
    type: 'object',
    required: ['agents'],
    properties: {
      agents: {
        type: 'array',
        items: { $ref: '#/components/schemas/AnalyticsAgentPerformance' },
      },
    },
  },
  AnalyticsDepartmentsResponse: {
    type: 'object',
    required: ['departments'],
    properties: {
      departments: {
        type: 'array',
        items: { $ref: '#/components/schemas/AnalyticsDepartmentDistribution' },
      },
    },
  },
  // ── Ciudadanos (CRM) ────────────────────────────────────────────────────────
  Citizen: {
    type: 'object',
    required: [
      'id',
      'phone',
      'sourceChannel',
      'leadStatus',
      'consentGiven',
      'interests',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      phone: { type: 'string', example: '+5491123456789' },
      name: { type: 'string', nullable: true, example: 'Ana' },
      lastName: { type: 'string', nullable: true, example: 'García' },
      email: { type: 'string', format: 'email', nullable: true },
      sourceChannel: { type: 'string', example: 'whatsapp' },
      leadStatus: { type: 'string', example: 'new' },
      consentGiven: { type: 'boolean', example: true },
      consentAt: { type: 'string', format: 'date-time', nullable: true },
      neighborhood: { type: 'string', nullable: true, example: 'Centro' },
      neighborhoodId: { type: 'string', format: 'uuid', nullable: true },
      interests: { type: 'array', items: { type: 'string' }, example: ['obras', 'seguridad'] },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },
  CreateCitizenRequest: {
    type: 'object',
    required: ['phone'],
    properties: {
      phone: { type: 'string', minLength: 6, maxLength: 30, example: '+5491123456789' },
      name: { type: 'string', minLength: 1, maxLength: 255, example: 'Ana' },
      lastName: { type: 'string', minLength: 1, maxLength: 255, example: 'García' },
      email: { type: 'string', format: 'email', example: 'ana@example.com' },
      neighborhoodId: { type: 'string', format: 'uuid' },
      interests: { type: 'array', items: { type: 'string' } },
      consentGiven: { type: 'boolean', example: true },
    },
  },
  UpdateCitizenRequest: {
    type: 'object',
    description: 'Al menos un campo debe estar presente',
    properties: {
      phone: { type: 'string', minLength: 6, maxLength: 30 },
      name: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
      lastName: { type: 'string', minLength: 1, maxLength: 255, nullable: true },
      email: { type: 'string', format: 'email', nullable: true },
      neighborhoodId: { type: 'string', format: 'uuid' },
      interests: { type: 'array', items: { type: 'string' } },
      consentGiven: { type: 'boolean' },
    },
  },
  CitizenBulkTagRequest: {
    type: 'object',
    required: ['citizenIds', 'tagIds'],
    properties: {
      citizenIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        minItems: 1,
        maxItems: 500,
      },
      tagIds: {
        type: 'array',
        items: { type: 'string', format: 'uuid' },
        minItems: 1,
        maxItems: 100,
      },
      operation: { type: 'string', enum: ['assign', 'remove'], default: 'assign' },
    },
  },
  CitizenBulkTagResult: {
    type: 'object',
    required: ['operation', 'processed', 'updated', 'skipped', 'errors'],
    properties: {
      operation: { type: 'string', enum: ['assign', 'remove'] },
      processed: { type: 'integer', minimum: 0 },
      updated: { type: 'integer', minimum: 0 },
      skipped: { type: 'integer', minimum: 0 },
      errors: {
        type: 'array',
        items: {
          type: 'object',
          required: ['citizenId', 'tagId', 'code', 'message'],
          properties: {
            citizenId: { type: 'string', format: 'uuid' },
            tagId: { type: 'string', format: 'uuid' },
            code: { type: 'string', example: 'CITIZEN_NOT_FOUND' },
            message: { type: 'string' },
          },
        },
      },
    },
  },
  CitizenTagAssignment: {
    type: 'object',
    required: ['id', 'citizenId', 'tagId', 'assignedAt', 'tag'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      citizenId: { type: 'string', format: 'uuid' },
      tagId: { type: 'string', format: 'uuid' },
      assignedById: { type: 'string', format: 'uuid', nullable: true },
      assignedAt: { type: 'string', format: 'date-time' },
      tag: { $ref: '#/components/schemas/TagCatalog' },
    },
  },
  CitizenProfile: {
    type: 'object',
    required: ['citizen', 'tags', 'conversationSummary', 'participationHistory'],
    properties: {
      citizen: { $ref: '#/components/schemas/Citizen' },
      tags: {
        type: 'array',
        items: { $ref: '#/components/schemas/TagCatalog' },
      },
      conversationSummary: {
        type: 'object',
        required: ['totalConversations', 'openConversations', 'lastConversation'],
        properties: {
          totalConversations: { type: 'integer', minimum: 0 },
          openConversations: { type: 'integer', minimum: 0 },
          lastConversation: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string', format: 'uuid' },
              status: { type: 'string' },
              channel: { type: 'string' },
              updatedAt: { type: 'string', format: 'date-time' },
              lastMessage: { type: 'string', nullable: true },
            },
          },
        },
      },
      participationHistory: {
        type: 'array',
        items: {
          type: 'object',
          required: [
            'registrationId',
            'eventId',
            'eventTitle',
            'eventStartsAt',
            'registrationStatus',
            'attendanceStatus',
            'sourceChannel',
          ],
          properties: {
            registrationId: { type: 'string', format: 'uuid' },
            eventId: { type: 'string', format: 'uuid' },
            eventTitle: { type: 'string' },
            eventStartsAt: { type: 'string', format: 'date-time' },
            registrationStatus: { type: 'string' },
            attendanceStatus: { type: 'string' },
            sourceChannel: { type: 'string' },
            checkedInAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
  },
};

// ─── Responses reutilizables ──────────────────────────────────────────────────

const responses: Record<string, ResponseObject> = {
  Unauthorized: {
    description: 'Token de acceso inválido, expirado o ausente',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Unauthorized', code: 'UNAUTHORIZED' },
      },
    },
  },
  Forbidden: {
    description: 'El usuario no tiene el rol requerido para este recurso',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Forbidden', code: 'FORBIDDEN' },
      },
    },
  },
  Conflict: {
    description: 'Conflicto de negocio (duplicado, transición inválida, etc.)',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Transición inválida', code: 'CONFLICT' },
      },
    },
  },
  NotFound: {
    description: 'Recurso no encontrado',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Usuario no encontrado', code: 'NOT_FOUND' },
      },
    },
  },
  RateLimited: {
    description: 'Rate limit excedido o cuenta bloqueada',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/RateLimitErrorResponse' },
      },
    },
  },
  InternalError: {
    description: 'Error interno del servidor',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
        example: { error: 'Internal server error' },
      },
    },
  },
};

// ─── Security schemes ─────────────────────────────────────────────────────────

const securitySchemes: Record<string, SecuritySchemeObject> = {
  bearerAuth: {
    type: 'http',
    scheme: 'bearer',
    bearerFormat: 'JWT',
    description:
      'JWT de acceso obtenido en POST /api/v1/auth/login. Formato: `Bearer <accessToken>`',
  },
  hubSignature: {
    type: 'apiKey',
    in: 'header',
    name: 'X-Hub-Signature-256',
    description: 'Firma HMAC-SHA256 generada por Meta sobre el raw body del webhook',
  },
};

// ─── Paths ────────────────────────────────────────────────────────────────────

const paths: PathsObject = {
  '/api/v1/admin/email-test/configuration': {
    get: {
      tags: ['Diagnóstico de correo'],
      summary: 'Consulta configuración de Mailtrap sin secretos',
      description:
        'Requiere Bearer JWT y permiso email.test. Solo debe habilitarse temporalmente en ambientes no productivos con ENABLE_EMAIL_TEST_ENDPOINTS=true.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Estado de configuración' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { description: 'Deshabilitado' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },
  '/api/v1/admin/email-test/connection': {
    post: {
      tags: ['Diagnóstico de correo'],
      summary: 'Documenta verificación de conexión del Email API',
      description:
        'Mailtrap Email API no expone ping sin envío; esta operación valida habilitación, permiso, configuración y rate limit, y documenta que los envíos controlados son la prueba efectiva.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: { description: 'Resultado normalizado' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { description: 'Deshabilitado' },
        503: { description: 'Configuración incompleta' },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },
  '/api/v1/admin/email-test/send-text': {
    post: {
      tags: ['Diagnóstico de correo'],
      summary: 'Envía correo de texto controlado vía Mailtrap',
      description:
        'No permite cc/bcc, remitente custom, adjuntos, múltiples destinatarios ni credenciales en el body. Requiere permiso email.test y allowlist.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/EmailTestSendTextRequest' } },
        },
      },
      responses: {
        200: { description: 'Solicitud aceptada por proveedor' },
        400: { $ref: '#/components/responses/InternalError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { description: 'Deshabilitado' },
        422: { description: 'Destinatario o contenido rechazado' },
        429: { $ref: '#/components/responses/RateLimited' },
        502: { description: 'Fallo del proveedor' },
        503: { description: 'Proveedor no disponible/configuración incompleta' },
        504: { description: 'Timeout del proveedor' },
      },
    },
  },
  '/api/v1/admin/email-test/send-html': {
    post: {
      tags: ['Diagnóstico de correo'],
      summary: 'Envía correo HTML construido por plantilla segura',
      description:
        'Swagger no acepta HTML arbitrario; el backend renderiza una plantilla controlada y escapa datos.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/EmailTestSendHtmlRequest' } },
        },
      },
      responses: {
        200: { description: 'Solicitud aceptada por proveedor' },
        400: { $ref: '#/components/responses/InternalError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { description: 'Deshabilitado' },
        422: { description: 'Contenido rechazado' },
        429: { $ref: '#/components/responses/RateLimited' },
        502: { description: 'Fallo del proveedor' },
        503: { description: 'Proveedor no disponible/configuración incompleta' },
        504: { description: 'Timeout del proveedor' },
      },
    },
  },
  '/api/v1/admin/email-test/send-invitation-preview': {
    post: {
      tags: ['Diagnóstico de correo'],
      summary: 'Envía vista previa de invitación sin crear usuarios',
      description:
        'Reutiliza la plantilla de invitación con URL /activation-preview sin token válido y aviso visible de prueba.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/EmailTestInvitationPreviewRequest' },
          },
        },
      },
      responses: {
        200: { description: 'Vista previa enviada al proveedor' },
        400: { $ref: '#/components/responses/InternalError' },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { description: 'Deshabilitado' },
        429: { $ref: '#/components/responses/RateLimited' },
        502: { description: 'Fallo del proveedor' },
        503: { description: 'Proveedor no disponible/configuración incompleta' },
      },
    },
  },
  // ── Health ──────────────────────────────────────────────────────────────────
  '/health': {
    get: {
      tags: ['Health'],
      summary: 'Estado de la aplicación',
      description:
        'Endpoint de health check. Retorna el estado de la API y el timestamp actual. No requiere autenticación.',
      responses: {
        200: {
          description: 'Aplicación funcionando correctamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status', 'ts'],
                properties: {
                  status: { type: 'string', enum: ['ok'], example: 'ok' },
                  ts: { type: 'string', format: 'date-time', example: '2024-01-15T10:30:00.000Z' },
                },
              },
              example: { status: 'ok', ts: '2024-01-15T10:30:00.000Z' },
            },
          },
        },
      },
    },
  },

  // ── Eventos públicos (sitio) ───────────────────────────────────────────────
  '/api/v1/public/eventos/semana': {
    get: {
      tags: ['Public — Eventos'],
      summary: 'Listar eventos publicados de la semana calendario',
      description:
        'Semana lunes–domingo en `PUBLIC_EVENTS_TZ` (default America/Mexico_City). Query opcional `referenceDate=YYYY-MM-DD` para anclar la semana. Rate limit por IP.',
      parameters: [
        {
          name: 'referenceDate',
          in: 'query',
          required: false,
          schema: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$', example: '2026-05-05' },
          description: 'Fecha de referencia dentro de la semana a listar',
        },
      ],
      responses: {
        200: {
          description: 'Semana y eventos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublicEventWeekResponse' },
            },
          },
        },
        400: {
          description: 'referenceDate inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },
  '/api/v1/public/eventos/{eventId}/asistencia': {
    post: {
      tags: ['Public — Eventos'],
      summary: 'Registrar asistencia (RSVP) a un evento',
      description:
        'Resuelve o crea ciudadano mínimo (nombre + teléfono, canal `event`) y crea inscripción. El evento debe estar `published` y su `startsAt` en la semana calendario actual. Rate limit por IP.',
      parameters: [
        {
          name: 'eventId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/PublicEventoAsistenciaRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Inscripción creada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/PublicEventoAsistenciaResponse' },
            },
          },
        },
        400: {
          description: 'Validación',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        404: {
          description: 'Evento no disponible en esta semana',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        409: {
          description: 'Ya inscripto o conflicto de ciudadano',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },

  // ── Newsletter público ─────────────────────────────────────────────────────
  '/api/v1/public/newsletter/subscribe': {
    post: {
      tags: ['Public — Newsletter'],
      summary: 'Suscribirse al boletín',
      description:
        'Alta pública sin autenticación. Con `NEWSLETTER_DOUBLE_OPT_IN=true` la fila queda en `pending` y se envía el correo `newsletter-confirm`. Un fallo de correo no cancela el alta. Rate limit por IP.',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NewsletterSubscribeRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Suscripción activa (o ya estaba activa)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['active'] },
                  alreadySubscribed: { type: 'boolean' },
                  subscribedAt: { type: 'string', format: 'date-time', nullable: true },
                },
              },
            },
          },
        },
        201: {
          description: 'Pendiente de confirmación por correo (double opt-in)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['pending'] },
                  message: { type: 'string' },
                  confirmExpiresAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        400: {
          description: 'Validación',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },
  '/api/v1/public/newsletter/verify/{token}': {
    get: {
      tags: ['Public — Newsletter'],
      summary: 'Verificar token de confirmación (double opt-in)',
      parameters: [
        {
          in: 'path',
          name: 'token',
          required: true,
          schema: { type: 'string', minLength: 64, maxLength: 64 },
        },
      ],
      responses: {
        200: {
          description: 'Estado del token',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['valid'],
                    properties: { valid: { type: 'boolean', enum: [false] } },
                  },
                  {
                    type: 'object',
                    required: ['valid', 'status', 'emailMasked'],
                    properties: {
                      valid: { type: 'boolean', enum: [true] },
                      status: { type: 'string', enum: ['pending'] },
                      emailMasked: { type: 'string' },
                    },
                  },
                ],
              },
            },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },
  '/api/v1/public/newsletter/confirm/{token}': {
    post: {
      tags: ['Public — Newsletter'],
      summary: 'Confirmar suscripción (double opt-in)',
      parameters: [
        {
          in: 'path',
          name: 'token',
          required: true,
          schema: { type: 'string', minLength: 64, maxLength: 64 },
        },
      ],
      responses: {
        200: {
          description: 'Suscripción activada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['active'] },
                  subscribedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        404: {
          description: 'Token inválido o expirado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },
  '/api/v1/public/newsletter/unsubscribe': {
    post: {
      tags: ['Public — Newsletter'],
      summary: 'Darse de baja del boletín',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/NewsletterUnsubscribeRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Baja registrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { status: { type: 'string', enum: ['unsubscribed'] } },
              },
            },
          },
        },
        400: {
          description: 'Validación',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        404: {
          description: 'Token inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: {
          description: 'Rate limit',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/RateLimitErrorResponse' } },
          },
        },
      },
    },
  },

  // ── Auth ────────────────────────────────────────────────────────────────────
  '/api/v1/auth/login': {
    post: {
      tags: ['Auth'],
      summary: 'Iniciar sesión',
      description: [
        'Autentica al usuario admin con email y contraseña.',
        'Retorna un par de tokens JWT (access + refresh) y el perfil del usuario.',
        '',
        '**Rate limiting**: 10 intentos / 15 min por IP.',
        '**Lockout progresivo**: Tras 5 fallos consecutivos: 60s → 5min → 15min → 1h.',
        '**Device binding**: Enviar `x-device-id` o `body.deviceId` para multi-sesión real.',
      ].join('\n'),
      parameters: [
        {
          in: 'header',
          name: 'x-device-id',
          schema: { type: 'string' },
          description:
            'Identificador estable del dispositivo. Si se omite, se genera UUID aleatorio.',
          example: 'browser-chrome-desktop-uuid',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LoginRequest' },
            examples: {
              withDevice: {
                summary: 'Login con device-id en body',
                value: {
                  email: 'admin@nexocomercial.mx',
                  password: 'changeme_in_production_123!',
                  deviceId: 'browser-chrome-desktop-uuid',
                },
              },
              minimal: {
                summary: 'Login mínimo (sesión anónima)',
                value: { email: 'admin@nexocomercial.mx', password: 'changeme_in_production_123!' },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Login exitoso — par de tokens + perfil del usuario',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['accessToken', 'refreshToken', 'user'],
                properties: {
                  accessToken: { type: 'string', description: 'JWT de acceso (15min por defecto)' },
                  refreshToken: { type: 'string', description: 'JWT de refresco (7d, single-use)' },
                  user: { $ref: '#/components/schemas/User' },
                },
              },
            },
          },
        },
        400: {
          description: 'Datos de entrada inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: {
          description: 'Credenciales inválidas o usuario inactivo',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: { $ref: '#/components/responses/RateLimited' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/auth/forgot-password': {
    post: {
      tags: ['Auth'],
      summary: 'Solicitar restablecimiento de contraseña',
      description: [
        'Público. Siempre responde 202 con el mismo mensaje, exista o no la cuenta,',
        'para no enumerar correos registrados.',
        'Si el email pertenece a un usuario **activo**, se emite un token de un solo uso',
        'y se envía el correo `password-reset`.',
        '',
        '**Rate limiting**: por IP (`PASSWORD_RESET_RATE_LIMIT_*`). Sin lockout de cuenta.',
      ].join('\n'),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['email'],
              properties: { email: { type: 'string', format: 'email' } },
            },
            example: { email: 'ana@example.test' },
          },
        },
      },
      responses: {
        202: {
          description: 'Solicitud aceptada (respuesta genérica)',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { message: { type: 'string' } },
              },
            },
          },
        },
        400: {
          description: 'Email inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },

  '/api/v1/auth/reset-password/validate': {
    get: {
      tags: ['Auth'],
      summary: 'Validar token de restablecimiento',
      description: 'Público. No cacheable. El token viaja en query y no se registra en logs.',
      parameters: [
        {
          in: 'query',
          name: 'token',
          required: true,
          schema: { type: 'string', minLength: 20 },
        },
      ],
      responses: {
        200: {
          description: 'Resultado de la validación',
          content: {
            'application/json': {
              schema: {
                oneOf: [
                  {
                    type: 'object',
                    required: ['valid', 'email', 'expiresAt'],
                    properties: {
                      valid: { type: 'boolean', enum: [true] },
                      email: { type: 'string', format: 'email' },
                      expiresAt: { type: 'string', format: 'date-time' },
                    },
                  },
                  {
                    type: 'object',
                    required: ['valid', 'reason'],
                    properties: {
                      valid: { type: 'boolean', enum: [false] },
                      reason: { type: 'string', enum: ['invalid', 'expired', 'used'] },
                    },
                  },
                ],
              },
            },
          },
        },
        400: {
          description: 'Token ausente o demasiado corto',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  valid: { type: 'boolean', enum: [false] },
                  reason: { type: 'string', enum: ['invalid'] },
                },
              },
            },
          },
        },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },

  '/api/v1/auth/reset-password': {
    post: {
      tags: ['Auth'],
      summary: 'Aplicar nueva contraseña',
      description: [
        'Público. Consume el token (un solo uso), actualiza el hash y cierra todas las sesiones.',
        '',
        '**Rate limiting**: por IP. Sin lockout de cuenta.',
      ].join('\n'),
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['token', 'password', 'passwordConfirmation'],
              properties: {
                token: { type: 'string', minLength: 1 },
                password: { type: 'string', minLength: 8 },
                passwordConfirmation: { type: 'string', minLength: 8 },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Contraseña actualizada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { message: { type: 'string' } },
              },
            },
          },
        },
        400: {
          description: 'Token inválido o contraseñas que no coinciden',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        409: {
          description: 'El enlace ya fue utilizado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        410: {
          description: 'El enlace expiró',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        429: { $ref: '#/components/responses/RateLimited' },
      },
    },
  },

  '/api/v1/auth/refresh': {
    post: {
      tags: ['Auth'],
      summary: 'Renovar access token',
      description: [
        'Rota el refresh token: invalida el anterior y emite un nuevo par.',
        'El refresh token es **single-use** — reutilizarlo activa detección de replay attack.',
        '',
        '**Rate limiting**: 60 intentos / 5 min por IP.',
      ].join('\n'),
      parameters: [
        {
          in: 'header',
          name: 'x-device-id',
          schema: { type: 'string' },
          description: 'ID del dispositivo (para detección de anomalías)',
          example: 'browser-chrome-desktop-uuid',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RefreshRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Tokens renovados exitosamente',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AuthTokenPair' } },
          },
        },
        400: {
          description: 'refreshToken ausente',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: {
          description: 'Token inválido, expirado, sesión expirada o replay detectado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
              examples: {
                expired: {
                  value: { error: 'Refresh token inválido o expirado', code: 'UNAUTHORIZED' },
                },
                replay: { value: { error: 'Refresh token ya utilizado', code: 'UNAUTHORIZED' } },
              },
            },
          },
        },
        429: { $ref: '#/components/responses/RateLimited' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/auth/me': {
    get: {
      tags: ['Auth'],
      summary: 'Perfil del usuario autenticado',
      description:
        'Retorna el perfil del usuario asociado al access token. Consulta DB para datos actualizados.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Perfil del usuario autenticado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/auth/logout': {
    post: {
      tags: ['Auth'],
      summary: 'Cerrar sesión',
      description: [
        'Invalida la sesión actual o todas las sesiones del usuario.',
        '',
        '- **Sin `logoutAll`**: invalida solo la sesión del `refreshToken` provisto.',
        '- **Con `logoutAll: true`**: invalida TODAS las sesiones (todos los dispositivos).',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: false,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/LogoutRequest' },
            examples: {
              single: { summary: 'Cerrar sesión actual', value: { refreshToken: 'eyJhbGci...' } },
              all: { summary: 'Cerrar todas las sesiones', value: { logoutAll: true } },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Sesión(es) cerrada(s) exitosamente',
          content: {
            'application/json': {
              schema: { type: 'object', properties: { message: { type: 'string' } } },
              examples: {
                single: { value: { message: 'Sesión cerrada correctamente' } },
                all: { value: { message: 'Todas las sesiones cerradas correctamente' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/auth/register': {
    post: {
      tags: ['Auth'],
      summary: 'Registrar nuevo administrador (solo SUPERADMIN)',
      description:
        'Crea un nuevo usuario del panel administrativo. Requiere rol **SUPERADMIN**. Queda registrado en audit log.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/RegisterAdminRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Usuario creado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'El email ya está registrado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Ciudadanos (CRM) ────────────────────────────────────────────────────────
  '/api/v1/citizens': {
    get: {
      tags: ['Citizens'],
      summary: 'Listar ciudadanos',
      description:
        'Listado paginado por cursor con filtros. Requiere rol **SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de la página anterior',
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Tamaño de página',
        },
        {
          in: 'query',
          name: 'search',
          required: false,
          schema: { type: 'string', maxLength: 255 },
          description: 'Búsqueda por teléfono, nombre, apellido o email',
        },
        {
          in: 'query',
          name: 'phone',
          required: false,
          schema: { type: 'string', maxLength: 30 },
          description: 'Filtro parcial por teléfono',
        },
        {
          in: 'query',
          name: 'leadStatus',
          required: false,
          schema: { type: 'string', maxLength: 50 },
        },
        {
          in: 'query',
          name: 'sourceChannel',
          required: false,
          schema: { type: 'string', maxLength: 50 },
        },
        {
          in: 'query',
          name: 'neighborhoodId',
          required: false,
          schema: { type: 'string', format: 'uuid' },
        },
        {
          in: 'query',
          name: 'tagIds',
          required: false,
          style: 'form',
          explode: true,
          schema: { type: 'array', items: { type: 'string', format: 'uuid' }, maxItems: 20 },
          description: 'Filtrar ciudadanos que tengan alguna de estas etiquetas',
        },
      ],
      responses: {
        200: {
          description: 'Listado de ciudadanos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['citizens', 'meta'],
                properties: {
                  citizens: { type: 'array', items: { $ref: '#/components/schemas/Citizen' } },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Filtros o paginación inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Citizens'],
      summary: 'Crear ciudadano',
      description: 'Crea un ciudadano. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/CreateCitizenRequest' } },
        },
      },
      responses: {
        201: {
          description: 'Ciudadano creado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['citizen'],
                properties: { citizen: { $ref: '#/components/schemas/Citizen' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/citizens/tags/bulk': {
    post: {
      tags: ['Citizens'],
      summary: 'Asignar o quitar etiquetas en lote',
      description:
        'Operación masiva parcial (errores por par ciudadano/etiqueta en `errors`). **SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CitizenBulkTagRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Resultado del lote',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/CitizenBulkTagResult' },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/citizens/{id}': {
    get: {
      tags: ['Citizens'],
      summary: 'Obtener ciudadano por ID',
      description: '**SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Ciudadano',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['citizen'],
                properties: { citizen: { $ref: '#/components/schemas/Citizen' } },
              },
            },
          },
        },
        400: {
          description: 'ID inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    patch: {
      tags: ['Citizens'],
      summary: 'Actualizar ciudadano',
      description: 'Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/UpdateCitizenRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Ciudadano actualizado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['citizen'],
                properties: { citizen: { $ref: '#/components/schemas/Citizen' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Citizens'],
      summary: 'Eliminar ciudadano',
      description: 'Eliminación física. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Ciudadano eliminado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'citizen'],
                properties: {
                  message: { type: 'string', example: 'Ciudadano eliminado correctamente' },
                  citizen: { $ref: '#/components/schemas/Citizen' },
                },
              },
            },
          },
        },
        400: {
          description: 'ID inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/citizens/{id}/tags/{tagId}': {
    post: {
      tags: ['Citizens'],
      summary: 'Asignar etiqueta a ciudadano',
      description: '**SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'tagId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        201: {
          description: 'Relación creada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['assigned'],
                properties: { assigned: { $ref: '#/components/schemas/CitizenTagAssignment' } },
              },
            },
          },
        },
        400: {
          description: 'IDs inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Citizens'],
      summary: 'Quitar etiqueta de ciudadano',
      description: '**SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
        { in: 'path', name: 'tagId', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Etiqueta removida',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                description: 'Registro `CitizenTag` eliminado (forma Prisma)',
                additionalProperties: true,
              },
            },
          },
        },
        400: {
          description: 'IDs inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/citizens/{id}/profile': {
    get: {
      tags: ['Citizens'],
      summary: 'Perfil extendido del ciudadano',
      description:
        'Ciudadano, etiquetas, resumen de conversaciones e historial de participación en eventos. **SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Perfil',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/CitizenProfile' } },
          },
        },
        400: {
          description: 'ID inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Admin ───────────────────────────────────────────────────────────────────
  '/api/v1/admin/users': {
    get: {
      tags: ['Admin'],
      summary: 'Listar usuarios del panel',
      description:
        'Retorna todos los usuarios del panel administrativo con sus roles. Acceso **SUPERADMIN** o **COORDINADOR**.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Lista de usuarios',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['users'],
                properties: {
                  users: { type: 'array', items: { $ref: '#/components/schemas/User' } },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Crear usuario del panel',
      description:
        'Crea un nuevo usuario del panel administrativo. Solo **SUPERADMIN**. Queda en audit log.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateUserRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Usuario creado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'Email ya registrado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/users/{id}': {
    get: {
      tags: ['Admin'],
      summary: 'Obtener usuario del panel por ID',
      description: 'Retorna un usuario con sus roles. Acceso para SUPERADMIN y COORDINADOR.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del usuario',
          example: '660e8400-e29b-41d4-a716-446655440001',
        },
      ],
      responses: {
        200: {
          description: 'Usuario encontrado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    patch: {
      tags: ['Admin'],
      summary: 'Actualizar usuario del panel',
      description:
        'Actualiza `fullName`, `password` o `isActive`. Al menos un campo requerido. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del usuario a actualizar',
          example: '660e8400-e29b-41d4-a716-446655440001',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateUserRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Usuario actualizado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/users/{id}/roles/{roleId}': {
    post: {
      tags: ['Admin'],
      summary: 'Asignar rol a usuario',
      description: 'Asigna un rol a un usuario. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del usuario',
        },
        {
          in: 'path',
          name: 'roleId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del rol',
        },
      ],
      responses: {
        200: {
          description: 'Rol asignado correctamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Rol ya asignado al usuario',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Remover rol de usuario',
      description: 'Remueve un rol previamente asignado a un usuario. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del usuario',
        },
        {
          in: 'path',
          name: 'roleId',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del rol',
        },
      ],
      responses: {
        200: {
          description: 'Rol removido correctamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user'],
                properties: { user: { $ref: '#/components/schemas/User' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/config': {
    get: {
      tags: ['Admin'],
      summary: 'Configuración del sistema',
      description:
        'Retorna la configuración actual del sistema y las features habilitadas. Solo **SUPERADMIN**.',
      security: [{ bearerAuth: [] }],
      responses: {
        200: {
          description: 'Configuración del sistema',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SystemConfig' },
              example: {
                message: 'Configuración del sistema (solo SUPERADMIN)',
                features: {
                  rbacEnabled: true,
                  refreshTokenRotation: true,
                  refreshTokenStorage: 'postgres',
                  multiSession: true,
                  auditLog: true,
                  rateLimiting: true,
                  progressiveLockout: true,
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/neighborhoods': {
    get: {
      tags: ['Admin'],
      summary: 'Listar barrios (catálogo)',
      description:
        'Lista barrios con filtros, búsqueda y paginación cursor. Acceso para SUPERADMIN y COORDINADOR.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de la página anterior',
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Tamaño de página',
        },
        {
          in: 'query',
          name: 'search',
          required: false,
          schema: { type: 'string' },
          description: 'Búsqueda por nombre de barrio',
        },
        {
          in: 'query',
          name: 'zone',
          required: false,
          schema: { type: 'string' },
          description: 'Filtro por zona',
        },
      ],
      responses: {
        200: {
          description: 'Listado de barrios',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['neighborhoods', 'meta'],
                properties: {
                  neighborhoods: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/NeighborhoodCatalog' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Crear barrio (catálogo)',
      description: 'Crea un nuevo barrio. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateNeighborhoodRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Barrio creado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['neighborhood'],
                properties: {
                  neighborhood: { $ref: '#/components/schemas/NeighborhoodCatalog' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'Barrio duplicado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/neighborhoods/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Actualizar barrio (catálogo)',
      description: 'Actualiza un barrio. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del barrio',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateNeighborhoodRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Barrio actualizado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['neighborhood'],
                properties: {
                  neighborhood: { $ref: '#/components/schemas/NeighborhoodCatalog' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Barrio duplicado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Eliminar barrio (catálogo)',
      description:
        'Elimina físicamente un barrio solo si no tiene ciudadanos asociados. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del barrio',
        },
      ],
      responses: {
        200: {
          description: 'Barrio eliminado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'neighborhood'],
                properties: {
                  message: { type: 'string' },
                  neighborhood: { $ref: '#/components/schemas/NeighborhoodCatalog' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Barrio en uso por ciudadanos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/tags': {
    get: {
      tags: ['Admin'],
      summary: 'Listar etiquetas (catálogo)',
      description:
        'Lista etiquetas con filtros, búsqueda y paginación cursor. Acceso para SUPERADMIN y COORDINADOR.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de la página anterior',
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Tamaño de página',
        },
        {
          in: 'query',
          name: 'search',
          required: false,
          schema: { type: 'string' },
          description: 'Búsqueda por nombre o descripción',
        },
        {
          in: 'query',
          name: 'color',
          required: false,
          schema: { type: 'string' },
          description: 'Filtro por color',
        },
      ],
      responses: {
        200: {
          description: 'Listado de etiquetas',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tags', 'meta'],
                properties: {
                  tags: { type: 'array', items: { $ref: '#/components/schemas/TagCatalog' } },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Crear etiqueta (catálogo)',
      description: 'Crea una nueva etiqueta. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateTagRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Etiqueta creada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tag'],
                properties: { tag: { $ref: '#/components/schemas/TagCatalog' } },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'Etiqueta duplicada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/tags/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Actualizar etiqueta (catálogo)',
      description: 'Actualiza una etiqueta. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID de la etiqueta',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateTagRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Etiqueta actualizada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['tag'],
                properties: { tag: { $ref: '#/components/schemas/TagCatalog' } },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Etiqueta duplicada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Eliminar etiqueta (catálogo)',
      description:
        'Elimina físicamente una etiqueta solo si no está asignada a ciudadanos. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID de la etiqueta',
        },
      ],
      responses: {
        200: {
          description: 'Etiqueta eliminada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'tag'],
                properties: {
                  message: { type: 'string' },
                  tag: { $ref: '#/components/schemas/TagCatalog' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Etiqueta en uso por ciudadanos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/departments': {
    get: {
      tags: ['Admin'],
      summary: 'Listar departamentos (catálogo)',
      description:
        'Lista departamentos con filtros, búsqueda y paginación cursor. Acceso para SUPERADMIN y COORDINADOR.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de la página anterior',
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Tamaño de página',
        },
        {
          in: 'query',
          name: 'search',
          required: false,
          schema: { type: 'string' },
          description: 'Búsqueda por slug, nombre o keyword',
        },
        {
          in: 'query',
          name: 'isActive',
          required: false,
          schema: { type: 'boolean' },
          description: 'Filtro por estado activo/inactivo',
        },
      ],
      responses: {
        200: {
          description: 'Listado de departamentos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['departments', 'meta'],
                properties: {
                  departments: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/DepartmentCatalog' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Admin'],
      summary: 'Crear departamento (catálogo)',
      description: 'Crea un nuevo departamento. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateDepartmentRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Departamento creado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['department'],
                properties: {
                  department: { $ref: '#/components/schemas/DepartmentCatalog' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'Slug duplicado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/admin/departments/{slug}/availability': {
    get: {
      tags: ['Admin'],
      summary: 'Consultar disponibilidad operativa de un departamento',
      description:
        'Evalúa disponibilidad en America/Mexico_City. Precedencia: estado del departamento, excepción puntual, anual, semanal, días específicos y horario habitual. El inicio del intervalo es inclusivo, el fin exclusivo; la próxima disponibilidad busca hasta 365 días.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'slug', required: true, schema: { type: 'string' } },
        {
          in: 'query',
          name: 'at',
          required: true,
          schema: { type: 'string', format: 'date-time', example: '2026-09-15T11:30:00-06:00' },
        },
      ],
      responses: {
        200: {
          description: 'Disponibilidad calculada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/DepartmentAvailabilityResponse' },
            },
          },
        },
        400: {
          description: 'Fecha-hora inválida',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
      },
    },
  },

  '/api/v1/admin/departments/{id}': {
    patch: {
      tags: ['Admin'],
      summary: 'Actualizar departamento (catálogo)',
      description: 'Actualiza un departamento. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del departamento',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateDepartmentRequest' },
          },
        },
      },
      responses: {
        200: {
          description: 'Departamento actualizado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['department'],
                properties: {
                  department: { $ref: '#/components/schemas/DepartmentCatalog' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Slug duplicado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ErrorResponse' },
            },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    delete: {
      tags: ['Admin'],
      summary: 'Desactivar departamento (catálogo)',
      description:
        'Soft delete del departamento (`isActive=false`). Se protege el slug `general`. Solo SUPERADMIN.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del departamento',
        },
      ],
      responses: {
        200: {
          description: 'Departamento desactivado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['message', 'department'],
                properties: {
                  message: { type: 'string' },
                  department: { $ref: '#/components/schemas/DepartmentCatalog' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Webhook ─────────────────────────────────────────────────────────────────
  '/api/v1/webhook': {
    get: {
      tags: ['Webhook'],
      summary: 'Verificación del webhook (Meta)',
      description: [
        'Meta llama a este endpoint al configurar la suscripción al webhook.',
        'Valida `hub.mode`, `hub.verify_token` y responde con `hub.challenge` como texto plano.',
        'No requiere autenticación JWT.',
      ].join('\n'),
      parameters: [
        {
          in: 'query',
          name: 'hub.mode',
          required: true,
          schema: { type: 'string', enum: ['subscribe'] },
          description: 'Debe ser "subscribe"',
        },
        {
          in: 'query',
          name: 'hub.verify_token',
          required: true,
          schema: { type: 'string' },
          description: 'Token configurado en `WHATSAPP_VERIFY_TOKEN`',
        },
        {
          in: 'query',
          name: 'hub.challenge',
          required: true,
          schema: { type: 'string' },
          description: 'Valor arbitrario de Meta que debe retornarse sin modificar',
        },
      ],
      responses: {
        200: {
          description: 'Verificación exitosa — retorna hub.challenge como texto plano',
          content: { 'text/plain': { schema: { type: 'string' }, example: '1234567890' } },
        },
        403: {
          description: 'Token de verificación inválido o modo incorrecto',
          content: { 'text/plain': { schema: { type: 'string' }, example: 'Forbidden' } },
        },
      },
    },
    post: {
      tags: ['Webhook'],
      summary: 'Recibir mensajes y eventos de WhatsApp',
      description: [
        'Recibe mensajes y eventos entrantes de WhatsApp enviados por Meta.',
        'El middleware `metaSignature` valida la firma HMAC-SHA256 antes de procesar el payload.',
        '',
        'El procesamiento es **asíncrono** — responde `200 OK` inmediatamente a Meta (< 5s).',
        '**Nota**: No usa JWT — usa firma HMAC-SHA256 de Meta.',
      ].join('\n'),
      security: [{ hubSignature: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: {
              type: 'object',
              required: ['object', 'entry'],
              properties: {
                object: {
                  type: 'string',
                  enum: ['whatsapp_business_account'],
                  example: 'whatsapp_business_account',
                },
                entry: { type: 'array', items: { type: 'object' } },
              },
            },
          },
        },
      },
      responses: {
        200: {
          description: 'Payload recibido. Meta requiere siempre 200 OK.',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { status: { type: 'string', enum: ['ok', 'ignored'] } },
              },
              examples: {
                processed: { value: { status: 'ok' } },
                ignored: { value: { status: 'ignored' } },
              },
            },
          },
        },
        401: {
          description: 'Firma HMAC-SHA256 inválida o ausente',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  // ── Messages ─────────────────────────────────────────────────────────────────
  '/api/v1/messages/text': {
    post: {
      tags: ['Messages'],
      summary: 'Enviar mensaje de texto al ciudadano',
      description: [
        'Usuario autenticado con JWT envía un mensaje de texto outbound al número indicado.',
        'El mensaje se encola en el Outbox y se envía de forma asíncrona vía WhatsApp Cloud API.',
        '`conversationId` es opcional y sirve para vincular el envío a una conversación existente.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SendTextRequest' },
          },
        },
      },
      responses: {
        202: {
          description: 'Mensaje encolado para envío',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status', 'idempotencyKey'],
                properties: {
                  status: { type: 'string', enum: ['queued'], example: 'queued' },
                  idempotencyKey: {
                    type: 'string',
                    format: 'uuid',
                    description: 'Clave de idempotencia generada para este envío',
                  },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Handover ─────────────────────────────────────────────────────────────────
  '/api/v1/handover/take': {
    post: {
      tags: ['Handover'],
      summary: 'Tomar control de una conversación',
      description: [
        'El agente toma control de una conversación en estado BOT o DEPARTMENT_ROUTING.',
        'Transiciona el estado a **HUMAN_FLOW**.',
        'Requiere JWT válido (panel); no hay comprobación adicional de rol en la ruta.',
        'Retorna 409 si la conversación ya está asignada a un agente.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/HandoverRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Conversación tomada exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['taken'], example: 'taken' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: {
          description: 'Conversación no encontrada',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        409: {
          description: 'Conversación ya asignada a un agente',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/handover/release': {
    post: {
      tags: ['Handover'],
      summary: 'Devolver conversación al bot',
      description: [
        'El agente libera la conversación y la devuelve al bot (HUMAN_FLOW → BOT_FLOW).',
        'Requiere JWT válido (panel).',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/HandoverRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Conversación liberada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['released'], example: 'released' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: {
          description: 'Conversación no encontrada',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/handover/escalate': {
    post: {
      tags: ['Handover'],
      summary: 'Escalar una conversación',
      description: [
        'El agente escala la conversación a un nivel superior (→ ESCALATED).',
        'Requiere JWT válido (panel).',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/HandoverRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Conversación escalada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  status: { type: 'string', enum: ['escalated'], example: 'escalated' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        400: {
          description: 'Payload inválido',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: {
          description: 'Conversación no encontrada',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  // ── Conversations ─────────────────────────────────────────────────────────
  '/api/v1/conversations': {
    get: {
      tags: ['Conversations'],
      summary: 'Listar conversaciones',
      description: 'Lista conversaciones con paginación cursor. Requiere autenticación.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'cursor',
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor para paginación',
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', default: 20 },
          description: 'Límite de elementos',
        },
      ],
      responses: {
        200: {
          description: 'Lista de conversaciones paginada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ConversationListResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}': {
    get: {
      tags: ['Conversations'],
      summary: 'Obtener conversación por ID',
      description:
        'Retorna el contexto completo de la conversación (meta, ciudadano, asignaciones).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Contexto de la conversación',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { conversation: { $ref: '#/components/schemas/ConversationItem' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/assign': {
    post: {
      tags: ['Conversations'],
      summary: 'Asignar conversación a un agente',
      description:
        'Asigna la conversación a un agente y crea un registro de `Assignment`. Si es necesario, transiciona a HUMAN_FLOW.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: false,
        content: { 'application/json': { schema: { $ref: '#/components/schemas/AssignRequest' } } },
      },
      responses: {
        200: {
          description: 'Asignación creada',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AssignResponse' } },
          },
        },
        400: {
          description: 'Payload o parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/transfer': {
    post: {
      tags: ['Conversations'],
      summary: 'Transferir conversación a otro agente',
      description:
        'Pasa la asignación de una conversación a otro agente sin forzar cambio de estado a HUMAN_FLOW.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/TransferRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Transferencia realizada',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/TransferResponse' } },
          },
        },
        400: {
          description: 'Payload o parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/handover': {
    post: {
      tags: ['Conversations'],
      summary: 'Handover explícito a agente',
      description: 'Fuerza la transición a HUMAN_FLOW y crea la asignación al agente autenticado.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Handover realizado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/AssignResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/close': {
    post: {
      tags: ['Conversations'],
      summary: 'Cerrar conversación',
      description: 'Cierra la conversación (transición a CLOSED).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Conversación cerrada',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  closed: { type: 'boolean' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/reopen': {
    post: {
      tags: ['Conversations'],
      summary: 'Reabrir conversación',
      description: 'Reabre una conversación cerrada (CLOSED → BOT_FLOW).',
      security: [{ bearerAuth: [] }],
      parameters: [
        { in: 'path', name: 'id', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Conversación reabierta',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  reopened: { type: 'boolean' },
                  conversationId: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        409: { $ref: '#/components/responses/Conflict' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/conversations/{id}/messages': {
    get: {
      tags: ['Conversations'],
      summary: 'Listar mensajes de una conversación',
      description: [
        'Retorna los mensajes de una conversación en orden cronológico ascendente.',
        'Incluye los estados de entrega (`statuses`) y attachments vinculados.',
        'Paginación cursor-based — usar `nextCursor` del `meta` de la respuesta anterior.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID de la conversación',
        },
        {
          in: 'query',
          name: 'cursor',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del último mensaje recibido (cursor de paginación)',
        },
        {
          in: 'query',
          name: 'limit',
          required: false,
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Cantidad de mensajes a retornar',
        },
      ],
      responses: {
        200: {
          description: 'Lista de mensajes paginada',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/MessageListResponse' },
              example: {
                items: [
                  {
                    id: '550e8400-e29b-41d4-a716-446655440010',
                    conversationId: '550e8400-e29b-41d4-a716-446655440002',
                    body: 'Hola, necesito ayuda.',
                    direction: 'inbound',
                    messageType: 'text',
                    externalMessageId: 'wamid.HBgLNTQ5...AA',
                    meta: {},
                    createdAt: '2026-04-27T10:00:00.000Z',
                    statuses: [],
                    attachmentsViaMessageId: [],
                  },
                ],
                meta: { nextCursor: null, hasNextPage: false },
              },
            },
          },
        },
        400: {
          description: 'UUID inválido o parámetros de paginación inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Conversations'],
      summary: 'Enviar mensaje outbound desde el dashboard',
      description: [
        'El agente autenticado envía un mensaje de texto a la conversación especificada.',
        '',
        '**Append-only**: los mensajes no se modifican ni eliminan.',
        '',
        '**Idempotencia**: enviar el header `Idempotency-Key` (UUID) garantiza que el mismo mensaje',
        'no se procese dos veces. Si se repite el key, se retorna el mensaje original con HTTP 200.',
        'Si no se envía el header, se genera un UUID automáticamente.',
        '',
        '**Respuestas**:',
        '- `202 Accepted` — mensaje nuevo, encolado para envío por WhatsApp.',
        '- `200 OK` — replay detectado (mismo Idempotency-Key), se retorna el mensaje ya existente.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID de la conversación',
        },
        {
          in: 'header',
          name: 'Idempotency-Key',
          required: false,
          schema: { type: 'string', format: 'uuid' },
          description:
            'UUID para garantizar at-most-once delivery. Se genera automáticamente si se omite.',
          example: '550e8400-e29b-41d4-a716-446655440099',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/SendConversationMessageRequest' },
          },
        },
      },
      responses: {
        202: {
          description: 'Mensaje nuevo encolado para envío vía WhatsApp',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendConversationMessageResponse' },
            },
          },
        },
        200: {
          description: 'Replay — mensaje ya existente retornado (mismo Idempotency-Key)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/SendConversationMessageResponse' },
            },
          },
        },
        400: {
          description: 'Payload inválido (body vacío, body demasiado largo, UUID inválido)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── System observability ────────────────────────────────────────────────────

  '/api/v1/system/audit-logs': {
    get: {
      tags: ['System'],
      summary: 'Listar audit logs',
      description: [
        'Retorna el registro inmutable de acciones administrativas sensibles.',
        'Solo lectura — append-only por diseño.',
        '',
        '**Filtros disponibles**: `actorId`, `action`, `targetType`, `dateFrom`, `dateTo`.',
        '**Paginación**: cursor-based (`cursor` + `limit`), ordenado por `createdAt DESC`.',
        '',
        'Acceso exclusivo para **SUPERADMIN**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'actorId',
          schema: { type: 'string', format: 'uuid' },
          description: 'Filtrar por actor (usuario que ejecutó la acción)',
        },
        {
          in: 'query',
          name: 'action',
          schema: { type: 'string' },
          description: 'Filtrar por código de acción (ej: user.create)',
          example: 'user.create',
        },
        {
          in: 'query',
          name: 'targetType',
          schema: { type: 'string' },
          description: 'Filtrar por tipo de recurso afectado (ej: User, Role)',
          example: 'User',
        },
        {
          in: 'query',
          name: 'dateFrom',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de inicio del rango (ISO 8601)',
          example: '2024-01-01T00:00:00.000Z',
        },
        {
          in: 'query',
          name: 'dateTo',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de fin del rango (ISO 8601)',
          example: '2024-12-31T23:59:59.999Z',
        },
        {
          in: 'query',
          name: 'cursor',
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de paginación (id del último item de la página anterior)',
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Cantidad de items por página',
        },
      ],
      responses: {
        200: {
          description: 'Lista de audit logs',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['auditLogs', 'meta'],
                properties: {
                  auditLogs: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/AuditLogRecord' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
              example: {
                auditLogs: [
                  {
                    id: '550e8400-e29b-41d4-a716-446655440010',
                    actorId: '550e8400-e29b-41d4-a716-446655440001',
                    action: 'user.create',
                    targetType: 'User',
                    targetId: '550e8400-e29b-41d4-a716-446655440002',
                    metadata: { email: 'nuevo@vozciudadana.gob' },
                    ip: '192.168.1.1',
                    userAgent: 'Mozilla/5.0...',
                    createdAt: '2024-04-27T10:30:00.000Z',
                  },
                ],
                meta: { nextCursor: null, hasNextPage: false, count: 1 },
              },
            },
          },
        },
        400: {
          description: 'Filtros inválidos (actorId no UUID, fecha no ISO)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/system/inbox-events': {
    get: {
      tags: ['System'],
      summary: 'Listar inbox events',
      description: [
        'Retorna los eventos de webhook entrantes (inbox queue persistente).',
        'Útil para diagnosticar mensajes fallidos y monitorear la cola de procesamiento.',
        '',
        '**Filtros**: `status`, `phone`, `dateFrom`, `dateTo`, `retryCountGte`, `retryCountLte`.',
        '**Paginación**: cursor-based, ordenado por `createdAt DESC`.',
        '',
        'Acceso exclusivo para **SUPERADMIN**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['pending', 'processing', 'processed', 'failed', 'dead_lettered'],
          },
          description: 'Filtrar por estado del evento',
        },
        {
          in: 'query',
          name: 'phone',
          schema: { type: 'string' },
          description: 'Filtrar por número de teléfono del remitente',
          example: '5491123456789',
        },
        {
          in: 'query',
          name: 'dateFrom',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de inicio del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'dateTo',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de fin del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'retryCountGte',
          schema: { type: 'integer', minimum: 0 },
          description: 'Filtrar eventos con retryCount >= valor',
          example: 2,
        },
        {
          in: 'query',
          name: 'retryCountLte',
          schema: { type: 'integer', minimum: 0 },
          description: 'Filtrar eventos con retryCount <= valor',
          example: 5,
        },
        {
          in: 'query',
          name: 'cursor',
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de paginación',
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Cantidad de items por página',
        },
      ],
      responses: {
        200: {
          description: 'Lista de inbox events',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['inboxEvents', 'meta'],
                properties: {
                  inboxEvents: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/InboxEventRecord' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Filtros inválidos (status no permitido, retryCount no numérico)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/system/inbox-events/{id}/reprocess': {
    post: {
      tags: ['System'],
      summary: 'Reprocesar inbox event fallido',
      description: [
        'Resetea el `retryCount` y el estado del `InboxEvent` a `pending`,',
        'limpia el error registrado y re-encola el evento en la inbox queue.',
        '',
        '**Solo válido** para eventos en estado `failed` o `dead_lettered`.',
        'Devuelve 400 si el estado es cualquier otro.',
        '',
        '⚠️ Puede causar duplicados si el evento ya está siendo procesado.',
        'Verificar el estado antes de reprocesar.',
        '',
        'Acceso exclusivo para **SUPERADMIN**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del InboxEvent a reprocesar',
        },
      ],
      responses: {
        200: {
          description: 'Evento re-encolado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['inboxEvent'],
                properties: { inboxEvent: { $ref: '#/components/schemas/InboxEventRecord' } },
              },
              example: {
                inboxEvent: {
                  id: '550e8400-e29b-41d4-a716-446655440020',
                  wamid: 'wamid.HBgLNTQ5...AA',
                  phone: '+5491123456789',
                  status: 'pending',
                  retryCount: 0,
                  lastError: null,
                  lastErrorAt: null,
                  idempotencyKey: 'wamid.HBgLNTQ5...AA',
                  createdAt: '2024-04-27T10:00:00.000Z',
                  processedAt: null,
                },
              },
            },
          },
        },
        400: {
          description: "El evento no está en estado 'failed' o 'dead_lettered', o el id no es UUID",
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/system/outbox-events': {
    get: {
      tags: ['System'],
      summary: 'Listar outbox events',
      description: [
        'Retorna los eventos de la outbox queue (mensajes salientes a Meta API).',
        'Útil para diagnosticar envíos fallidos y monitorear el estado de entrega.',
        '',
        '**Filtros**: `status`, `phone`, `dateFrom`, `dateTo`, `retryCountGte`, `retryCountLte`.',
        '**Paginación**: cursor-based, ordenado por `createdAt DESC`.',
        '',
        'Acceso exclusivo para **SUPERADMIN**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'status',
          schema: {
            type: 'string',
            enum: ['pending', 'sending', 'sent', 'failed', 'dead_lettered'],
          },
          description: 'Filtrar por estado del evento',
        },
        {
          in: 'query',
          name: 'phone',
          schema: { type: 'string' },
          description: 'Filtrar por número de teléfono del destinatario',
          example: '5491187654321',
        },
        {
          in: 'query',
          name: 'dateFrom',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de inicio del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'dateTo',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fecha de fin del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'retryCountGte',
          schema: { type: 'integer', minimum: 0 },
          description: 'Filtrar eventos con retryCount >= valor',
        },
        {
          in: 'query',
          name: 'retryCountLte',
          schema: { type: 'integer', minimum: 0 },
          description: 'Filtrar eventos con retryCount <= valor',
        },
        {
          in: 'query',
          name: 'cursor',
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de paginación',
        },
        {
          in: 'query',
          name: 'limit',
          schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
          description: 'Cantidad de items por página',
        },
      ],
      responses: {
        200: {
          description: 'Lista de outbox events',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['outboxEvents', 'meta'],
                properties: {
                  outboxEvents: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/OutboxEventRecord' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Filtros inválidos (status no permitido, retryCount no numérico)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/system/outbox-events/{id}/retry': {
    post: {
      tags: ['System'],
      summary: 'Reintentar outbox event fallido',
      description: [
        'Resetea el `retryCount` y el estado del `OutboxEvent` a `pending`,',
        'limpia el error registrado y re-encola el evento en la outbox queue.',
        '',
        '**Solo válido** para eventos en estado `failed` o `dead_lettered`.',
        'Devuelve 400 si el estado es cualquier otro.',
        '',
        '⚠️ No comprueba idempotencia nuevamente — el evento ya existe en DB.',
        'Verificar el estado antes de reintentar.',
        '',
        'Acceso exclusivo para **SUPERADMIN**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del OutboxEvent a reintentar',
        },
      ],
      responses: {
        200: {
          description: 'Evento re-encolado exitosamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['outboxEvent'],
                properties: { outboxEvent: { $ref: '#/components/schemas/OutboxEventRecord' } },
              },
              example: {
                outboxEvent: {
                  id: '550e8400-e29b-41d4-a716-446655440030',
                  conversationId: '550e8400-e29b-41d4-a716-446655440003',
                  phone: '+5491187654321',
                  status: 'pending',
                  retryCount: 0,
                  nextRetryAt: null,
                  lastError: null,
                  wamid: null,
                  idempotencyKey: 'idem_outbox_001',
                  createdAt: '2024-04-27T10:00:00.000Z',
                  sentAt: null,
                },
              },
            },
          },
        },
        400: {
          description: "El evento no está en estado 'failed' o 'dead_lettered', o el id no es UUID",
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/messages/{id}/attachments': {
    post: {
      tags: ['Messages'],
      summary: 'Registrar attachment sobre un mensaje existente',
      description: [
        'Crea un registro de `Attachment` y lo vincula al mensaje indicado.',
        '',
        'El cliente es responsable de subir el archivo al storage (S3/GCS/local) y enviar',
        'los metadatos resultantes (`storageKey`, `mimeType`, `fileSizeBytes`).',
        '',
        '`fileSizeBytes` debe enviarse como **string numérico** para evitar pérdida de precisión',
        'con enteros grandes en JSON (BigInt).',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'path',
          name: 'id',
          required: true,
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del mensaje al que se vincula el attachment',
        },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/AddAttachmentRequest' },
          },
        },
      },
      responses: {
        201: {
          description: 'Attachment registrado correctamente',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['attachment'],
                properties: { attachment: { $ref: '#/components/schemas/AttachmentRecord' } },
              },
            },
          },
        },
        400: {
          description:
            'Payload inválido (storageKey ausente, fileSizeBytes no numérico, cdnUrl inválida)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Eventos ciudadanos ──────────────────────────────────────────────────────
  '/api/v1/admin/events': {
    get: {
      tags: ['Eventos'],
      summary: 'Listar eventos',
      description: 'Devuelve la lista paginada de eventos. Roles: SUPERADMIN, COORDINADOR.',
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          name: 'cursor',
          in: 'query',
          schema: { type: 'string', format: 'uuid' },
          description: 'Cursor de paginación',
        },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        { name: 'status', in: 'query', schema: { $ref: '#/components/schemas/EventStatus' } },
        { name: 'eventType', in: 'query', schema: { $ref: '#/components/schemas/EventType' } },
        {
          name: 'search',
          in: 'query',
          schema: { type: 'string' },
          description: 'Búsqueda en title/slug/description/locationName',
        },
        { name: 'organizerUserId', in: 'query', schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Lista de eventos',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  events: { type: 'array', items: { $ref: '#/components/schemas/EventRecord' } },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        400: {
          description: 'Parámetros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    post: {
      tags: ['Eventos'],
      summary: 'Crear evento',
      description: 'Crea un nuevo evento ciudadano. Roles: SUPERADMIN, COORDINADOR.',
      security: [{ bearerAuth: [] }],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/CreateEventRequest' } },
        },
      },
      responses: {
        201: {
          description: 'Evento creado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { event: { $ref: '#/components/schemas/EventRecord' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        409: {
          description: 'Slug duplicado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}': {
    get: {
      tags: ['Eventos'],
      summary: 'Obtener evento por ID',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      responses: {
        200: {
          description: 'Evento',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { event: { $ref: '#/components/schemas/EventRecord' } },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    patch: {
      tags: ['Eventos'],
      summary: 'Actualizar evento',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/UpdateEventRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Evento actualizado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: { event: { $ref: '#/components/schemas/EventRecord' } },
              },
            },
          },
        },
        400: {
          description: 'Datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'Slug duplicado',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}/invite': {
    post: {
      tags: ['Eventos'],
      summary: 'Enviar invitaciones masivas',
      description:
        'Invita a ciudadanos segmentados por tags y/o barrios. Crea registros como invited y encola mensajes WhatsApp.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/InviteEventRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Resultado del envío',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/InviteEventResponse' } },
          },
        },
        400: {
          description: 'Datos inválidos o evento cancelado/completado',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}/registrations': {
    post: {
      tags: ['Eventos — Asistencia'],
      summary: 'Registrar ciudadano en evento',
      description: 'Registra a un ciudadano. Si el evento está lleno, se crea en estado waitlist.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
      ],
      requestBody: {
        required: true,
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/RegisterEventRequest' } },
        },
      },
      responses: {
        201: {
          description: 'Registro creado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  registration: { $ref: '#/components/schemas/EventRegistrationRecord' },
                },
              },
            },
          },
        },
        400: {
          description: 'Evento cancelado/completado o datos inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        409: {
          description: 'El ciudadano ya tiene un registro activo',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
    get: {
      tags: ['Eventos — Asistencia'],
      summary: 'Listar registros de un evento',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        {
          name: 'registrationStatus',
          in: 'query',
          schema: { $ref: '#/components/schemas/RegistrationStatus' },
        },
        {
          name: 'attendanceStatus',
          in: 'query',
          schema: { $ref: '#/components/schemas/AttendanceStatus' },
        },
      ],
      responses: {
        200: {
          description: 'Lista de registros',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  registrations: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/EventRegistrationRecord' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}/registrations/{registrationId}/confirm': {
    patch: {
      tags: ['Eventos — Asistencia'],
      summary: 'Confirmar asistencia de un ciudadano',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'registrationId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      responses: {
        200: {
          description: 'Registro confirmado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  registration: { $ref: '#/components/schemas/EventRegistrationRecord' },
                },
              },
            },
          },
        },
        400: {
          description: 'Estado de registro inválido para confirmar',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}/registrations/{registrationId}/checkin': {
    post: {
      tags: ['Eventos — Asistencia'],
      summary: 'Check-in de un ciudadano',
      description:
        'Marca al ciudadano como asistente. Solo para registros en estado registered/confirmed.',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        {
          name: 'registrationId',
          in: 'path',
          required: true,
          schema: { type: 'string', format: 'uuid' },
        },
      ],
      requestBody: {
        content: {
          'application/json': { schema: { $ref: '#/components/schemas/CheckInEventRequest' } },
        },
      },
      responses: {
        200: {
          description: 'Check-in registrado',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  registration: { $ref: '#/components/schemas/EventRegistrationRecord' },
                },
              },
            },
          },
        },
        400: {
          description: 'Estado de registro inválido para check-in',
          content: {
            'application/json': { schema: { $ref: '#/components/schemas/ErrorResponse' } },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
  '/api/v1/admin/events/{id}/attendees': {
    get: {
      tags: ['Eventos — Asistencia'],
      summary: 'Listar asistentes (check-in realizado)',
      security: [{ bearerAuth: [] }],
      parameters: [
        { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        { name: 'cursor', in: 'query', schema: { type: 'string', format: 'uuid' } },
        { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
      ],
      responses: {
        200: {
          description: 'Asistentes del evento',
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  attendees: {
                    type: 'array',
                    items: { $ref: '#/components/schemas/EventRegistrationRecord' },
                  },
                  meta: { $ref: '#/components/schemas/CursorPaginationMeta' },
                },
              },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        404: { $ref: '#/components/responses/NotFound' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  // ── Analytics ────────────────────────────────────────────────────────────────

  '/api/v1/analytics/dashboard': {
    get: {
      tags: ['Analytics'],
      summary: 'Dashboard de métricas globales',
      description: [
        'Retorna KPIs, tiempos promedio, volumen diario, SLA y flujo bot/humano.',
        'Soporta filtros opcionales de fecha, departamento y agente.',
        'Respuesta cacheada in-process con TTL de 5 minutos.',
        '',
        'Roles requeridos: **SUPERADMIN**, **COORDINADOR** o **ANALISTA**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date-time' },
          description: 'Inicio del rango (ISO 8601)',
          example: '2026-05-01T00:00:00.000Z',
        },
        {
          in: 'query',
          name: 'to',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fin del rango (ISO 8601)',
          example: '2026-05-31T23:59:59.999Z',
        },
        {
          in: 'query',
          name: 'department',
          schema: { type: 'string' },
          description: 'Slug del departamento para filtrar',
          example: 'obras-publicas',
        },
        {
          in: 'query',
          name: 'agentId',
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del agente para filtrar',
        },
      ],
      responses: {
        200: {
          description: 'Métricas del dashboard',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyticsDashboardResponse' },
            },
          },
        },
        400: {
          description: 'Filtros inválidos (fecha no ISO, rango incoherente)',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/analytics/tickets': {
    get: {
      tags: ['Analytics'],
      summary: 'Métricas de tickets',
      description: [
        'KPIs, tiempos promedio, volumen diario y SLA de tickets.',
        'Respuesta cacheada in-process con TTL de 5 minutos.',
        '',
        'Roles requeridos: **SUPERADMIN**, **COORDINADOR** o **ANALISTA**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date-time' },
          description: 'Inicio del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'to',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fin del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'department',
          schema: { type: 'string' },
          description: 'Slug del departamento',
        },
        {
          in: 'query',
          name: 'agentId',
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del agente',
        },
      ],
      responses: {
        200: {
          description: 'Métricas de tickets',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyticsTicketsResponse' },
            },
          },
        },
        400: {
          description: 'Filtros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/analytics/agents': {
    get: {
      tags: ['Analytics'],
      summary: 'Métricas de performance por agente',
      description: [
        'Performance individual de agentes: tickets atendidos, tiempos promedio y cumplimiento SLA.',
        'Respuesta cacheada in-process con TTL de 5 minutos.',
        '',
        'Roles requeridos: **SUPERADMIN**, **COORDINADOR** o **ANALISTA**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date-time' },
          description: 'Inicio del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'to',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fin del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'department',
          schema: { type: 'string' },
          description: 'Slug del departamento',
        },
        {
          in: 'query',
          name: 'agentId',
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del agente (para filtrar un agente específico)',
        },
      ],
      responses: {
        200: {
          description: 'Métricas de agentes',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyticsAgentsResponse' },
            },
          },
        },
        400: {
          description: 'Filtros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },

  '/api/v1/analytics/departments': {
    get: {
      tags: ['Analytics'],
      summary: 'Distribución de tickets por departamento',
      description: [
        'Conteo de tickets por departamento, ordenado por volumen descendente.',
        'Respuesta cacheada in-process con TTL de 5 minutos.',
        '',
        'Roles requeridos: **SUPERADMIN**, **COORDINADOR** o **ANALISTA**.',
      ].join('\n'),
      security: [{ bearerAuth: [] }],
      parameters: [
        {
          in: 'query',
          name: 'from',
          schema: { type: 'string', format: 'date-time' },
          description: 'Inicio del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'to',
          schema: { type: 'string', format: 'date-time' },
          description: 'Fin del rango (ISO 8601)',
        },
        {
          in: 'query',
          name: 'department',
          schema: { type: 'string' },
          description: 'Slug del departamento (para filtrar uno específico)',
        },
        {
          in: 'query',
          name: 'agentId',
          schema: { type: 'string', format: 'uuid' },
          description: 'ID del agente',
        },
      ],
      responses: {
        200: {
          description: 'Distribución por departamento',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/AnalyticsDepartmentsResponse' },
            },
          },
        },
        400: {
          description: 'Filtros inválidos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/ValidationErrorResponse' },
            },
          },
        },
        401: { $ref: '#/components/responses/Unauthorized' },
        403: { $ref: '#/components/responses/Forbidden' },
        500: { $ref: '#/components/responses/InternalError' },
      },
    },
  },
};

// ─── Spec completa ────────────────────────────────────────────────────────────

export const createSwaggerSpec = ({ port, base_url }: SwaggerSpecParams): OpenAPIDocument => ({
  openapi: '3.0.0',
  info: {
    title: 'Nexo Comercial API',
    version: '0.1.0',
    description: [
      'API del backend de **Nexo Comercial**.',
      '',
      '## Módulos',
      '- **Auth**: Autenticación JWT con refresh token rotado, multi-sesión por dispositivo, rate limiting y lockout progresivo.',
      '- **Admin**: Panel — usuarios, barrios, etiquetas, departamentos y eventos ciudadanos. Listados de lectura suelen permitir **SUPERADMIN** y **COORDINADOR**; creación/edición sensible suele restringirse a **SUPERADMIN** (ver cada operación).',
      '- **Citizens**: CRM de ciudadanos — listado, perfil, etiquetas y operaciones masivas (lectura: SUPERADMIN/COORDINADOR; alta/edición/eliminación: según operación).',
      '- **Webhook**: Webhook de WhatsApp Cloud API para recepción de mensajes entrantes.',
      '- **Messages**: Envío de mensajes salientes a ciudadanos vía WhatsApp y gestión de attachments.',
      '- **Conversations**: Listado, detalle, mensajes (GET/POST) y acciones (assign, transfer, close, reopen).',
      '- **Handover**: Transferencia de conversaciones bot↔agente y escalado.',
      '- **Eventos**: Eventos ciudadanos e invitaciones (roles según cada endpoint).',
      '- **System**: Observabilidad operacional — audit logs, inbox/outbox events (solo SUPERADMIN). Incluye retry/reprocess para eventos fallidos.',
      '- **Health**: Health check para monitoreo y load balancers.',
      '',
      '## Autenticación',
      'Usar el botón **Authorize** con el access token obtenido en `POST /api/v1/auth/login`.',
      'Formato: `Bearer <accessToken>`',
    ].join('\n'),
    contact: { name: 'Equipo Nexo Comercial' },
    license: { name: 'Privado' },
  },
  servers: [
    { url: `${base_url}:${port}`, description: 'Desarrollo local' },
    { url: base_url, description: 'Producción' },
  ],
  tags: [
    { name: 'Auth', description: 'Autenticación y gestión de sesiones del panel admin' },
    {
      name: 'Admin',
      description:
        'Panel administrativo — usuarios, catálogos (barrios, etiquetas, departamentos) y eventos. RBAC: lecturas compartidas con COORDINADOR donde aplica; mutaciones críticas suelen ser solo SUPERADMIN.',
    },
    {
      name: 'Citizens',
      description:
        'CRM de ciudadanos — listado con filtros, perfil extendido, asignación de etiquetas y operaciones masivas',
    },
    { name: 'Webhook', description: 'Webhook de WhatsApp Cloud API (Meta)' },
    { name: 'Messages', description: 'Envío de mensajes salientes a ciudadanos vía WhatsApp' },
    { name: 'Handover', description: 'Gestión de transferencia bot↔agente de conversaciones' },
    { name: 'Conversations', description: 'Operaciones y acciones sobre conversaciones' },
    {
      name: 'Eventos',
      description: 'Eventos ciudadanos — CRUD, invitaciones y listados operativos',
    },
    {
      name: 'Eventos — Asistencia',
      description: 'Registros, confirmación, check-in y asistentes de eventos',
    },
    {
      name: 'System',
      description: 'Observabilidad operacional — audit logs, inbox/outbox events (solo SUPERADMIN)',
    },
    {
      name: 'Analytics',
      description: 'Métricas operacionales — KPIs, tiempos, SLA, volumen y flujo bot/humano',
    },
    { name: 'Health', description: 'Estado de la aplicación' },
    {
      name: 'Diagnóstico de correo',
      description: 'Endpoints técnicos para validar Mailtrap; no habilitar en producción.',
    },
    {
      name: 'Public — Newsletter',
      description: 'Suscripción al boletín desde el sitio público (sin JWT)',
    },
    {
      name: 'Public — Eventos',
      description: 'Listado semanal de eventos y RSVP desde el sitio público (sin JWT)',
    },
  ],
  components: {
    schemas,
    responses,
    securitySchemes,
  },
  paths,
});
