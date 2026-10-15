// Reject recognizable credentials before any content is persisted or logged.
// This cannot detect an arbitrary unlabelled password; the UI also warns users.
export function containsSecret(value: string): boolean {
  return /(?:bearer\s+[a-z0-9._-]{8,}|eyJ[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}\.[a-z0-9_-]{8,}|sb_(?:secret|publishable)_[a-z0-9_-]{8,}|\b\d{7,}:[a-z0-9_-]{25,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b[0-9a-f]{64}\b|\b[0-9a-f]{8}(?:-[0-9a-f]{8}){5}\b|(?:парол[ььяею]|password|токен|token|api[_ -]?key|секрет|secret|резервный\s+код|код\s+восстановления)\s*(?:[:=]\s*|[«"'])(?!\[скрыто\])\S{3,}|https?:\/\/\S*[#?](?:\S*&)?(?:access_token|refresh_token|token|code)=)/iu.test(value);
}

export const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
