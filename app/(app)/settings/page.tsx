export const dynamic = "force-dynamic";

import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/auth";
import { telegramEnabled } from "@/lib/telegram/api";
import { aiEnabled } from "@/lib/docs/extract";
import { ensureSystemRules } from "@/lib/docs/rules";
import {
  BankAccountsPanel,
  InboxesPanel,
  UsersPanel,
  TelegramPanel,
  RulesPanel,
  PasswordPanel,
} from "@/components/settings/SettingsPanels";

export default async function SettingsPage() {
  const session = await getSession();
  if (!session || session.role === "client") redirect("/login");
  const isOwner = session.role === "owner";
  await ensureSystemRules();

  const [clients, accounts, inboxes, users, rules, me] = await Promise.all([
    prisma.client.findMany({ where: { isActive: true }, select: { id: true, name: true, type: true }, orderBy: { createdAt: "asc" } }),
    prisma.bankAccount.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true, clientId: true, name: true, accountNumber: true, iban: true, currency: true, isActive: true, source: true,
        imapHost: true, imapPort: true, imapUser: true, imapFolder: true, senderFilter: true, lastSyncAt: true, lastError: true,
        imapPasswordEnc: true, fioTokenEnc: true,
      },
    }),
    prisma.documentInbox.findMany({
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, kind: true, clientId: true, imapHost: true, imapPort: true, imapUser: true, imapFolder: true, senderFilter: true, isActive: true, lastSyncAt: true, lastError: true },
    }),
    isOwner ? prisma.user.findMany({ orderBy: { createdAt: "asc" }, select: { id: true, email: true, name: true, role: true, isActive: true, telegramChatId: true, lastLoginAt: true } }) : [],
    prisma.docRequirementRule.findMany({ orderBy: [{ priority: "asc" }, { createdAt: "asc" }] }),
    session.userId ? prisma.user.findUnique({ where: { id: session.userId }, select: { telegramChatId: true, name: true, email: true } }) : null,
  ]);

  const accountsSafe = accounts.map(({ imapPasswordEnc, fioTokenEnc, ...a }) => ({
    ...a,
    hasPassword: !!imapPasswordEnc,
    hasToken: !!fioTokenEnc,
    lastSyncAt: a.lastSyncAt?.toISOString() ?? null,
  }));
  const rulesSafe = rules.map((r) => ({
    ...r,
    minAbsAmount: r.minAbsAmount != null ? Number(r.minAbsAmount) : null,
    maxAbsAmount: r.maxAbsAmount != null ? Number(r.maxAbsAmount) : null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8 max-w-5xl">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Nastavení</h1>
        <p className="text-muted-foreground text-sm mt-0.5">
          {me?.name} ({session.role === "owner" ? "majitel" : "účetní"}) · AI rozpoznávání: {aiEnabled() ? "zapnuto" : "vypnuto (chybí OPENAI_API_KEY)"}
        </p>
      </div>

      <TelegramPanel enabled={telegramEnabled()} linked={!!me?.telegramChatId} isOwner={isOwner} />
      <BankAccountsPanel clients={clients.filter((c) => c.type === "company")} accounts={accountsSafe} isOwner={isOwner} />
      <InboxesPanel
        clients={clients}
        inboxes={inboxes.map((i) => ({ ...i, lastSyncAt: i.lastSyncAt?.toISOString() ?? null }))}
        isOwner={isOwner}
      />
      <RulesPanel rules={rulesSafe} clients={clients.filter((c) => c.type === "company")} isOwner={isOwner} />
      {isOwner && <UsersPanel users={users.map((u) => ({ ...u, lastLoginAt: u.lastLoginAt?.toISOString() ?? null }))} />}
      <PasswordPanel />
    </div>
  );
}
