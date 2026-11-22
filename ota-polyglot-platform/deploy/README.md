# Production deploy

One Hostinger KVM 2 server runs the storefront, the booking engine, Postgres, and Redis with Docker Compose. GitHub Actions builds the images and restarts the containers. Kubernetes is not part of this setup.

After the discount ends the server renews at $14.99 a month. The domain is about $10–15 a year. Cloudflare, GitHub Actions, and the container registry stay at $0 for this size. Off-server database copies are about $0–1 a month. Sabre and Hajee invoices are separate.

## What gets deployed

| Piece | Where it listens |
|---|---|
| Caddy | Public ports 80 and 443 |
| frontend-b2c | Docker network only, port 3001 |
| core-engine | Docker network only. Caddy forwards `/api/v1/payments/sslcommerz/` so SSLCommerz can confirm a payment |
| Postgres 16 | Docker volume on this server. Not published |
| Redis 7 | Docker network only. Search cache, 256 MB |

`frontend-nextjs` and `ai-engine` are not in `docker-compose.prod.yml`.

## 1. Prepare the server

Use the **Singapore** or **India** data center and **Ubuntu 26.04 LTS**. Ubuntu 24.04 LTS is fine if 26.04 is not in the list.

SSH in as root and install Docker:

```bash
apt-get update
apt-get install -y ca-certificates curl ufw unattended-upgrades
install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
chmod a+r /etc/apt/keyrings/docker.asc
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
apt-get update
apt-get install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
dpkg-reconfigure -plow unattended-upgrades
```

Create the deploy user and the app directory:

```bash
adduser --disabled-password --gecos "" deploy
usermod -aG docker deploy
mkdir -p /opt/aerotake/certs /opt/aerotake/deploy /opt/aerotake/scripts
chown -R deploy:deploy /opt/aerotake
```

Put your SSH public key in `/home/deploy/.ssh/authorized_keys`.

## 2. Firewall

