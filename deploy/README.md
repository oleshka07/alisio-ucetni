# Розгортання на Hetzner (той самий сервер, що й ALiSiO PMS)

| Що | Значення |
| --- | --- |
| Сервер | `root@46.225.132.220` |
| Папка | `/root/projects/alisio-ucetni` |
| Порт | `3002` (PMS — 3001) |
| Сервіс | `alisio-ucetni` (systemd) |
| Домен | `ucetni.swipescape.eu` (A-запис → 46.225.132.220) |
| База | Postgres 16 на сервері, БД і користувач `alisio_ucetni` |
| Файли документів | `/var/lib/alisio-ucetni/files` |
| Бекапи | `/root/backups/alisio-ucetni` (30 днів) |

Репозиторій: [github.com/oleshka07/alisio-ucetni](https://github.com/oleshka07/alisio-ucetni) (приватний).

## 1. Deploy key: сервер читає приватний GitHub

На сервері:

```bash
ssh-keygen -t ed25519 -f ~/.ssh/alisio_ucetni_deploy -N "" -C "hetzner-alisio-ucetni"
cat >> ~/.ssh/config <<'EOF'
Host github-ucetni
  HostName github.com
  User git
  IdentityFile ~/.ssh/alisio_ucetni_deploy
  IdentitiesOnly yes
EOF
cat ~/.ssh/alisio_ucetni_deploy.pub
```

Скопіюйте виведений ключ → GitHub → `oleshka07/alisio-ucetni` → **Settings → Deploy keys → Add deploy key**. Назва: `hetzner`. Галочку **Allow write access НЕ ставити**.

Перевірка: `ssh -T github-ucetni` має відповісти «Hi oleshka07/alisio-ucetni! You've successfully authenticated».

## 2. Postgres

```bash
apt-get update && apt-get install -y postgresql postgresql-contrib
DBPASS=$(openssl rand -hex 16); echo "DB password: $DBPASS"
sudo -u postgres psql -c "CREATE USER alisio_ucetni WITH PASSWORD '$DBPASS';"
sudo -u postgres psql -c "CREATE DATABASE alisio_ucetni OWNER alisio_ucetni;"
```

Якщо Postgres на сервері вже є — пропустіть `apt-get` і просто створіть користувача й базу.

## 3. Код і .env

```bash
mkdir -p /root/projects /var/lib/alisio-ucetni/files
cd /root/projects
git clone github-ucetni:oleshka07/alisio-ucetni.git alisio-ucetni
cd alisio-ucetni
cp .env.example .env && chmod 600 .env
```

Заповнити `.env` (`nano .env`). Секрети згенерувати й вставити:

```bash
for k in AUTH_SECRET ENCRYPTION_KEY CRON_SECRET TELEGRAM_WEBHOOK_SECRET; do
  sed -i "s|^$k=.*|$k=\"$(openssl rand -hex 32)\"|" .env
done
sed -i "s|ПАРОЛЬ_БД|$DBPASS|g" .env
```

Токени вставити вручну, не в чат:

```bash
nano .env   # TELEGRAM_BOT_TOKEN="123456:AA…", TELEGRAM_BOT_USERNAME="назва_бота", OPENAI_API_KEY="sk-…"
            # BOOTSTRAP_OWNER_PASSWORD — тимчасовий пароль для першого входу
```

> ⚠️ `ENCRYPTION_KEY` після першого збереження скриньок **не міняти** — інакше збережені паролі пошти не розшифруються.

## 4. Сервіс, nginx, HTTPS

```bash
cp deploy/alisio-ucetni.service /etc/systemd/system/
systemctl daemon-reload && systemctl enable alisio-ucetni
bash deploy/deploy.sh            # npm ci → migrate → build → restart

cp deploy/nginx.conf /etc/nginx/sites-available/ucetni.swipescape.eu
ln -s /etc/nginx/sites-available/ucetni.swipescape.eu /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx
certbot --nginx -d ucetni.swipescape.eu
```

Якщо PMS стоїть за Caddy чи іншим проксі, а не nginx, додайте туди аналогічний reverse proxy на `127.0.0.1:3002`.

## 5. Фонові задачі і бекап

```bash
crontab -e     # вставити вміст deploy/crontab.txt
```

## 6. Перший вхід

1. Відкрийте `https://ucetni.swipescape.eu` і увійдіть з `BOOTSTRAP_OWNER_EMAIL` / `BOOTSTRAP_OWNER_PASSWORD`. Власник створиться автоматично.
2. Одразу змініть пароль: **Nastavení → Změna hesla**. Після цього `BOOTSTRAP_OWNER_PASSWORD` можна видалити з `.env`.
3. **Nastavení → Telegram → Nastavit webhook**, потім **Připojit Telegram**. Бот відкриється, натисніть Start.
4. Клієнти → додайте або перевірте **Swipe Scape s.r.o.**: IČO, DIČ, датова схранка (ID). За IČO система розуміє, вхідна це фактура чи видана. За ID схранки — до якої компанії належить сповіщення.
5. **Bankovní účty** → додайте KB і ČS: джерело «E-mail (CAMT.053)», скринька `vypisy@swipescape.eu`, фільтр відправника (наприклад `kb.cz|csas.cz`). Натисніть **Test**, потім **Načíst**.
6. **E-mailové schránky** → додайте `o.stepeniev@swipescape.eu` у режимі **«Hlavní pošta: datové schránky + faktury»**.
7. **Uživatelé** → створіть акаунт бухгалтерки (роль «Účetní») і передайте їй логін і пароль.

## Пошта: IMAP

- Google Workspace: сервер `imap.gmail.com`, порт 993. Потрібен **пароль застосунку**: myaccount.google.com → Безпека → Паролі застосунків (працює лише з увімкненою двоетапною перевіркою).
- Інший хостинг пошти: IMAP-сервер беріть із налаштувань провайдера, порт 993 (SSL).
- Для основної скриньки краще окремий пароль застосунку, щоб його можна було відкликати, не міняючи основний.

## Банки: виписка на пошту у форматі CAMT.053

- **KB** (MojeBanka Business / KB+): Nastavení → Výpisy → Elektronické výpisy e-mailem, формат **XML (CAMT.053)**, щоденно, адреса `vypisy@swipescape.eu`.
- **Česká spořitelna** (George Business / BUSINESS 24): Výpisy → Zasílání výpisů e-mailem, формат **camt.053**, щоденно.

Назви пунктів меню залежать від версії інтернет-банку. Потрібні три речі: формат CAMT.053 (XML), доставка e-mailом і щоденна періодичність.

## Корисне

```bash
journalctl -u alisio-ucetni -f                   # логи застосунку
tail -f /var/log/alisio-ucetni-cron.log          # фонові задачі
bash deploy/cron.sh sync                         # запустити синхронізацію вручну
```

## Автодеплой з GitHub (опційно)

1. На сервері: `ssh-keygen -t ed25519 -f ~/.ssh/gh_actions -N ""`, потім `cat ~/.ssh/gh_actions.pub >> ~/.ssh/authorized_keys`.
2. GitHub → `oleshka07/alisio-ucetni` → Settings → Secrets and variables → Actions:
   - Secrets: `HETZNER_HOST` = `46.225.132.220`, `HETZNER_SSH_KEY` = вміст `~/.ssh/gh_actions` (приватний).
   - Variables: `DEPLOY_ENABLED` = `true`.
3. Кожен push у `main` → перевірки (типи, тести, збірка) → `deploy/deploy.sh` на сервері.
