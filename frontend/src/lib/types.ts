export interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  whatsappNumber: string | null;
  email: string | null;
  instagramHandle: string | null;
  instagramId: string | null;
  source: string;
  status: string;
  dateOfBirth: string | null;
  address: string | null;
  notes: string | null;
  tags: string[];
  createdAt: string;
  updatedAt: string;
  bookingsCount?: number;
  conversationsCount?: number;
  totalSpend?: number;
}

export interface Conversation {
  id: string;
  customerId: string;
  channel: string;
  status: string;
  subject: string | null;
  assignedToId: string | null;
  lastMessageAt: string;
  unreadCount: number;
  tags: string[];
  createdAt: string;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null };
  assignedTo?: { id: string; name: string } | null;
  messages?: Message[];
}

export interface Message {
  id: string;
  conversationId: string;
  direction: string;
  channel: string;
  senderType: string;
  senderName: string | null;
  body: string;
  isNote: boolean;
  status: string | null;
  createdAt: string;
}

export interface Workshop {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  durationMins: number;
  defaultPrice: number;
  defaultCapacity: number;
  instructor: string | null;
  location: string | null;
  color: string;
  active: boolean;
  sessionsCount?: number;
}

export interface Session {
  id: string;
  workshopId: string;
  title: string | null;
  startsAt: string;
  endsAt: string;
  instructor: string | null;
  location: string | null;
  capacity: number;
  price: number;
  status: string;
  notes: string | null;
  workshop?: Workshop | null;
  booked?: number;
  available?: number;
  computedStatus?: string;
}

export interface Booking {
  id: string;
  bookingCode: string;
  customerId: string;
  sessionId: string;
  participants: number;
  pricePerPerson: number;
  discount: number;
  totalAmount: number;
  amountPaid: number;
  paymentStatus: string;
  status: string;
  source: string;
  notes: string | null;
  createdAt: string;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null };
  session?: (Session & { workshop?: { id: string; name: string } | null }) | null;
}

export interface Payment {
  id: string;
  bookingId: string;
  customerId: string;
  amount: number;
  method: string;
  reference: string | null;
  status: string;
  receivedAt: string;
  notes: string | null;
}

export interface FollowUp {
  id: string;
  customerId: string;
  bookingId: string | null;
  conversationId: string | null;
  reason: string;
  channel: string;
  dueAt: string;
  status: string;
  assignedToId: string | null;
  notes: string | null;
  completedAt: string | null;
  customer?: { id: string; firstName: string; lastName: string; phone?: string | null } | null;
  booking?: { id: string; bookingCode: string } | null;
  assignedTo?: { id: string; name: string } | null;
}

export interface AutomationRule {
  id: string;
  name: string;
  description: string | null;
  trigger: string;
  conditions: Record<string, unknown>;
  delayMinutes: number;
  action: string;
  actionConfig: Record<string, unknown>;
  templateId: string | null;
  enabled: boolean;
  lastRunAt: string | null;
  template?: { id: string; name: string } | null;
  executionsCount?: number;
}

export interface MessageTemplate {
  id: string;
  name: string;
  category: string;
  channel: string;
  subject: string | null;
  body: string;
  variables: string[];
  active: boolean;
}

export interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  read: boolean;
  createdAt: string;
}

export interface StaffUser {
  id: string;
  email: string;
  name: string;
  role: string;
  active: boolean;
  createdAt: string;
}