Allow SSH only from your own IP. Allow 80 and 443 only from [Cloudflare's IP ranges](https://www.cloudflare.com/ips/). Do not open 5432, 6379, 8080, 8081, or 3001.

On the server, replace `YOUR.IP.ADDRESS` and run:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow from YOUR.IP.ADDRESS to any port 22 proto tcp
while read -r cidr; do
  ufw allow from "$cidr" to any port 80 proto tcp
  ufw allow from "$cidr" to any port 443 proto tcp
done < <(curl -fsS https://www.cloudflare.com/ips-v4)
while read -r cidr; do
  ufw allow from "$cidr" to any port 80 proto tcp
  ufw allow from "$cidr" to any port 443 proto tcp
done < <(curl -fsS https://www.cloudflare.com/ips-v6)
ufw enable
```

Set the same rules in the Hostinger firewall panel. Re-run the Cloudflare loops when Cloudflare publishes new ranges.

## 3. Cloudflare

1. Add the domain and switch the nameservers to Cloudflare.
2. Create a DNS A record for the site pointing at the server's IPv4. Turn the proxy on (orange cloud).
3. SSL/TLS mode: **Full (strict)**. Turn on **Always Use HTTPS**.
4. Create an Origin Certificate (SSL/TLS → Origin Server). Save the certificate as `/opt/aerotake/certs/origin.pem` and the key as `/opt/aerotake/certs/origin.key`. Mode `600`, owner `deploy`. Include the hostname you will put in `SITE_ADDRESS`.
5. In Turnstile, create a widget for that hostname. The local test keys must not be used here.

Send `www` to the apex with a Cloudflare redirect rule, and put only the apex in `SITE_ADDRESS`.

## 4. Secrets on the server

On your laptop, from `ota-polyglot-platform`:

```bash
cp deploy/env.example /tmp/aerotake.env
```

Delete the blank `JWT_SIGNING_KEYS`, `SERVICE_CLIENTS`, `FRONTEND_B2B_SERVICE_SECRET`, and `FRONTEND_B2C_SERVICE_SECRET` lines from that copy so the generated lines are the only ones. Then append the keys. The tenant id here has to be the same one you register in step 5.

```bash
printf "JWT_SIGNING_KEYS='%s'\n" "$(scripts/generate-jwt-keys.sh)" >> /tmp/aerotake.env
scripts/generate-service-clients.sh --b2c-tenant aerotake-b2c >> /tmp/aerotake.env
```

Fill the remaining values. Set `STOREFRONT_PUBLIC_URL` and `SSLCOMMERZ_CORE_PUBLIC_URL` to `https://` your domain. Leave `SITE_URL` empty until the site loads through Cloudflare. Use an alphanumeric `POSTGRES_PASSWORD`.

The storefront is allowed to trust `X-Forwarded-For` because Caddy overwrites it with Cloudflare's `CF-Connecting-IP`. Leave `TRUSTED_PROXY_NETWORKS` empty so core-engine keeps its default (loopback and private networks), which includes the Docker bridge.

Copy the file and lock it down:

```bash
scp /tmp/aerotake.env deploy@SERVER:/opt/aerotake/.env
ssh deploy@SERVER 'chmod 600 /opt/aerotake/.env'
rm /tmp/aerotake.env
```

Log the server into the container registry once. Use a GitHub personal access token with `read:packages`:

```bash
ssh deploy@SERVER
docker login ghcr.io -u YOUR_GITHUB_USER
```

In the GitHub repository settings, set Actions permissions to **Read and write** so the workflow can push images.

Add these Actions secrets:

| Secret | Value |
|---|---|
| `DEPLOY_HOST` | Server IPv4 |
| `DEPLOY_USER` | `deploy` |
| `DEPLOY_SSH_KEY` | Private key that matches the deploy user's `authorized_keys` |

App secrets stay in `/opt/aerotake/.env`. They are not GitHub secrets.

## 5. First deploy

Merging these files does not build images by itself, because the application source did not change. Open **Actions → Deploy → Run workflow** on `main` and leave both build boxes checked.

The workflow tests what it builds, pushes `ghcr.io/<owner>/aerotake-core-engine:<git-sha>` and `ghcr.io/<owner>/aerotake-frontend-b2c:<git-sha>`, then SSHs to the server. `deploy/deploy.sh` checks core-engine `http://127.0.0.1:8080/healthz` from inside the container. It checks the public homepage only when `SITE_URL` is set. If either check fails, it starts the previous image tags again.

When the homepage loads, set `SITE_URL=https://your-domain` in `/opt/aerotake/.env`.

Register the live host (sell currency BDT). Run this on the server after the stack is up, with your real host and brand:

```bash
cd /opt/aerotake
set -a && source image-tags.env && set +a
COMPOSE_FILE=docker-compose.prod.yml scripts/provision-tenant.sh \
  --tenant-id aerotake-b2c --name "AeroTake B2C" --currency BDT \
  --host your-domain.example --channel B2C --brand AeroTake \
  --logo /images/verticle_logo_1.png --primary "#0B3D5C" --accent "#F2A104"
```

Confirm from outside your network that ports 5432, 6379, and 8080 do not connect, and that `X-Api-Key: demo-b2b-key` is not accepted. This compose file does not set `ENABLE_DEMO_API_KEYS`, and the storefront only enables demo keys when that variable is `true`.

## 6. Later releases

A pull request runs lint and `next build` when the storefront or the proto changes, `dotnet test` when the booking engine or the proto changes, and `protoc` when `shared/protos/ota.proto` changes. Playwright does not run on pull requests.

A push to `main` that touches the storefront, the booking engine, the proto, or `deploy/` repeats those checks, builds only the images whose paths changed, and restarts the server. Run the workflow by hand when you need to rebuild both images.

To undo a release, on the server:

```bash
cd /opt/aerotake
cp image-tags.env.prev image-tags.env
docker compose --env-file .env --env-file image-tags.env -f docker-compose.prod.yml up -d
```

Take a database dump before a migration that drops or renames columns. With one core-engine container, migrations still apply on startup. Turn that off before you ever run two copies of core-engine.

## 7. Backups and alerts

```bash
chmod 755 /opt/aerotake/deploy/backup.sh
crontab -u deploy -e
```

Add a daily line:

```
15 2 * * * RCLONE_REMOTE=r2:aerotake-backups /opt/aerotake/deploy/backup.sh
```

Leave `RCLONE_REMOTE` unset until `rclone` is logged into Cloudflare R2. The script still writes `/opt/aerotake/backups/ota-*.dump` and deletes copies older than 14 days. A dump that never leaves the server is lost if the disk is lost. Restore one dump onto a spare Postgres once, so you know the file works.

Set `SLACK_WEBHOOK_URL` in `.env` and restart the stack. Add a free uptime check on the homepage.

## Playwright

The browser tests create accounts and bookings. Put a staging URL in the repository variable `B2C_BASE_URL` if you want the nightly run. Otherwise use **Actions → Playwright → Run workflow** and pass a non-production URL.
