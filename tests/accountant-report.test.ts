import { test } from "node:test";
import assert from "node:assert/strict";
import { isDue, previousMonth, monthLabel, parseEmails } from "../lib/finance/accountant-report";
import { signExportLink, verifyExportLink } from "../lib/finance/month-export";
import { smtpHostFor } from "../lib/mail/smtp";

process.env.CRON_SECRET ||= "test-secret";

test("kdy poslat: od dne v měsíci, jednou za minulý měsíc", () => {
  const nov10 = new Date(2026, 10, 10, 8, 0);
  assert.equal(previousMonth(nov10), "2026-10");
  assert.equal(previousMonth(new Date(2026, 0, 15)), "2025-12");
  assert.equal(isDue({ isActive: true, dayOfMonth: 10, lastSentMonth: "2026-09" }, nov10), true);
  assert.equal(isDue({ isActive: true, dayOfMonth: 10, lastSentMonth: "2026-10" }, nov10), false);
  assert.equal(isDue({ isActive: true, dayOfMonth: 12, lastSentMonth: null }, nov10), false);
  assert.equal(isDue({ isActive: false, dayOfMonth: 1, lastSentMonth: null }, nov10), false);
  assert.equal(monthLabel("2026-10"), "říjen 2026");
});

test("e-maily příjemců", () => {
  assert.equal(parseEmails("a@b.cz; c@d.eu"), "a@b.cz, c@d.eu");
  assert.throws(() => parseEmails("bez-zavinace"));
  assert.throws(() => parseEmails(""));
});

test("podepsaný odkaz ke stažení", () => {
  const now = Date.UTC(2026, 10, 10);
  const { exp, sig } = signExportLink("firma1", "2026-10", now);
  assert.equal(verifyExportLink("firma1", "2026-10", exp, sig, now), true);
  assert.equal(verifyExportLink("firma2", "2026-10", exp, sig, now), false);
  assert.equal(verifyExportLink("firma1", "2026-09", exp, sig, now), false);
  assert.equal(verifyExportLink("firma1", "2026-10", exp, sig, now + 31 * 86400_000), false);
});

test("SMTP podle IMAP", () => {
  assert.deepEqual(smtpHostFor("imap.gmail.com"), { host: "smtp.gmail.com", port: 465, secure: true });
  assert.deepEqual(smtpHostFor("imap.seznam.cz"), { host: "smtp.seznam.cz", port: 465, secure: true });
  assert.equal(smtpHostFor("outlook.office365.com").host, "smtp.office365.com");
});
