# Alisio Účetnictví

Чек-лист «Задачі Олега»: проєкт `ucetni`

- Застосунок: Next.js 15 + Prisma/Postgres, Hetzner `46.225.132.220`, https://ucetni.rozum.one (порт 3012, systemd `alisio-ucetni`).
- Деплой і сервісні дії: GitHub Actions workflow `ops` → скрипти `deploy/ops/*.sh` (логи публічні — секрети не друкувати).
- Не чіпати PMS (`alisio-pms`, порт 3001) та інші проєкти на сервері.
- Перед пушем: `npx tsc --noEmit`, `npm test`, `npm run build`.
- Податкові правила: `docs/tax-calendar-rules.md`. План SaaS: `docs/saas-architecture.md`.
