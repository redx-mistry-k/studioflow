// Kysely database types. Column names are camelCase in TS and mapped to
// snake_case in SQL by CamelCasePlugin. JSON columns are TEXT in the DB and
// parsed/stringified at the mapper layer (see map.ts).
// Columns with SQL DEFAULTs are marked Generated<> (optional on insert).

import type { Generated } from "kysely";

export interface UsersTable {
  id: string;
  email: string;
  passwordHash: string;
  name: string;
  role: Generated<string>;
  active: Generated<boolean | number>;
  createdAt: string;
  updatedAt: string;
}

export interface CustomersTable {
  id: string;
  firstName: string;
  lastName: Generated<string>;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  instagramHandle: string | null;
  instagramId: string | null;
  source: Generated<string>;
  status: Generated<string>;
  dateOfBirth: string | null;
  address: string | null;
  notes: string | null;
  tags: Generated<string>;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationsTable {
  id: string;
  customerId: string;
  channel: string;
  status: Generated<string>;
  subject: string | null;
  assignedToId: string | null;
  externalId: string | null;
  lastMessageAt: string;
  unreadCount: Generated<number>;
  tags: Generated<string>;
  createdAt: string;
  updatedAt: string;
}

export interface MessagesTable {
  id: string;
  conversationId: string;
  direction: string;
  channel: string;
  senderType: Generated<string>;
  senderName: string | null;
  body: string;
  mediaUrl: string | null;
  isNote: Generated<boolean | number>;
  externalId: string | null;
  status: string | null;
  createdAt: string;
}

export interface EnquiriesTable {
  id: string;
  customerId: string | null;
  conversationId: string | null;
  name: string;
  phone: string | null;
  email: string | null;
  workshopId: string | null;
  preferredDate: string | null;
  participants: Generated<number>;
  message: string | null;
  source: Generated<string>;
  status: Generated<string>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkshopsTable {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMins: Generated<number>;
  defaultPrice: Generated<number>;
  defaultCapacity: Generated<number>;
  instructor: string | null;
  location: string | null;
  color: Generated<string>;
  active: Generated<boolean | number>;
  createdAt: string;
  updatedAt: string;
}

export interface SessionsTable {
  id: string;
  workshopId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  instructor: string | null;
  location: string | null;
  capacity: Generated<number>;
  price: Generated<number>;
  status: Generated<string>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BookingsTable {
  id: string;
  bookingCode: string;
  customerId: string;
  sessionId: string;
  participants: Generated<number>;
  pricePerPerson: number;
  discount: Generated<number>;
  totalAmount: Generated<number>;
  amountPaid: Generated<number>;
  paymentStatus: Generated<string>;
  status: Generated<string>;
  source: Generated<string>;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentsTable {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  method: Generated<string>;
  reference: string | null;
  status: Generated<string>;
  receivedAt: string;
  notes: string | null;
  createdById: string | null;
  createdAt: string;
}

export interface FollowUpsTable {
  id: string;
  customerId: string;
  bookingId: string | null;
  conversationId: string | null;
  reason: string;
  channel: Generated<string>;
  dueAt: string;
  status: Generated<string>;
  assignedToId: string | null;
  notes: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MessageTemplatesTable {
  id: string;
  name: string;
  category: Generated<string>;
  channel: Generated<string>;
  subject: string | null;
  body: string;
  variables: Generated<string>;
  active: Generated<boolean | number>;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationRulesTable {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: Generated<string>;
  delayMinutes: Generated<number>;
  action: string;
  actionConfig: Generated<string>;
  templateId: string | null;
  enabled: Generated<boolean | number>;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AutomationExecutionsTable {
  id: string;
  ruleId: string;
  triggerEntity: string;
  triggerEntityId: string;
  status: Generated<string>;
  runAt: string;
  details: string | null;
  error: string | null;
  createdAt: string;
}

export interface NotificationsTable {
  id: string;
  userId: string | null;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  read: Generated<boolean | number>;
  createdAt: string;
}

export interface AuditLogsTable {
  id: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
}

export interface BusinessSettingsTable {
  id: string;
  businessName: Generated<string>;
  logoUrl: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  timezone: Generated<string>;
  currency: Generated<string>;
  autoConfirmBookings: Generated<boolean | number>;
  smtpHost: string | null;
  smtpPort: Generated<number>;
  smtpUser: string | null;
  smtpPass: string | null;
  smtpFromEmail: string | null;
  smtpFromName: string | null;
  smtpEnabled: Generated<boolean | number>;
  whatsappPhoneNumberId: string | null;
  whatsappBusinessAccountId: string | null;
  whatsappAccessToken: string | null;
  whatsappVerifyToken: string | null;
  whatsappEnabled: Generated<boolean | number>;
  instagramPageAccessToken: string | null;
  instagramVerifyToken: string | null;
  instagramEnabled: Generated<boolean | number>;
  n8nWebhookUrl: string | null;
  notificationsEnabled: Generated<boolean | number>;
  updatedAt: string;
}

export interface MigrationsTable {
  name: string;
  appliedAt: string;
}

export interface Database {
  users: UsersTable;
  customers: CustomersTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  enquiries: EnquiriesTable;
  workshops: WorkshopsTable;
  sessions: SessionsTable;
  bookings: BookingsTable;
  payments: PaymentsTable;
  followUps: FollowUpsTable;
  messageTemplates: MessageTemplatesTable;
  automationRules: AutomationRulesTable;
  automationExecutions: AutomationExecutionsTable;
  notifications: NotificationsTable;
  auditLogs: AuditLogsTable;
  businessSettings: BusinessSettingsTable;
  migrations: MigrationsTable;
}
