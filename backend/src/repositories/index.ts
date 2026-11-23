/**
 * Canonical repository exports.
 */
export { AdminAiRepository } from './admin-ai.repository';
export { AnalyticsRepository } from './analytics.repository';
export { AuthorizationRepository } from './authorization.repository';
export { AttendanceRepository } from './attendance.repository';
export type { RegistrationRecord } from './attendance.repository';
export { AuditRepository } from './audit.repository';
export { CitizenRepository } from './citizen.repository';
export type {
  CitizenProfileRecord,
  CitizenRecord,
  CitizenTagWithTag,
  LastConversationRecord,
  ParticipationRecord,
} from './citizen.repository';
export { ConversationRepository } from './conversation.repository';
export type { ConversationContext } from './conversation.repository';
export { DepartmentRepository } from './department.repository';
export type { DepartmentRecord, DepartmentTx } from './department.repository';
export { EventRepository } from './event.repository';
export type { EventRecord, PublicEventRow } from './event.repository';
export { MessageRepository } from './message.repository';
export type { CreateMessageInput, MessageWithStatuses } from './message.repository';
export { NeighborhoodRepository } from './neighborhood.repository';
export type { NeighborhoodRecord } from './neighborhood.repository';
export { NewsletterRepository } from './newsletter.repository';
export { OutboxMessageRepository } from './outbox-message.repository';
export { SystemRepository } from './system.repository';
export { TagRepository } from './tag.repository';
export type { TagRecord } from './tag.repository';
export { TaggingRepository } from './tagging.repository';
export { TicketRepository } from './ticket.repository';
export { UserNotificationPreferencesRepository } from './user-notification-preferences.repository';
export { UserRepository } from './user.repository';
export type {
  CreateUserWithRolesInput,
  UpdateUserFieldsInput,
  UserWithRoles,
} from './user.repository';
