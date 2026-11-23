# Mapa de modulos backend

Referencia operativa de los modulos montados en /api/v1.

## Wiring central

El registro de modulos ocurre en backend/src/routes/index.ts.

## Modulos y responsabilidades

| Modulo               | Base URL                    | Router                                     | Controller o entrypoint | Servicios asociados                                                          |
| -------------------- | --------------------------- | ------------------------------------------ | ----------------------- | ---------------------------------------------------------------------------- |
| Webhook WhatsApp     | /api/v1/webhook             | backend/src/routes/webhook.routes.ts       | WebhookController       | InboxProcessorService, WebhookParserService, MessageRepository |
| Auth panel           | /api/v1/auth                | backend/src/routes/auth.routes.ts          | AuthController          | AuthService, LockoutService, AuditService                                    |
| Admin users          | /api/v1/admin/users         | backend/src/routes/users.routes.ts         | UsersController         | UserService, AuditService                                                    |
| Admin neighborhoods  | /api/v1/admin/neighborhoods | backend/src/routes/neighborhoods.routes.ts | NeighborhoodsController | NeighborhoodsService, AuditService                                           |
| Admin tags           | /api/v1/admin/tags          | backend/src/routes/tags.routes.ts          | TagsController          | TagsService, AuditService                                                    |
| Admin departments    | /api/v1/admin/departments   | backend/src/routes/departments.routes.ts   | DepartmentsController   | DepartmentsService, AuditService                                             |
| Admin events         | /api/v1/admin/events        | backend/src/routes/events.routes.ts        | EventsController        | EventService, AttendanceService, AuditService                                |
| Citizens             | /api/v1/citizens            | backend/src/routes/citizens.routes.ts      | CitizensController      | CitizensService, AuditService                                                |
| Conversations        | /api/v1/conversations       | backend/src/routes/conversations.routes.ts | ConversationsController | ConversationsService, MessageService, AuditService                           |
| Messages             | /api/v1/messages            | backend/src/routes/messages.routes.ts      | MessagesController      | MessageService, OutboxProcessorService                                       |
| Handover             | /api/v1/handover            | backend/src/routes/handover.routes.ts      | HandoverController      | ConversationStateMachine, ConversationRepository                             |
| System observability | /api/v1/system              | backend/src/routes/system.routes.ts        | SystemController        | SystemService                                                                |

## Endpoints clave por modulo

### Webhook WhatsApp

- GET /
- POST /

### Auth panel

- POST /login
- POST /refresh
- GET /me
- POST /logout
- POST /register

### Admin users

- GET /users
- GET /users/:id
- POST /users
- PATCH /users/:id
- POST /users/:id/roles/:roleId
- DELETE /users/:id/roles/:roleId
- GET /config

### Admin neighborhoods

- GET /neighborhoods
- POST /neighborhoods
- PATCH /neighborhoods/:id
- DELETE /neighborhoods/:id

### Admin tags

- GET /tags
- POST /tags
- PATCH /tags/:id
- DELETE /tags/:id

### Admin departments

- GET /departments
- GET /departments/:slug/availability
- POST /departments
- PATCH /departments/:id
- DELETE /departments/:id

### Admin events

- GET /events
- POST /events
- GET /events/:id
- PATCH /events/:id
- POST /events/:id/invite
- POST /events/:id/registrations
- GET /events/:id/registrations
- PATCH /events/:id/registrations/:registrationId/confirm
- POST /events/:id/registrations/:registrationId/checkin
- GET /events/:id/attendees

### Citizens

- GET /citizens
- POST /citizens
- GET /citizens/:id
- PATCH /citizens/:id
- DELETE /citizens/:id
- POST /citizens/:id/tags/:tagId
- DELETE /citizens/:id/tags/:tagId
- GET /citizens/:id/profile

### Conversations

- GET /
- GET /:id
- GET /:id/messages
- POST /:id/messages
- POST /:id/assign
- POST /:id/transfer
- POST /:id/handover
- POST /:id/close
- POST /:id/reopen

### Messages

- POST /text
- POST /:id/attachments

### Handover

- POST /take
- POST /release
- POST /escalate

### System observability

- GET /audit-logs
- GET /inbox-events
- GET /outbox-events
- POST /outbox-events/:id/retry
- POST /inbox-events/:id/reprocess

## Notas

- Todos los paths de esta guia son relativos al prefijo /api/v1, excepto /health y /.
- Autenticacion:
  - authMiddleware y RBAC en modulos administrativos.
  - jwtMiddleware en conversations/messages/handover.
