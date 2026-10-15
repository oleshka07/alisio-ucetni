#!/bin/bash
# Nápady do plánu jako úkoly „#ідеї“ (firma Swipe Scape, bez termínu → bez připomínek). Opakované spuštění nic nezdvojí.
set -eu
sudo -u postgres psql -d alisio_ucetni -v ON_ERROR_STOP=1 -q <<'SQL'
begin;
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Безперервність виписок: контроль пропусків$q$, $q$Кінцевий залишок однієї виписки має дорівнювати початковому наступної, між періодами — без дір. Якщо місяця бракує — система сама каже «бракує виписки KB CZK за серпень» (на дашборді, у Telegram-дайджесті, для бухгалтера). Пріоритет: перший.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Безперервність виписок: контроль пропусків$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї «Місяць закрито» по кожній фірмі$q$, $q$Чек-лист по фірмі й місяцю: усі виписки є (без пропусків), у кожного платежу документ або «не потрібно», податки місяця сплачені. Бухгалтер бачить таблицю всіх фірм: що готово, що ні і чому. Кнопка «закрити місяць» блокує зміни заднім числом.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї «Місяць закрито» по кожній фірмі$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Експорт у Pohoda / Money S3$q$, $q$Замість ZIP — експорт платежів і документів у формат бухгалтерської програми (Pohoda XML, Money S3 XML): банківські рухи + прив'язані доклади з розпізнаними даними. Спершу дізнатися, в якій програмі працює бухгалтерка.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Експорт у Pohoda / Money S3$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Автонагадування клієнту про запитаний документ$q$, $q$Якщо на «Vyžádat doklad» немає відповіді 3 дні — нагадування клієнту (Telegram / e-mail, чеською), через 7 днів — повторне і позначка для бухгалтера. Усе видно в історії запиту.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Автонагадування клієнту про запитаний документ$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї QR-платіжки на податки$q$, $q$До кожного строку податкового календаря — QR Platba (SPAYD): рахунок FÚ (předčíslí-77628XXX/0710 за видом податку), VS = DIČ, сума (з декларації або введена). Сканеш у банку — сплачено без помилок у реквізитах. Плюс посилання «скопіювати реквізити».$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї QR-платіжки на податки$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Telegram: відповісти фото на повідомлення бота$q$, $q$Бот пише «до платежу 1 250 Kč Shell бракує чека» → відповідаєш на це повідомлення фото або PDF → документ сам прив'язується саме до цього платежу (без вибору). Зараз файл приймається, але прив'язка йде через автоматичний пошук.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Telegram: відповісти фото на повідомлення бота$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Очікувані щомісячні рахунки (підписки)$q$, $q$Система вчиться на історії: Booking, Airbnb, Teya, телефон, хостинг, реклама приходять щомісяця. Якщо очікуваного рахунку за місяць немає — нагадування «бракує фактури Booking за вересень». Можна вручну додати/вимкнути постачальника.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Очікувані щомісячні рахунки (підписки)$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї «Скільки відкласти на податки»$q$, $q$Оцінка DPH (вихідна − вхідна з документів) і податку з прибутку за поточними платежами на кінець місяця/кварталу. Віджет на дашборді: «відклади ~X Kč до 25.10». Чітко позначено, що це оцінка, а не декларація.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї «Скільки відкласти на податки»$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Перевірка контрагентів: ARES + реєстр DPH$q$, $q$За IČO з документа — назва й адреса з ARES. Перевірка в реєстрі платників DPH: nespolehlivý plátce і чи рахунок, на який платимо, опублікований (інакше від 270 000 Kč — ručení за чужий DPH). Попередження перед/після платежу.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Перевірка контрагентів: ARES + реєстр DPH$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Нова фірма за 1 хвилину$q$, $q$Вводиш IČO → профіль фірми заповнюється з ARES (назва, адреса, правова форма, дата реєстрації), податковий календар налаштовується сам (DPH за реєстром), створюються рахунки з першої виписки.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Нова фірма за 1 хвилину$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Зв'язок з ALiSiO PMS$q$, $q$Виплати Booking/Airbnb/Teya розбити на бронювання й комісії за даними PMS, документи до виплат (výpis provizí, faktura za provizi) підтягувати автоматично. Для готелів і кемпінгів — без ручних документів до кожної виплати.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Зв'язок з ALiSiO PMS$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Чеська пошта: Seznam, Centrum, інші$q$, $q$IMAP уже працює з будь-якою поштою. Додати пресети (imap.seznam.cz:993, imap.centrum.cz…) і коротку інструкцію, де ввімкнути IMAP і взяти пароль застосунку — щоб підключення було в 2 кліки.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Чеська пошта: Seznam, Centrum, інші$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї OAuth для MCP-конектора$q$, $q$Зараз доступ AI — секретний ключ в адресі конектора (Nastavení → Přístup pro AI). Для SaaS: повноцінний OAuth (вхід через обліковий запис, права по організації), щоб кожен бухгалтер/клієнт підключав свій Claude без ручних ключів.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї OAuth для MCP-конектора$q$);
insert into "Task" (id, "clientId", title, description, status, priority, "createdBy", source, "createdAt", "updatedAt")
select 'idea_' || md5(random()::text || clock_timestamp()::text), 'cmuhg80bf0000128pxrujnx9p', $q$#ідеї Фільтр і мітки в Úkoly$q$, $q$Мітки (#ідеї, #податки, #банк…) і фільтр за ними на сторінці Úkoly, щоб план ідей не змішувався з робочими задачами фірми.$q$, 'pending', 'low', 'accountant', 'ideas', now(), now()
where not exists (select 1 from "Task" where title = $q$#ідеї Фільтр і мітки в Úkoly$q$);
commit;
SQL
sudo -u postgres psql -d alisio_ucetni -tA -c "select count(*) || ' úkolů #ідеї' from \"Task\" where source='ideas'"
