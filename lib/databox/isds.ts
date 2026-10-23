import { parseStringPromise, processors } from "xml2js";

/**
 * Klient webových služeb ISDS (SOAP, verze v20) — přihlášení jménem a heslem (Basic).
 * Dokumentace: Provozní řád ISDS, příloha 2 (WS). Zdarma pro každého uživatele schránky.
 * POZOR: každé přihlášení oprávněné osoby = doručení všech dodaných zpráv (§ 17 odst. 3 zák. 300/2008 Sb.).
 */
export type IsdsEnv = "production" | "test";
export type IsdsLogin = { environment: IsdsEnv | string; username: string; password: string };
type Service = "dx" | "dz" | "DsManage";

const HOSTS: Record<IsdsEnv, string> = {
  production: "https://ws1.mojedatovaschranka.cz",
  test: "https://ws1.czebox.cz",
};
const NS = "http://isds.czechpoint.cz/v20";

export class IsdsError extends Error {
  constructor(message: string, public code?: string) {
    super(message);
  }
}

const escXml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

export function buildEnvelope(op: string, fields: Record<string, string | number | null>): string {
  const inner = Object.entries(fields)
    .map(([k, v]) => (v === null || v === "" ? `<${k}/>` : `<${k}>${escXml(String(v))}</${k}>`))
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><${op} xmlns="${NS}">${inner}</${op}></soap:Body></soap:Envelope>`;
}

type Node = Record<string, unknown>;

/** Vytáhne tělo odpovědi `${op}Response` a zkontroluje dmStatus / dbStatus (0000 = OK). */
export async function parseResponse(xml: string, op: string): Promise<Node> {
  const doc = await parseStringPromise(xml, { explicitArray: false, tagNameProcessors: [processors.stripPrefix], attrkey: "$", charkey: "_" });
  const body = (doc?.Envelope?.Body ?? {}) as Node;
  const fault = body.Fault as Node | undefined;
  if (fault) throw new IsdsError(`ISDS: ${String(fault.faultstring ?? "SOAP Fault")}`);
  const res = body[`${op}Response`] as Node | undefined;
  if (!res) throw new IsdsError(`ISDS: neočekávaná odpověď na ${op}`);
  const st = (res.dmStatus ?? res.dbStatus) as Node | undefined;
  const code = String(st?.dmStatusCode ?? st?.dbStatusCode ?? "0000");
  if (code !== "0000") throw new IsdsError(`ISDS ${code}: ${String(st?.dmStatusMessage ?? st?.dbStatusMessage ?? "chyba")}`, code);
  return res;
}

async function call(login: IsdsLogin, service: Service, op: string, fields: Record<string, string | number | null>): Promise<Node> {
  const host = HOSTS[(login.environment as IsdsEnv) in HOSTS ? (login.environment as IsdsEnv) : "production"];
  const res = await fetch(`${host}/DS/${service}`, {
    method: "POST",
    headers: {
      "Content-Type": "text/xml; charset=utf-8",
      SOAPAction: '""',
      Authorization: `Basic ${Buffer.from(`${login.username}:${login.password}`).toString("base64")}`,
    },
    body: buildEnvelope(op, fields),
    signal: AbortSignal.timeout(45_000),
  });
  if (res.status === 401 || res.status === 403) throw new IsdsError("ISDS: nesprávné jméno nebo heslo (nebo zablokovaný / expirovaný účet)", String(res.status));
  const text = await res.text();
  if (!res.ok && !/Envelope/.test(text)) throw new IsdsError(`ISDS: HTTP ${res.status}`);
  return parseResponse(text, op);
}

const s = (v: unknown): string | null => {
  if (v == null) return null;
  if (typeof v === "object") return (v as Node)._ != null ? String((v as Node)._) : null;
  const t = String(v).trim();
  return t || null;
};
const d = (v: unknown): Date | null => {
  const t = s(v);
  if (!t) return null;
  const x = new Date(t);
  return isNaN(x.getTime()) ? null : x;
};
const list = <T>(v: T | T[] | undefined | null): T[] => (v == null ? [] : Array.isArray(v) ? v : [v]);

export type OwnerInfo = { dataBoxId: string | null; name: string | null };

export function ownerFromResponse(res: Node): OwnerInfo {
  const o = (res.dbOwnerInfo ?? {}) as Node;
  const person = [s(o.pnFirstName), s(o.pnLastName)].filter(Boolean).join(" ");
  return { dataBoxId: s(o.dbID), name: s(o.firmName) || person || null };
}

export async function getOwnerInfo(login: IsdsLogin): Promise<OwnerInfo> {
  return ownerFromResponse(await call(login, "DsManage", "GetOwnerInfoFromLogin", { dbDummy: null }));
}

/** Datum expirace hesla (null = heslo neexpiruje). */
export async function getPasswordExpiry(login: IsdsLogin): Promise<Date | null> {
  const res = await call(login, "DsManage", "GetPasswordInfo", { dbDummy: null });
  return d(res.pswExpDate);
}

export type EnvelopeRecord = {
  id: string;
  sender: string | null;
  senderBoxId: string | null;
  recipientBoxId: string | null;
  subject: string | null;
  status: number | null; // 4 dodána, 5 doručena fikcí, 6 doručena přihlášením, 7 přečtena…
  personalDelivery: boolean;
  deliveredAt: Date | null; // dodání do schránky
  acceptedAt: Date | null; // doručení
  senderRef: string | null;
};

export function recordsFromList(res: Node): EnvelopeRecord[] {
  const recs = list(((res.dmRecords ?? {}) as Node).dmRecord as Node | Node[] | undefined);
  return recs
    .map((r) => ({
      id: s(r.dmID) ?? "",
      sender: s(r.dmSender),
      senderBoxId: s(r.dbIDSender),
      recipientBoxId: s(r.dbIDRecipient),
      subject: s(r.dmAnnotation),
      status: s(r.dmMessageStatus) ? Number(s(r.dmMessageStatus)) : null,
      personalDelivery: s(r.dmPersonalDelivery) === "true",
      deliveredAt: d(r.dmDeliveryTime),
      acceptedAt: d(r.dmAcceptanceTime),
      senderRef: s(r.dmSenderRefNumber) || s(r.dmSenderIdent),
    }))
    .filter((r) => r.id);
}

export async function listReceived(login: IsdsLogin, from: Date, to: Date): Promise<EnvelopeRecord[]> {
  const res = await call(login, "dz", "GetListOfReceivedMessages", {
    dmFromTime: from.toISOString(),
    dmToTime: to.toISOString(),
    dmRecipientOrgUnitNum: null,
    dmStatusFilter: -1,
    dmOffset: 1,
    dmLimit: 1000,
  });
  return recordsFromList(res);
}

export type IsdsFile = { name: string; mimeType: string; content: Buffer; meta: string | null };

export function filesFromMessage(res: Node): IsdsFile[] {
  const dm = (((res.dmReturnedMessage ?? {}) as Node).dmDm ?? {}) as Node;
  const files = list(((dm.dmFiles ?? {}) as Node).dmFile as Node | Node[] | undefined);
  return files
    .map((f, i) => {
      const a = (f.$ ?? {}) as Record<string, string>;
      const b64 = s(f.dmEncodedContent);
      return {
        name: (a.dmFileDescr || `priloha-${i + 1}`).slice(0, 200),
        mimeType: a.dmMimeType || "application/octet-stream",
        meta: a.dmFileMetaType || null,
        content: b64 ? Buffer.from(b64.replace(/\s+/g, ""), "base64") : Buffer.alloc(0),
      };
    })
    .filter((f) => f.content.length > 0);
}

export async function downloadMessage(login: IsdsLogin, id: string): Promise<IsdsFile[]> {
  return filesFromMessage(await call(login, "dx", "MessageDownload", { dmID: id }));
}
