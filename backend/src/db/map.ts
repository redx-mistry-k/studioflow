// Row mappers: normalize raw DB rows (which differ slightly between
// postgres and sqlite drivers) into clean API entities.
import { ts, tsNull, toBool, jparse, num } from "./index";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type R = Record<string, any>;

export const mapUser = (r: R) => ({
  id: String(r.id),
  email: r.email,
  name: r.name,
  role: r.role,
  active: toBool(r.active),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapCustomer = (r: R) => ({
  id: String(r.id),
  firstName: r.firstName,
  lastName: r.lastName ?? "",
  phone: r.phone ?? null,
  whatsappNumber: r.whatsappNumber ?? null,
  email: r.email ?? null,
  instagramHandle: r.instagramHandle ?? null,
  instagramId: r.instagramId ?? null,
  source: r.source,
  status: r.status,
  dateOfBirth: tsNull(r.dateOfBirth),
  address: r.address ?? null,
  notes: r.notes ?? null,
  tags: jparse<string[]>(r.tags, []),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapConversation = (r: R) => ({
  id: String(r.id),
  customerId: r.customerId,
  channel: r.channel,
  status: r.status,
  subject: r.subject ?? null,
  assignedToId: r.assignedToId ?? null,
  externalId: r.externalId ?? null,
  lastMessageAt: ts(r.lastMessageAt),
  unreadCount: num(r.unreadCount),
  tags: jparse<string[]>(r.tags, []),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapMessage = (r: R) => ({
  id: String(r.id),
  conversationId: r.conversationId,
  direction: r.direction,
  channel: r.channel,
  senderType: r.senderType,
  senderName: r.senderName ?? null,
  body: r.body,
  mediaUrl: r.mediaUrl ?? null,
  isNote: toBool(r.isNote),
  externalId: r.externalId ?? null,
  status: r.status ?? null,
  createdAt: ts(r.createdAt),
});

export const mapEnquiry = (r: R) => ({
  id: String(r.id),
  customerId: r.customerId ?? null,
  conversationId: r.conversationId ?? null,
  name: r.name,
  phone: r.phone ?? null,
  email: r.email ?? null,
  workshopId: r.workshopId ?? null,
  preferredDate: tsNull(r.preferredDate),
  participants: num(r.participants, 1),
  message: r.message ?? null,
  source: r.source,
  status: r.status,
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapWorkshop = (r: R) => ({
  id: String(r.id),
  name: r.name,
  description: r.description ?? null,
  category: r.category ?? null,
  durationMins: num(r.durationMins, 120),
  defaultPrice: num(r.defaultPrice),
  defaultCapacity: num(r.defaultCapacity, 20),
  instructor: r.instructor ?? null,
  location: r.location ?? null,
  color: r.color ?? "#7c3aed",
  active: toBool(r.active),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapSession = (r: R) => ({
  id: String(r.id),
  workshopId: r.workshopId,
  title: r.title ?? null,
  startsAt: ts(r.startsAt),
  endsAt: ts(r.endsAt),
  instructor: r.instructor ?? null,
  location: r.location ?? null,
  capacity: num(r.capacity, 20),
  price: num(r.price),
  status: r.status,
  notes: r.notes ?? null,
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapBooking = (r: R) => ({
  id: String(r.id),
  bookingCode: r.bookingCode,
  customerId: r.customerId,
  sessionId: r.sessionId,
  participants: num(r.participants, 1),
  pricePerPerson: num(r.pricePerPerson),
  discount: num(r.discount),
  totalAmount: num(r.totalAmount),
  amountPaid: num(r.amountPaid),
  paymentStatus: r.paymentStatus,
  status: r.status,
  source: r.source,
  notes: r.notes ?? null,
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapPayment = (r: R) => ({
  id: String(r.id),
  bookingId: r.bookingId,
  customerId: r.customerId,
  amount: num(r.amount),
  method: r.method,
  reference: r.reference ?? null,
  status: r.status,
  receivedAt: ts(r.receivedAt),
  notes: r.notes ?? null,
  createdById: r.createdById ?? null,
  createdAt: ts(r.createdAt),
});

export const mapFollowUp = (r: R) => ({
  id: String(r.id),
  customerId: r.customerId,
  bookingId: r.bookingId ?? null,
  conversationId: r.conversationId ?? null,
  reason: r.reason,
  channel: r.channel,
  dueAt: ts(r.dueAt),
  status: r.status,
  assignedToId: r.assignedToId ?? null,
  notes: r.notes ?? null,
  completedAt: tsNull(r.completedAt),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapTemplate = (r: R) => ({
  id: String(r.id),
  name: r.name,
  category: r.category,
  channel: r.channel,
  subject: r.subject ?? null,
  body: r.body,
  variables: jparse<string[]>(r.variables, []),
  active: toBool(r.active),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapRule = (r: R) => ({
  id: String(r.id),
  name: r.name,
  description: r.description ?? null,
  trigger: r.trigger,
  conditions: jparse<Record<string, unknown>>(r.conditions, {}),
  delayMinutes: num(r.delayMinutes),
  action: r.action,
  actionConfig: jparse<Record<string, unknown>>(r.actionConfig, {}),
  templateId: r.templateId ?? null,
  enabled: toBool(r.enabled),
  lastRunAt: tsNull(r.lastRunAt),
  createdAt: ts(r.createdAt),
  updatedAt: ts(r.updatedAt),
});

export const mapExecution = (r: R) => ({
  id: String(r.id),
  ruleId: r.ruleId,
  triggerEntity: r.triggerEntity,
  triggerEntityId: r.triggerEntityId,
  status: r.status,
  runAt: ts(r.runAt),
  details: r.details ? jparse<Record<string, unknown>>(r.details, {}) : null,
  error: r.error ?? null,
  createdAt: ts(r.createdAt),
});

export const mapNotification = (r: R) => ({
  id: String(r.id),
  userId: r.userId ?? null,
  type: r.type,
  title: r.title,
  body: r.body ?? null,
  entityType: r.entityType ?? null,
  entityId: r.entityId ?? null,
  read: toBool(r.read),
  createdAt: ts(r.createdAt),
});

export const mapAudit = (r: R) => ({
  id: String(r.id),
  userId: r.userId ?? null,
  action: r.action,
  entityType: r.entityType,
  entityId: r.entityId ?? null,
  oldValue: r.oldValue ? jparse(r.oldValue, null) : null,
  newValue: r.newValue ? jparse(r.newValue, null) : null,
  createdAt: ts(r.createdAt),
});

export const mapSettings = (r: R) => ({
  id: String(r.id),
  businessName: r.businessName,
  logoUrl: r.logoUrl ?? null,
  phone: r.phone ?? null,
  email: r.email ?? null,
  address: r.address ?? null,
  timezone: r.timezone,
  currency: r.currency,
  autoConfirmBookings: toBool(r.autoConfirmBookings),
  smtpHost: r.smtpHost ?? null,
  smtpPort: num(r.smtpPort, 587),
  smtpUser: r.smtpUser ?? null,
  smtpPass: r.smtpPass ?? null,
  smtpFromEmail: r.smtpFromEmail ?? null,
  smtpFromName: r.smtpFromName ?? null,
  smtpEnabled: toBool(r.smtpEnabled),
  whatsappPhoneNumberId: r.whatsappPhoneNumberId ?? null,
  whatsappBusinessAccountId: r.whatsappBusinessAccountId ?? null,
  whatsappAccessToken: r.whatsappAccessToken ?? null,
  whatsappVerifyToken: r.whatsappVerifyToken ?? null,
  whatsappEnabled: toBool(r.whatsappEnabled),
  instagramPageAccessToken: r.instagramPageAccessToken ?? null,
  instagramVerifyToken: r.instagramVerifyToken ?? null,
  instagramEnabled: toBool(r.instagramEnabled),
  n8nWebhookUrl: r.n8nWebhookUrl ?? null,
  notificationsEnabled: toBool(r.notificationsEnabled ?? true),
  updatedAt: ts(r.updatedAt),
});
