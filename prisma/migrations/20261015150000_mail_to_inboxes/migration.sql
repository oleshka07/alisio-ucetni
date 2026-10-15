-- Výpisy z e-mailu teď čte Nastavení → Pošta (DocumentInbox) a sama je rozdělí do účtů.
-- IMAP nastavení z bankovních účtů převedeme na schránky (pokud stejná schránka už není) a účty přepneme na „ruční / z pošty“.
INSERT INTO "DocumentInbox" ("id", "name", "kind", "clientId", "imapHost", "imapPort", "imapUser", "imapPasswordEnc", "imapFolder", "senderFilter", "lastUid", "isActive", "createdAt")
SELECT DISTINCT ON (lower(b."imapHost"), lower(b."imapUser"), coalesce(b."imapFolder", 'INBOX'))
  'inbox_' || md5(b."id"),
  'Výpisy: ' || b."imapUser",
  'mixed',
  b."clientId",
  b."imapHost",
  coalesce(b."imapPort", 993),
  b."imapUser",
  b."imapPasswordEnc",
  coalesce(b."imapFolder", 'INBOX'),
  b."senderFilter",
  b."lastUid",
  true,
  now()
FROM "BankAccount" b
WHERE b."source" = 'imap_camt' AND b."imapHost" IS NOT NULL AND b."imapUser" IS NOT NULL AND b."imapPasswordEnc" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "DocumentInbox" i
    WHERE lower(i."imapHost") = lower(b."imapHost") AND lower(i."imapUser") = lower(b."imapUser")
      AND i."imapFolder" = coalesce(b."imapFolder", 'INBOX')
  )
ORDER BY lower(b."imapHost"), lower(b."imapUser"), coalesce(b."imapFolder", 'INBOX'), b."createdAt";

UPDATE "BankAccount" SET "source" = 'manual', "lastError" = NULL, "failCount" = 0 WHERE "source" = 'imap_camt';
