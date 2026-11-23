/**
 * Mock de @prisma/client para tests unitarios.
 * Exporta las enums reales y stubs de los tipos generados.
 */

export enum LeadStatus {
  new = 'new',
  contacted = 'contacted',
  converted = 'converted',
  lost = 'lost',
}

export enum SourceChannel {
  whatsapp = 'whatsapp',
  web = 'web',
  phone = 'phone',
}

export enum MessageDirection {
  inbound = 'inbound',
  outbound = 'outbound',
}

export enum MessageType {
  text = 'text',
  image = 'image',
  audio = 'audio',
  video = 'video',
  document = 'document',
  location = 'location',
  template = 'template',
  interactive = 'interactive',
  sticker = 'sticker',
  contacts = 'contacts',
  unsupported = 'unsupported',
  system = 'system',
}

export enum MessageStatusValue {
  sent = 'sent',
  delivered = 'delivered',
  read = 'read',
  failed = 'failed',
}

export enum ConversationStatus {
  open = 'open',
  in_progress = 'in_progress',
  resolved = 'resolved',
  closed = 'closed',
}

export enum AttendanceMode {
  bot = 'bot',
  human = 'human',
}

export enum ConversationChannel {
  whatsapp = 'whatsapp',
  web_chat = 'web_chat',
  email = 'email',
  sms = 'sms',
  other = 'other',
}

export const Prisma = {
  ConversationGetPayload: {},
  Decimal: class Decimal {
    constructor(public val: string | number) {}
    toString(): string {
      return String(this.val);
    }
  },
  sql: (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): { strings: TemplateStringsArray; values: unknown[] } => ({
    strings,
    values,
  }),
  join: (values: unknown[]): string => values.join(','),
};

export enum EventStatus {
  draft = 'draft',
  published = 'published',
  completed = 'completed',
  cancelled = 'cancelled',
}

export enum EventType {
  townhall = 'townhall',
  community = 'community',
  volunteer = 'volunteer',
  campaign = 'campaign',
  rally = 'rally',
}

export enum EventVisibility {
  public = 'public',
  private = 'private',
}

export enum RegistrationStatus {
  invited = 'invited',
  registered = 'registered',
  confirmed = 'confirmed',
  cancelled = 'cancelled',
  waitlist = 'waitlist',
}

export enum AttendanceStatus {
  pending = 'pending',
  attended = 'attended',
  no_show = 'no_show',
}

export enum TicketStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED',
  CLOSED = 'CLOSED',
}

export enum TicketPriority {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export enum TicketSource {
  WHATSAPP = 'WHATSAPP',
  WEB = 'WEB',
  OTHER = 'OTHER',
}

export enum TicketActorType {
  CITIZEN = 'CITIZEN',
  AGENT = 'AGENT',
  BOT = 'BOT',
  SYSTEM = 'SYSTEM',
}

export enum RealtimeOutboxStatus {
  pending = 'pending',
  publishing = 'publishing',
  published = 'published',
  failed = 'failed',
  dead_lettered = 'dead_lettered',
}
