import { ImapFlow } from "imapflow";
import { simpleParser, type Attachment } from "mailparser";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  folder: string;
  senderFilter?: string | null;
  lastUid?: number | null;
}

export interface FetchedMail {
  uid: number;
  from: string;
  subject: string;
  date: Date | null;
  text: string;
  attachments: Attachment[];
}

export interface FetchResult {
  mails: FetchedMail[];
  maxUid: number;
  scanned: number;
}

/**
 * Забирає нові листи (UID > lastUid). Перший запуск — лише за останні firstSyncDays,
 * щоб не тягнути всю історію скриньки. maxMessages — захист від таймаутів serverless.
 */
export async function fetchNewMail(cfg: ImapConfig, opts: { firstSyncDays?: number; maxMessages?: number; maxScan?: number; subjectMatch?: RegExp; attachmentMatch?: RegExp } = {}): Promise<FetchResult> {
  const { firstSyncDays = 45, maxMessages = 40, maxScan = 1000 } = opts;
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    socketTimeout: 30_000,
  });
  // Обрив/таймаут сокета ImapFlow віддає подією "error"; без слухача це uncaughtException.
  // Сама помилка все одно приходить як rejection поточного виклику.
  client.on("error", () => undefined);

  const mails: FetchedMail[] = [];
  let maxUid = cfg.lastUid || 0;
  let scanned = 0;

  await client.connect();
  try {
    const lock = await client.getMailboxLock(cfg.folder || "INBOX");
    try {
      let uids: number[];
      if (cfg.lastUid) {
        uids = ((await client.search({ uid: `${cfg.lastUid + 1}:*` }, { uid: true })) || []) as number[];
      } else {
        const since = new Date(Date.now() - firstSyncDays * 86400_000);
        uids = ((await client.search({ since }, { uid: true })) || []) as number[];
      }
      uids = uids.filter((u) => u > (cfg.lastUid || 0)).sort((a, b) => a - b).slice(0, maxScan);
      if (!uids.length) {
        // зафіксувати поточну позицію, щоб наступного разу не шукати по даті
        if (!cfg.lastUid) {
          const status = await client.status(cfg.folder || "INBOX", { uidNext: true });
          maxUid = Math.max(0, (status.uidNext || 1) - 1);
        }
        return { mails, maxUid, scanned };
      }

      // 1) лише конверти — дешево, фільтруємо відправника
      const allowed = (cfg.senderFilter || "").toLowerCase().split(/[|,;]/).map((s) => s.trim()).filter(Boolean);
      const wanted: number[] = [];
      const anyFilter = allowed.length > 0 || !!opts.subjectMatch || !!opts.attachmentMatch;
      for await (const msg of client.fetch(uids, { uid: true, envelope: true, bodyStructure: !!opts.attachmentMatch }, { uid: true })) {
        scanned++;
        const from = msg.envelope?.from?.[0]?.address?.toLowerCase() || "";
        const subject = msg.envelope?.subject || "";
        const bySender = allowed.length > 0 && allowed.some((a) => from.includes(a));
        const bySubject = !!opts.subjectMatch && opts.subjectMatch.test(subject);
        const byAttachment =
          !!opts.attachmentMatch && attachmentNames(msg.bodyStructure).some((n) => opts.attachmentMatch!.test(n));
        if (!anyFilter || bySender || bySubject || byAttachment) wanted.push(msg.uid);
      }
      // 2) повні листи лише для потрібних, не більше maxMessages за раз
      wanted.sort((a, b) => a - b);
      const take = wanted.slice(0, maxMessages);
      // якщо не всі потрібні влізли — зупиняємо курсор перед першим необробленим
      maxUid = wanted.length > take.length ? take[take.length - 1] : Math.max(maxUid, uids[uids.length - 1]);

      if (take.length) {
        for await (const msg of client.fetch(take, { uid: true, source: true, envelope: true }, { uid: true })) {
          if (!msg.source) continue;
          const parsed = await simpleParser(msg.source);
          mails.push({
            uid: msg.uid,
            from: msg.envelope?.from?.[0]?.address?.toLowerCase() || "",
            subject: parsed.subject || "",
            date: parsed.date || null,
            text: (parsed.text || "").slice(0, 8000),
            attachments: parsed.attachments || [],
          });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    await client.logout().catch(() => undefined);
  }
  return { mails, maxUid, scanned };
}

type Node = { childNodes?: Node[]; dispositionParameters?: Record<string, string>; parameters?: Record<string, string>; disposition?: string };

/** Імена вкладень зі структури листа (без завантаження тіла). */
export function attachmentNames(node: Node | undefined): string[] {
  if (!node) return [];
  const own = node.dispositionParameters?.filename || node.parameters?.name;
  return [...(own ? [own] : []), ...(node.childNodes || []).flatMap(attachmentNames)];
}

export async function testImap(cfg: Omit<ImapConfig, "lastUid" | "senderFilter">): Promise<{ ok: boolean; messages?: number; error?: string }> {
  const client = new ImapFlow({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 993,
    auth: { user: cfg.user, pass: cfg.password },
    logger: false,
    socketTimeout: 20_000,
  });
  client.on("error", () => undefined);
  try {
    await client.connect();
    const st = await client.status(cfg.folder || "INBOX", { messages: true });
    return { ok: true, messages: st.messages };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  } finally {
    await client.logout().catch(() => undefined);
  }
}
