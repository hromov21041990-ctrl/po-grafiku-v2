import { createClient } from 'npm:@supabase/supabase-js@2.95.0';
import { containsSecret, uuid } from './privacy.ts';

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const key = 'sb_publishable_eIWwXJEBGxYAbnhOc-MKfw_NitfQtB_';
const db = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const origins = new Set(['https://po-grafiku.ru', 'https://hromov21041990-ctrl.github.io', 'https://grafik.hromov-aa.chatgpt.site']);
const ticketFields = 'id,company_id,company_code,category,title,message,contact_email,sender_role,status,created_at,updated_at,support_version,last_user_at,last_admin_at,admin_seen_at,user_seen_at';
const eventFields = 'id,ticket_id,kind,sender,body,status,created_at';
const hex = (v: Uint8Array) => Array.from(v, x => x.toString(16).padStart(2, '0')).join('');
const digest = async (v: string) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(v))));
class Failure extends Error { constructor(public status: number, message: string) { super(message); } }
const fail = (status: number, message: string): never => { throw new Failure(status, message); };
function check(error: any) { if (error) fail(503, 'Поддержка временно недоступна. Повторите позже.'); }
function reply(origin: string, status: number, value: unknown) {
  return new Response(JSON.stringify(value), { status, headers: {
    'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store',
    'access-control-allow-origin': origins.has(origin) ? origin : 'https://po-grafiku.ru',
    'access-control-allow-headers': 'authorization,apikey,content-type',
    'access-control-allow-methods': 'POST,OPTIONS', 'vary': 'Origin',
  } });
}
// Telegram remains a parallel notification channel; the ticket database is the source of truth.
// A failed Telegram request must never undo a successfully created support ticket.
async function notifyTelegramForNewTicket(ticketId: string, ticket: {
  company_code: string; category: string; title: string; message: string; sender_role: string
}) {
  const botToken = Deno.env.get('TELEGRAM_BOT_TOKEN') || Deno.env.get('SUPPORT_TELEGRAM_BOT_TOKEN') || '';
  const chatId = Deno.env.get('TELEGRAM_CHAT_ID') || Deno.env.get('SUPPORT_TELEGRAM_CHAT_ID') || '';
  let sent = false;
  let errorCode: string | null = null;
  if (!botToken || !chatId) {
    errorCode = 'telegram_secrets_missing';
  } else {
    const label: Record<string, string> = { bug: 'Ошибка', question: 'Вопрос', idea: 'Предложение', access: 'Вход и доступ' };
    const text = [
      '🆕 Новое обращение «По графику»',
      'Номер: ' + ticketId.slice(0, 8),
      'Точка: ' + (ticket.company_code || 'не указана'),
      'Тип: ' + (label[ticket.category] || 'Обращение'),
      'Отправитель: ' + (ticket.sender_role === 'owner' ? 'владелец' : ticket.sender_role === 'staff' ? 'сотрудник' : 'гость'),
      '',
      ticket.title.slice(0, 120),
      ticket.message.slice(0, 2600),
      '',
      'Ответить: https://po-grafiku.ru/admin.html'
    ].join('\n');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4500);
    try {
      const result = await fetch('https://api.telegram.org/bot' + botToken + '/sendMessage', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text, link_preview_options: { is_disabled: true } }),
        signal: controller.signal
      });
      sent = result.ok;
      if (!sent) errorCode = 'telegram_http_' + result.status;
    } catch (e) {
      errorCode = e instanceof Error && e.name === 'AbortError' ? 'telegram_timeout' : 'telegram_network_error';
    } finally {
      clearTimeout(timeout);
    }
  }
  try {
    // Record only the delivery outcome, never secrets or Telegram response bodies.
    await db.from('pvz2_support_tickets').update({
      telegram_notified_at: sent ? new Date().toISOString() : null,
      telegram_delivery_error: errorCode
    }).eq('id', ticketId).is('telegram_notified_at', null);
  } catch {
    // Notification status is best effort; do not interfere with support submissions.
  }
}

