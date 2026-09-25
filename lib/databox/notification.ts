/**
 * Розбір e-mail сповіщень ISDS («do datové schránky byla dodána datová zpráva»).
 * Сповіщення не містить самого листа — лише метадані: ID зпрávy, odesílatel, věc,
 * schránka, datum dodání. Цього досить, щоб поставити задачу з дедлайном фікції.
 *
 * Фікція доручення: зпráva вважається доставленою 10-го дня після dodání,
 * якщо до того ніхто не увійшов у схранку.
 */

export interface DataBoxNotice {
  messageId: string | null;
  dataBoxId: string | null;
  dataBoxName: string | null;
  sender: string | null;
  subject: string | null;
  deliveredAt: Date | null;
  fictionAt: Date | null;
  important: boolean;
}

const FICTION_DAYS = 10;

export function isDataBoxNotification(from: string, subject: string, text: string): boolean {
  if (/mojedatovaschranka\.cz|datovka\.gov\.cz|czebox\.cz/i.test(from)) return true;
  const hay = `${subject}\n${text.slice(0, 1500)}`.toLowerCase();
  return /datov[éeá]\s+schr[áa]nk/.test(hay) && /(datov[áa]\s+zpr[áa]v|dod[áa]n)/.test(hay);
}

function line(text: string, re: RegExp): string | null {
  const m = re.exec(text);
  if (!m) return null;
  let v = m[1].trim().replace(/\s+/g, " ").replace(/[;,]+$/, "");
  // крапку в кінці прибираємо, але не в скороченнях («s.r.o.», «a.s.»)
  if (/\.$/.test(v) && !/\b[a-z]\.$/i.test(v)) v = v.slice(0, -1);
  return v || null;
}

function parseCzDate(text: string, re: RegExp): Date | null {
  const m = re.exec(text);
  if (!m) return null;
  const [, d, mo, y, h = "0", mi = "0"] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi));
  return isNaN(date.getTime()) ? null : date;
}

const IMPORTANT = /finan[čc]n[íi]\s+[úu][řr]ad|\bF[ÚU]\b|spr[áa]va\s+soci[áa]ln|[ČC]SSZ|pojiš[ťt]ovn|zdravotn[íi]\s+poji|soud|exekut|policie|celn[íi]|inspekt|krajsk[ýy]\s+[úu][řr]ad|magistr[áa]t|[úu][řr]ad\s+pr[áa]ce|ministerstv|katastr/i;

export function parseDataBoxNotification(subject: string, text: string, emailDate: Date | null): DataBoxNotice {
  const t = `${subject}\n${text}`.replace(/\r/g, "");

  const messageId =
    line(t, /(?:ID|identifik[áa]tor|identifikace|[čc][íi]slo)\s+(?:datov[ée]\s+)?zpr[áa]vy\s*[:\-]?\s*(\d{5,12})/i) ||
    line(t, /zpr[áa]va\s+(?:č\.|[čc][íi]slo|ID)\s*[:\-]?\s*(\d{5,12})/i);

  const dataBoxId = line(t, /(?:ID|identifik[áa]tor)\s+(?:datov[ée]\s+)?schr[áa]nky\s*[:\-]?\s*([a-z0-9]{7})\b/i);

  const dataBoxName =
    line(t, /(?:schr[áa]nky|schr[áa]nce)\s*[:\-]?\s*[a-z0-9]{7}\s*\(([^)\n]{2,120})\)/i) ||
    line(t, /(?:Adres[áa]t|P[řr][íi]jemce|Majitel\s+schr[áa]nky|Dr[žz]itel\s+schr[áa]nky)\s*:\s*([^\n]{2,120})/i);

  const sender = line(t, /Odes[íi]latel\s*(?:zpr[áa]vy)?\s*:\s*([^\n]{2,160})/i);
  const subj =
    line(t, /(?:V[ěe]c|P[řr]edm[ěe]t(?:\s+zpr[áa]vy)?)\s*:\s*([^\n]{1,250})/i);

  let deliveredAt = parseCzDate(
    t,
    /(?:dod[áa]n[íi]|dod[áa]na|dod[áa]no|datum\s+a\s+[čc]as\s+dod[áa]n[íi])[^\d\n]{0,40}(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})(?:[^\d\n]{1,5}(\d{1,2}):(\d{2}))?/i
  );
  if (!deliveredAt) deliveredAt = emailDate;

  let fictionAt: Date | null = null;
  if (deliveredAt) {
    fictionAt = new Date(deliveredAt);
    fictionAt.setHours(0, 0, 0, 0);
    fictionAt.setDate(fictionAt.getDate() + FICTION_DAYS);
  }

  return {
    messageId,
    dataBoxId: dataBoxId ? dataBoxId.toLowerCase() : null,
    dataBoxName,
    sender,
    subject: subj,
    deliveredAt,
    fictionAt,
    important: IMPORTANT.test(`${sender || ""} ${subj || ""}`),
  };
}
