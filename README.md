# Jadok — Doctor Schedule Manager

Web app for managing and publishing doctor schedules in Indonesian healthcare/clinic environments.

## Features

**Two user roles:**
- **HUMAS** — admin: manage users, departments, doctors, export schedule, and can also input schedules
- **PERAWAT** — input daily schedules
- **Public viewer** — display today's schedule (no login required)

**Key capabilities:**
- Local-first SQLite database (no cloud dependencies)
- Visual template editor with drag/drop zones
- Export schedule images as PNG for social media
- Real-time public display for lobby/kiosk screens

## Quick Start

```bash
# Install
npm install

# Run (starts both API + frontend)
npm run dev
```

Open **http://localhost:5173**

**Create first admin:**
```bash
node scripts/create-admin.mjs admin secret123
```

Or use default credentials (admin/admin123):
```bash
node scripts/create-admin.mjs
```

## Stack

- React + TypeScript + Vite
- Express API + SQLite
- Tailwind CSS

## Data Storage

```
data/jadok.sqlite     # Database
data/uploads/         # Template images
```

Configure via `.env` (see `.env.example`)

## Scripts

```bash
npm run dev        # Start everything
npm run build      # Production build
npm run test:api   # Run tests
```

## License

MIT

---

**Crafted by [xxrepp](https://github.com/xxrepp)**
