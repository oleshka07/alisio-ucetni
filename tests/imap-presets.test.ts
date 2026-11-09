import { test } from "node:test";
import assert from "node:assert/strict";
import { IMAP_PRESETS, imapPresetFor } from "../lib/mail/presets";

test("пресети: Seznam і Centrum мають хост на порту 993 і підказку про IMAP та пароль для aplikací", () => {
  const seznam = imapPresetFor("imap.seznam.cz");
  assert.ok(seznam, "Seznam є серед пресетів");
  assert.match(seznam!.hint ?? "", /IMAP/);
  assert.match(seznam!.hint ?? "", /heslo pro externí aplikace/i);
  assert.match(seznam!.hint ?? "", /celá e-mailová adresa/i);
  const centrum = imapPresetFor("imap.centrum.cz");
  assert.ok(centrum?.hint, "Centrum має підказку");
});

test("пошук пресета: регістр і пробіли ігноруються, чужий хост і порожнє — null", () => {
  assert.equal(imapPresetFor("  IMAP.Seznam.CZ ")?.host, "imap.seznam.cz");
  assert.equal(imapPresetFor("imap.example.com"), null);
  assert.equal(imapPresetFor(""), null);
  assert.equal(imapPresetFor("seznam.cz"), null, "лише точний хост, не підрядок");
});

test("пресети: хости унікальні, у списку збережені чотири початкові", () => {
  const hosts = IMAP_PRESETS.map((p) => p.host);
  assert.equal(new Set(hosts).size, hosts.length);
  for (const h of ["imap.gmail.com", "imap.seznam.cz", "imap.centrum.cz", "outlook.office365.com"]) assert.ok(hosts.includes(h), h);
});
