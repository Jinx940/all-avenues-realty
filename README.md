# All Avenues Realty

Workspace web app for properties, jobs, workers, receipts, invoices and quotes.

## Stack

- Frontend: React 19 + TypeScript + Vite
- Backend: Express 5 + TypeScript + Prisma
- Database: PostgreSQL

## Quick Start

1. Install dependencies:
   - `npm install`
   - `npm install --prefix frontend`
   - `npm install --prefix backend`
2. Create env files:
   - copy `backend/.env.example` to `backend/.env`
   - copy `frontend/.env.example` to `frontend/.env` only if you want to force a custom API URL
3. Generate the Prisma client:
   - `npm run prisma:generate`
4. Apply the database schema:
   - local development: `npm run db:migrate`
   - quick sync only: `npm run db:push`
5. Seed default properties and workers:
   - `npm run db:seed`
6. Create the first admin account explicitly:
   - `npm run admin:bootstrap -- --username admin --password change-me --display-name "System Administrator"`
7. Start the workspace:
   - `npm run dev`

## Quality Gates

- `npm run lint`
- `npm run test`
- `npm run build`
- `npm run check`

## Security Notes

- Session auth now uses an `HttpOnly` cookie instead of `localStorage`.
- Uploaded files are served through authenticated API routes instead of a public `/uploads` folder.
- Generated document HTML is sanitized and returned with restrictive security headers.
- The application no longer creates a predictable admin account on startup.

## Project Scripts

- `npm run dev`: runs frontend and backend together
- `npm run lint`: frontend + backend lint
- `npm run test`: backend unit tests
- `npm run build`: production build for frontend and backend
- `npm run db:migrate`: Prisma development migration
- `npm run db:migrate:deploy`: Prisma deployment migration
- `npm run db:seed`: seeds default properties and workers
- `npm run admin:bootstrap -- --username <user> --password <pass>`: creates the first admin explicitly
