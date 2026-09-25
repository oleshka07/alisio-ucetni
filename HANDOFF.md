# HANDOFF → кодова сесія: Alisio Účetnictví, Фаза 1

> Цей файл — завдання для кодової сесії (Claude Code) у репо. Після виконання
> заповніть «Звіт» унизу і передайте його Олегу для перевірки.

## Що це

Застосунок для Swipe Scape s.r.o.:

- банківські виписки (KB, ČS) приходять на пошту `vypisy@swipescape.eu` у форматі CAMT.053 → кожен платіж стає операцією;
- до кожного платежу чіпляються 1–5 документів: фактура, договір, CMR тощо; джерела — веб, Telegram-бот, пошта;
- основна пошта `o.stepeniev@swipescape.eu`:
  - сповіщення з датових схранок (ISDS) → задачі з дедлайном фікції доручення (+10 днів);
  - фактури у вкладеннях → AI розпізнає → автоматично чіпляє до платежу (або чекає, поки прийде виписка);
- Telegram: запити бухгалтерки приходять одразу, дайджест «чого бракує» — пн і чт, щоденні нагадування про дедлайни ≤ 2 дні;
- портал бухгалтерки: окремий логін, фільтри, «Vyžádat doklad», ZIP за місяць (CSV + документи).

Хостинг: **Hetzner**, той самий сервер, що й ALiSiO PMS. Postgres на сервері, файли на диску. Vercel більше не використовуємо.

## Карта коду (нове у Фазі 1)

| Шлях | Що |
| --- | --- |
| `prisma/migrations/*_finance_core` | нові таблиці: User, BankAccount, BankStatement, Transaction, TransactionDocument, DocRequirementRule, DocumentRequest, DocumentInbox, DataBoxMessage, NotificationLog; Document і Task розширені |
| `lib/auth.ts`, `middleware.ts`, `lib/guard.ts` | вхід e-mail+пароль (bcrypt), HMAC-підписана сесія з терміном 14 днів; ролі owner / accountant / client |
| `lib/bank/*` | CAMT.053 парсер (з PMS + VS/KS/SS, рахунок контрагента), Fio API, імпорт з дедупом, синхронізація IMAP |
| `lib/mail/imap.ts` | IMAP: спершу конверти/структура (фільтр), потім повні листи; курсор lastUid |
| `lib/docs/*` | правила «платіж → документи», статуси, AI-розпізнавання (OpenAI, PDF/фото напряму), пошук кандидатів, автоприв'язка в обидва боки, скриньки документів |
| `lib/databox/*` | розбір e-mail сповіщень ISDS → задача + Telegram |
| `lib/telegram/*` | Bot API, webhook-обробник (файли, /missing, /requests, кнопки), дайджест, нагадування |
| `lib/storage.ts` | файли: локальний диск (FILES_DIR) або Vercel Blob, якщо заданий токен |
| `app/(app)/transactions`, `inbox`, `settings` | інтерфейс (чеською — для бухгалтерки) |
| `app/api/*` | bank-accounts, transactions, documents/intake, requests, rules, users, doc-inboxes, telegram, cron/[job], export/month |
| `deploy/*` | systemd, nginx, crontab, deploy.sh, backup.sh, **README.md з покроковим розгортанням** |
| `.github/workflows/ci.yml` | типи + тести + збірка; деплой на Hetzner при `DEPLOY_ENABLED=true` |
| `tests/*.test.ts` | парсери CAMT/Fio/ISDS, правила, статуси (`npm test`) |
| `scripts/smoke.ts` | смоук на реальній БД з підміненим Telegram |
| `scripts/imap-local-test.ts` | IMAP-інтеграція на локальному тестовому сервері (hoodiecrow, порт 1143) |

Уже перевірено до передачі: `tsc` без помилок, 13/13 тестів, `next build` проходить, API-сценарії через curl на локальному Postgres, смоук, IMAP-тест.

## Завдання

### 1. Git
Код лежить у локальній папці на гілці `phase-1`, ще не закомічений.

