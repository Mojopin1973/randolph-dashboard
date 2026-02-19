# Deployment Guide

## Vercel (Recommended)

### 1. Push to GitHub
Already done — repo at `github.com/Mojopin1973/randolph-dashboard`.

### 2. Connect to Vercel
1. Go to [vercel.com](https://vercel.com) and sign in with GitHub.
2. Click **"Add New..."** → **"Project"**.
3. Import the `randolph-dashboard` repository.

### 3. Configure Environment Variables (CRITICAL)

| Name | Value |
|------|-------|
| `ODOO_URL` | `https://your-odoo-instance.com` |
| `ODOO_DB` | `your-database-name` |
| `ODOO_USERNAME` | `your-email@example.com` |
| `ODOO_PASSWORD` | `your-api-key-or-password` |
| `ODOO_CUSTOMER_REF` | `your-customer-ref-code` |

### 4. Deploy
Click **"Deploy"**. Within a minute or two, you will get a live URL (e.g., `https://randolph-dashboard.vercel.app`).

---

## Self-Hosted

```bash
npm run build
npm start
```

Ensure environment variables are set on the server.

---

## Security Note
- The deployed URL is public by default. Consider adding authentication for private use.
- Ensure the Odoo user has only minimum required permissions (read-only access to Invoices/Sales).