async function budget(id: string, limit: number) {
  const { data, error } = await db.rpc('pvz2_support_consume', { p_key: id, p_limit: limit });
  check(error); if (!data) fail(429, 'Слишком много сообщений за час. Попробуйте позже.');
}
// App sessions are separate from Supabase Auth. Validate both formats without
// touching or refreshing schedule sessions. Never trust a role/point from input.
async function identity(appToken: unknown, authToken: unknown, guestKey: unknown) {
  if (appToken) {
    if (typeof appToken !== 'string' || !/^[0-9a-f]{64}$/.test(appToken)) fail(401, 'Войдите снова.');
    const ownerHash = await digest(appToken as string), memberHash = await digest('pvz-v2-members:' + appToken);
    const { data: session, error } = await db.from('pvz2_sessions').select('token_hash,company_id,role,member_id')
      .in('token_hash', [ownerHash, memberHash]).gt('expires_at', new Date().toISOString()).maybeSingle();
    check(error); if (!session || (session.role !== 'owner' && session.token_hash !== memberHash)) fail(401, 'Сеанс истёк. Войдите снова.');
    const { data: point, error: pointError } = await db.from('pvz2_companies').select('id,code,public_code,owner_auth_uid,employees').eq('id', session!.company_id).maybeSingle();
    check(pointError); if (!point) fail(401, 'Точка недоступна.');
    let principal: string;
    if (session!.role === 'owner') principal = point!.owner_auth_uid ? 'auth:' + point!.owner_auth_uid : 'owner:' + point!.id;
    else {
      const { data: member, error: memberError } = await db.from('pvz2_members').select('id,role,active,must_change_password,employee_name').eq('id', session!.member_id).eq('company_id', point!.id).maybeSingle();
      check(memberError);
      if (!member || !member.active || member.role !== session!.role || member.must_change_password || !point!.employees.includes(member.employee_name)) fail(403, 'Сначала войдите с действующим личным паролем.');
      principal = 'member:' + member!.id;
    }
    return { hash: await digest(principal), companyId: point!.id, code: point!.public_code || point!.code, ownerUid: session!.role === 'owner' ? point!.owner_auth_uid : null, role: session!.role === 'owner' ? 'owner' : 'staff' };
  }
  if (authToken) {
    if (typeof authToken !== 'string' || authToken.length > 6000) fail(401, 'Войдите снова.');
    const { data, error } = await db.auth.getUser(authToken as string);
    if (error || !data.user?.email_confirmed_at) fail(401, 'Войдите с подтверждённым email.');
    return { hash: await digest('auth:' + data.user!.id), companyId: null, code: '', ownerUid: data.user!.id, role: 'owner' };
  }
  if (guestKey && (typeof guestKey !== 'string' || !/^[0-9a-f]{64}$/.test(guestKey))) fail(401, 'Не удалось подтвердить доступ к обращениям.');
  return { hash: typeof guestKey === 'string' ? await digest('guest:' + guestKey) : null, companyId: null, code: '', ownerUid: null, role: 'guest' };
}
async function isAdmin(authToken: unknown) {
  if (typeof authToken !== 'string' || authToken.length > 6000) fail(401, 'Войдите в панель сервиса.');
  const { data: user, error } = await db.auth.getUser(authToken as string);
  if (error || !user.user?.email_confirmed_at) fail(401, 'Войдите в панель сервиса.');
  const caller = createClient(url, key, { global: { headers: { Authorization: 'Bearer ' + authToken } }, auth: { persistSession: false, autoRefreshToken: false } });
  const access = await caller.rpc('pvz2_service_admin_access');
  if (access.error || access.data !== true) fail(403, 'Доступно только администратору сервиса.');
}