1. Перегляньте диф (`git status`, `git diff --stat`). Файли `.env` у репо бути не повинно.
2. Закомітьте, додайте новий репозиторій як remote і запуште в `main` нового репо:
   ```bash
   git add -A && git commit -m "Phase 1: bank statements, documents per payment, ISDS notifications, Telegram, Hetzner deploy"
   git remote add ucetni git@github.com:oleshka07/alisio-ucetni.git     # новий репо
   git push ucetni phase-1:main
   ```
3. Старий репозиторій `ostepeniev/AlisioAccounting` зробіть приватним або заархівуйте. Він публічний.
4. `vercel.json` видаліть окремим комітом: Vercel більше не потрібен.

### 2. Локальна перевірка (до сервера)
```bash
npm ci
# Postgres локально або в Docker; скопіюйте .env.example → .env і заповніть локальні значення
npx prisma migrate deploy
npm test
npm run build
```

### 3. Сервер Hetzner
Кроки 1–5 з `deploy/README.md`. Порт 3002 має бути вільний: `ss -ltnp | grep 3002`. Перевірте, чим проксіюється PMS (nginx чи Caddy), і зробіть так само.
Потрібен DNS A-запис `ucetni.swipescape.eu → 46.225.132.220`. Якщо не створений — попросіть Олега.

**Не чіпати** сервіс `alisio-pms`, його порт 3001, базу і crontab-записи PMS.

### 4. Перший запуск (разом з Олегом)
Крок 6 з `deploy/README.md`. Токени (Telegram, OpenAI) Олег вносить у `.env` на сервері сам.

### 5. Приймальна перевірка
- [ ] `https://ucetni.swipescape.eu/login` відкривається, HTTPS валідний
- [ ] Вхід власника, зміна пароля
- [ ] Telegram: webhook встановлено, `/start` через «Připojit Telegram» → «✅ Підключено»
- [ ] Банківський рахунок KB: Test OK → Načíst → платежі з'являються; повторне Načíst не дублює
- [ ] Ручне завантаження CAMT XML на рахунок працює
- [ ] Фото чека в бот → бот відповідає розпізнаними даними і кандидатами платежів
- [ ] Основна пошта (режим «mixed»): тестовий лист із PDF-фактурою → документ з'являється/чіпляється; звичайні листи ігноруються
- [ ] Сповіщення ISDS (переслати справжнє на o.stepeniev@) → задача в «Úkoly» з датою фікції + повідомлення в Telegram
- [ ] Бухгалтерка: окремий логін, бачить «Platby a doklady», може «Vyžádat doklad» → Олег отримує в Telegram
- [ ] ZIP за місяць завантажується
- [ ] `crontab -l` містить 4 записи; `/var/log/alisio-ucetni-cron.log` без помилок після 15 хв
- [ ] `deploy/backup.sh` створює файли в `/root/backups/alisio-ucetni`
- [ ] PMS працює як раніше (`systemctl status alisio-pms`)

## Відомі обмеження / що далі

- **Формат сповіщень ISDS.** Парсер написаний під типовий текст «ID datové zprávy / Odesílatel / Věc / dodána». Перше справжнє сповіщення перевірте: чи правильно розпізнано відправника, справу і дату (розділ «Úkoly»). Якщо ні — надішліть приклад тексту (без персональних даних) Олегу для виправлення регулярних виразів у `lib/databox/notification.ts`.
- **AI-розпізнавання** потребує `OPENAI_API_KEY`. Без нього фактури з основної пошти не забираються (режим mixed свідомо пропускає вкладення, які не перевірив AI).
- **Pohoda:** зараз ZIP + CSV. Експорт у Pohoda XML — Фаза 2.
- Фаза 2: податковий календар CZ (генерація дедлайнів ПДВ/KH/JMHZ/внески), оцінка ПДВ за місяць, дашборд доходів/витрат.
- Фаза 3: API датових схранок (читання змісту), класифікація решти пошти.

## Звіт (заповнює кодова сесія)

```
Коміт / гілка:
Що зроблено з чекліста:
Що не вдалося і чому:
Зміни в коді, які довелося внести:
Логи помилок (якщо були):
Питання до Олега:
```
