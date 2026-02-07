export interface OwnerRow {
  owner_telegram_id: string;
  claimed_at: string;
}

export interface ClaimCodeRow {
  id: number;
  code_hash: string;
  consumed_at: string | null;
  consumed_by_telegram_id: string | null;
}

export interface AuditLogEvent {
  actorTelegramId: string | null;
  eventType: string;
  metadata: Record<string, unknown>;
}