export async function handler(req: Request): Promise<Response> {
  const origin = req.headers.get('origin') || '';
  if (!origins.has(origin)) return reply(origin, 403, { error: 'Недоступный источник' });
  if (req.method === 'OPTIONS') return reply(origin, 200, {});
  if (req.method !== 'POST') return reply(origin, 405, { error: 'Метод недоступен' });
  try {
    if (Number(req.headers.get('content-length') || 0) > 28000) fail(413, 'Слишком большое сообщение.');
    // Limit streamed bodies too: do not buffer an unbounded chunked request.
    const reader = req.body?.getReader(); if (!reader) fail(400, 'Пустой запрос.');
    let size = 0; const chunks: Uint8Array[] = [];
    while (true) { const { value, done } = await reader!.read(); if (done) break; size += value.length; if (size > 28000) { await reader!.cancel(); fail(413, 'Слишком большое сообщение.'); } chunks.push(value); }
    const bytes = new Uint8Array(size); let pos = 0; for (const c of chunks) { bytes.set(c, pos); pos += c.length; }
    let v: any; try { v = JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Неверный запрос.'); }
    if (!v || typeof v !== 'object' || Array.isArray(v)) fail(400, 'Неверный запрос.');
    const plain = req.headers.get('content-type')?.split(';')[0].trim() === 'text/plain' ? v.transport : null;
    if ((req.headers.get('apikey') ?? plain?.apikey) !== key) fail(401, 'Неверный ключ приложения.');
    const admin = ['adminList', 'adminRead', 'adminReply', 'adminSeen', 'adminCount'].includes(v.action);
    if (admin) await isAdmin(v.authToken);
    const bearer = req.headers.get('authorization');
    if (bearer && !bearer.startsWith('Bearer ')) fail(401, 'Войдите снова.');
    const who = admin ? null : await identity(bearer ? bearer.slice(7) : plain?.token, v.authToken, v.guestKey);
    const ip = (req.headers.get('cf-connecting-ip') || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown').slice(0, 100);
    const ipHash = await digest('support-ip:' + ip + ':' + serviceKey.slice(0, 40));
    if (v.action === 'supportSubmit') {
      const title = typeof v.title === 'string' ? v.title.trim() : '', message = typeof v.message === 'string' ? v.message.trim() : '';
      const email = typeof v.email === 'string' ? v.email.trim().toLowerCase() : '';
      const pointCode = typeof v.pointCode === 'string' ? v.pointCode.trim().toLowerCase() : '';
      if (!['bug', 'question', 'idea', 'access'].includes(v.category) || title.length < 4 || title.length > 120 || message.length < 15 || message.length > 4000 || email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || (pointCode && !/^[a-z0-9-]{4,32}$/.test(pointCode))) fail(400, 'Проверьте тему, описание, email и ID точки.');
      if (v.website) return reply(origin, 200, { ok: true });
      if (containsSecret(title + '\n' + message + '\n' + email)) fail(400, 'Удалите пароли, токены и коды доступа из текста.');
      if (v.requestId !== undefined && !uuid(v.requestId)) fail(400, 'Неверный идентификатор запроса.');
      const requestId = v.requestId || crypto.randomUUID();
      if (who!.hash) {
        const old = await db.from('pvz2_support_access').select('ticket_id').eq('requester_hash', who!.hash).eq('request_id', requestId).maybeSingle(); check(old.error);
        if (old.data) return reply(origin, 200, { ok: true, ticketId: old.data.ticket_id });
      }
      await budget(ipHash, 5); if (who!.hash) await budget(await digest('create:' + who!.hash), 5);
      const { data, error } = await db.rpc('pvz2_support_create', { p_ticket: { company_id: who!.companyId, owner_auth_uid: who!.ownerUid, company_code: who!.code || pointCode, category: v.category, title, message, contact_email: email, sender_role: who!.role }, p_requester: who!.hash, p_request_id: requestId });
      check(error);
      // Wait for this bounded delivery attempt so Edge shutdown cannot drop the notification.
      // The ticket remains saved and the user receives success even if Telegram is unavailable.
      await notifyTelegramForNewTicket(data, {
        company_code: who!.code || pointCode, category: v.category, title, message, sender_role: who!.role
      });
      return reply(origin, 200, { ok: true, ticketId: data });
    }
    if (!admin && !who!.hash) fail(401, 'Войдите или откройте поддержку в браузере отправки.');
    if (v.action === 'adminCount') {
      const { count, error } = await db.from('pvz2_support_tickets').select('id', { count: 'exact', head: true }).eq('admin_unread', true); check(error);
      return reply(origin, 200, { unread: count });
    }
    if (v.action === 'adminList' || v.action === 'supportList') {
      let query = db.from('pvz2_support_tickets').select(ticketFields + ',admin_unread', { count: 'exact' });
      if (!admin) {
        const access = await db.from('pvz2_support_access').select('ticket_id').eq('requester_hash', who!.hash!); check(access.error);
        const ids = (access.data || []).map(x => x.ticket_id);
        if (!ids.length) return reply(origin, 200, { tickets: [], total: 0 });
        query = query.in('id', ids);
      }
      if (v.status) { if (!['new', 'in_progress', 'resolved'].includes(v.status)) fail(400, 'Неверный статус.'); query = query.eq('status', v.status); }
      if (v.category) { if (!['bug', 'question', 'idea', 'access'].includes(v.category)) fail(400, 'Неверный тип.'); query = query.eq('category', v.category); }
      if (v.point) { if (typeof v.point !== 'string' || !/^[a-z0-9-]{1,32}$/.test(v.point)) fail(400, 'Неверный ID точки.'); query = query.ilike('company_code', '%' + v.point + '%'); }
      if (v.from) { if (typeof v.from !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v.from) || !Number.isFinite(Date.parse(v.from))) fail(400, 'Неверная дата.'); query = query.gte('created_at', v.from + 'T00:00:00+05:00'); }
      if (v.search) { if (typeof v.search !== 'string' || v.search.length > 120) fail(400, 'Слишком длинный поиск.'); query = uuid(v.search) ? query.eq('id', v.search) : query.ilike('title', '%' + v.search.replace(/[%_\\]/g, '') + '%'); }
      const offset = Number.isInteger(v.offset) && v.offset >= 0 && v.offset <= 100000 ? v.offset : 0;
      const { data, error, count } = await query.order('updated_at', { ascending: false }).order('id').range(offset, offset + 24); check(error);
      return reply(origin, 200, { tickets: data, total: count });
    }
    if (!uuid(v.ticketId)) fail(400, 'Неверный номер обращения.');
    if (!admin) {
      const access = await db.from('pvz2_support_access').select('ticket_id').eq('ticket_id', v.ticketId).eq('requester_hash', who!.hash!).maybeSingle(); check(access.error);
      if (!access.data) fail(404, 'Обращение не найдено.');
    }
    if (v.action === 'adminRead' || v.action === 'supportRead') {
      const ticket = await db.from('pvz2_support_tickets').select(ticketFields).eq('id', v.ticketId).maybeSingle(); check(ticket.error);
      if (!ticket.data) fail(404, 'Обращение не найдено.');
      const offset = Number.isInteger(v.eventOffset) && v.eventOffset >= 0 ? v.eventOffset : 0;
      const events = await db.from('pvz2_support_events').select(eventFields, { count: 'exact' }).eq('ticket_id', v.ticketId).order('created_at', { ascending: false }).order('id', { ascending: false }).range(offset, offset + 99); check(events.error);
      return reply(origin, 200, { ticket: ticket.data, events: (events.data || []).reverse(), eventTotal: events.count });
    }
    if (v.action === 'adminSeen' || v.action === 'supportSeen') {
      // Seen time is the snapshot actually displayed, not a later concurrent reply.
      if (typeof v.seenAt !== 'string' || !Number.isFinite(Date.parse(v.seenAt))) fail(400, 'Неверная дата.');
      const seenAt = new Date(Math.min(Date.parse(v.seenAt), Date.now())).toISOString();
      const patch = admin ? { admin_seen_at: seenAt } : { user_seen_at: seenAt };
      const update = await db.from('pvz2_support_tickets').update(patch).eq('id', v.ticketId); check(update.error);
      return reply(origin, 200, { ok: true });
    }
    if (v.action === 'adminReply' || v.action === 'supportReply') {
      const message = typeof v.message === 'string' ? v.message.trim() : '';
      if (message.length > 4000 || (!admin && message.length < 1) || (!message && !v.status) || !Number.isInteger(v.version) || v.version < 0 || !uuid(v.requestId)) fail(400, 'Проверьте сообщение. Максимум 4000 знаков.');
      if (containsSecret(message)) fail(400, 'Удалите пароли, токены и коды доступа из текста.');
      if (admin && v.status && !['new', 'in_progress', 'resolved'].includes(v.status)) fail(400, 'Неверный статус.');
      if (!admin) { await budget(await digest('reply:' + who!.hash), 30); await budget(await digest('reply-ip:' + ipHash), 60); }
      const result = await db.rpc('pvz2_support_reply', { p_ticket_id: v.ticketId, p_message: message, p_status: admin ? v.status || null : null, p_admin: admin, p_requester: who?.hash || null, p_version: v.version, p_request_id: v.requestId });
      if (result.error?.code === 'P0001' && result.error?.message === 'support_conflict') fail(409, 'Появилось новое сообщение. Обновите обращение перед отправкой.');
      if (result.error?.code === '42501') fail(404, 'Обращение не найдено.');
      check(result.error); return reply(origin, 200, { ok: true });
    }
    return fail(400, 'Неизвестное действие.');
  } catch (error) {
    // Never log request bodies, authorization values, database errors or email text.
    return reply(origin, error instanceof Failure ? error.status : 503, { error: error instanceof Failure ? error.message : 'Поддержка временно недоступна. Повторите позже.' });
  }
}
if (import.meta.main) Deno.serve(handler);
