# Platform admin

Company admin for both the B2B agency tenant and the B2C storefront. It is a separate Next.js app (`localhost:3002`). The visual shell came from the super-admin mockup. Login, exchange rates, markup rules, and agencies call core. Every other screen still shows sample data.

Sign in as a platform admin for one tenant at a time:

| Tenant | Email |
|---|---|
| `demo-tenant` (B2B) | `admin@skybridge.example` |
| `aerotake-b2c` (B2C) | `admin@aerotake-b2c.example` |

Local development uses the seeded device token `dev-admin-device` and the password from the core seeder. Agency staff and customers are refused.

```bash
npm run dev
```
