# Sherubtse Pass Application Portal

A small full-stack CSP301 backend project inspired by the Campus Eats Express MVC structure. It uses Node.js, Express, PostgreSQL, REST API endpoints, a responsive browser UI, JWT authentication and role-based access for **Student, DSA and SSO**.

## What is included
- Single login page with Student, Dean of Student Affairs (DSA), and Student Service Officer (SSO) account type selection.
- Student registration collects the student's name, student number, email, and password; public registration can create **student accounts only**.
- After registration, students complete their profile with course/programme, year of study, timetable section when applicable, and hostel before they can apply for leave.
- Profile editing uses dropdowns for programmes, Years 1–4, and the supplied hostel list. Section A/B is offered for Life Sciences Years 1–3 and DSDA Years 1–4, matching the published Autumn 2026 timetable.
- SSO and DSA can see each student's course, year, section, and hostel in the student register and leave-request details.
- Emergency requests are highlighted and prioritized at the top of both staff review queues.
- Student dashboard to apply for leave, track status/history, check leave quota, and cancel pending requests.
- DSA dashboard for final review, student leave-quota maintenance, and documented overrides for emergency requests that exceed quota.
- SSO dashboard for first-stage review before DSA approval.
- Password hashing with bcrypt and signed JWT authentication.
- PostgreSQL setup scripts, database schema, Postman examples and API status indicator.
- Validation for invalid dates, end date before start date, overlapping active requests, and leave quota.
- Audit history recording reviewer, decision, comment and time.

## Workflow and rules
1. Student registers with their name, student number, email, and password, signs in, and completes their course/programme, year, section where listed in the timetable, and hostel profile.
2. After saving a complete profile, the student submits leave type, start date, end date and reason.
3. API checks dates and overlapping requests. Attendance is informational only; normal requests must fit the remaining leave quota.
4. New requests go to SSO first (`pending_sso`); SSO approval forwards them to DSA (`pending_dsa`).
5. Emergency requests are prioritized for both SSO and DSA review. DSA records the final decision. Rejections require a comment. Emergency requests may exceed quota, but final DSA approval requires a separate override justification recorded in `approvals`.
6. Students can view and cancel their own pending requests. Every decision and cancellation is recorded in `approvals`.
7. Final approval transfers reserved days to `leave_balance.used_days`; approved emergency overrides may leave usage above the normal quota.

**Attendance note:** The supplied timetable is a published schedule, not a record of classes actually taught or student attendance. The portal therefore does not calculate attendance or block leave based on it. Module-level attendance enforcement requires a reliable attendance register and actual class-delivery data. Confirm the leave allowance and emergency approval policy with the college before production use.

## Requirements
- Node.js 18+ (20+ recommended)
- PostgreSQL 14+
- VS Code or another editor

## Install and run locally
1. Extract the ZIP and open this project folder in VS Code.
2. Copy `.env.example` to `.env`.
3. Set `DB_USER` and `DB_PASS` to your PostgreSQL login. Set a long, random `JWT_SECRET` (at least 32 characters). Leave `DB_HOST=localhost`, `DB_PORT=5432`, and `DB_SSL=false` for a standard local install.
4. Ensure PostgreSQL is running.
5. In the project terminal run:

```bash
npm install
npm run db:setup
npm run db:seed-staff
npm run dev
```

6. Visit `http://localhost:3000`.

`npm run db:setup` connects to the maintenance database configured by `DB_ADMIN_DATABASE` (default `postgres`) and creates `sherubtse_pass_portal` if needed, then creates/migrates the schema. The PostgreSQL account must have `CREATEDB` privileges. If not, create the database `sherubtse_pass_portal` in pgAdmin first, then run `npm run db:schema`.

### Set up DSA and SSO accounts
In `.env`, set these to unique college-controlled email addresses and strong passwords (12+ characters):

```env
DSA_EMAIL=dsa@your-college-domain
DSA_PASSWORD=your_long_unique_DSA_password
SSO_EMAIL=sso@your-college-domain
SSO_PASSWORD=your_different_long_unique_SSO_password
```

Then run `npm run db:seed-staff`. This script creates or updates those staff accounts and hashes their passwords. Keep `.env` private; do not commit it or share real staff credentials. If you leave those variables unset, staff accounts are skipped. **Do not add a public DSA/SSO registration form.**

### First student account
Open the portal and choose **Student registration**. The new student receives a default 10-day allowance and 100% attendance for demo purposes. DSA can update attendance and total leave days in the attendance register. This default is illustrative, not an official college policy.

## API endpoints
All protected endpoints require `Authorization: Bearer <token>`.

| Method | Endpoint | Access | Purpose |
|---|---|---|---|
| GET | `/api/health` | Public | API and database health |
| POST | `/api/auth/register` | Public | Register student account only |
| POST | `/api/auth/login` | Public | Sign in and receive JWT |
| GET | `/api/auth/me` | Signed-in users | Current token identity |
| POST | `/api/leave-requests` | Student | Submit leave request |
| GET | `/api/leave-requests` | Signed-in users | List role-visible requests |
| GET | `/api/leave-requests/:id` | Signed-in users | Request details and history; students can only see their own |
| PATCH | `/api/leave-requests/:id` | Student | Update a request awaiting DSA review |
| POST | `/api/leave-requests/:id/decision` | DSA or SSO | Approve/reject at the assigned stage |
| POST | `/api/leave-requests/:id/cancel` | Student or DSA | Cancel eligible pending request |
| GET | `/api/leave-balance` | Student | View own leave balance |
| GET | `/api/students` | DSA/SSO | View student records |
| GET | `/api/students/:studentId/leave-balance` | DSA/SSO | View a student's balance |
| PATCH | `/api/students/:studentId` | DSA | Update attendance and/or total leave days |

Login body example:
```json
{"email":"student@example.com","password":"your-password","role":"student"}
```
Register body example:
```json
{"fullName":"Demo Student","studentNumber":"STU-001","email":"student@example.com","password":"strong-password"}
```
Decision body example:
```json
{"decision":"approved","comment":"Reviewed and approved."}
```

## Database
- `users`: accounts, hashed passwords, role and attendance percentage.
- `leave_requests`: leave dates, reason, type and current status.
- `approvals`: append-only decision/cancellation history with reviewer, role, comment and timestamp.
- `leave_balance`: total days and used days per student.

The schema file is `sql/schema.sql`. `scripts/create-database.js` creates the database; `scripts/init-schema.js` runs the schema. The app's PostgreSQL connection is configured in `config/db.js`.

## Important limitation
A ZIP cannot create a database on your personal computer until you run the setup commands against your installed PostgreSQL server. This environment cannot access your local PostgreSQL service or verify your credentials. The package includes the scripts and configuration to create the database and connect the app on your machine.

Before real college deployment, add an administrator-controlled staff provisioning procedure, enforce HTTPS, review the college's exact approval policy, and have the college approve data retention/privacy and attendance integration requirements. The attendance values in this project are manually managed; it does not connect to a college attendance system.


## Email verification and updated approval sequence

Student registration now sends a verification link to the registered email address. Students cannot log in until they open the link. Verification links expire after 24 hours. Existing accounts remain verified so existing users are not locked out.

Add the following settings to your local `.env` file (do not replace your database or JWT settings):

```env
# SMTP is the default provider for local development.
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-google-app-password
MAIL_FROM=Sherubtse Pass Portal <your-email@gmail.com>
APP_URL=http://localhost:3000
# Optional: set this to the reachable origin of the Express API when it differs from APP_URL.
API_URL=https://your-backend.example.com
```

Verification links use `API_URL` when set, then fall back to `APP_URL`. The link host must serve this Express API, including `GET /api/auth/verify-email`; a frontend-only host will return “Cannot GET”. For local testing, keep `APP_URL=http://localhost:3000` and open the email on the same computer running the server. If changing the host, request a new verification email because existing links retain their original host and expire after 24 hours.

### Use Google Apps Script email on Render Free

Render Free blocks outbound SMTP connections on common SMTP ports. The optional `apps-script` provider sends email over HTTPS and uses the Google account that owns the script.

1. Sign in to the Google account that should send verification emails and open [script.google.com](https://script.google.com). Create a new project.
2. Open `apps-script/Code.gs` in VS Code and copy its contents into the Apps Script editor.
3. In **Project Settings → Script Properties**, add `APPS_SCRIPT_MAIL_SECRET` and set it to a long, random value. Use the same value in Render; do not share or commit it.
4. Click **Deploy → New deployment → Web app**. Set **Execute as** to yourself and access to **Anyone**, then deploy and authorize the requested Gmail permission. “Anyone” is needed so Render can call the web app; the script checks the shared secret before sending. Copy the deployed URL ending in `/exec`.
5. In Render → your service → **Environment**, add `EMAIL_PROVIDER=apps-script`, `APPS_SCRIPT_MAIL_URL` set to the `/exec` URL, and `APPS_SCRIPT_MAIL_SECRET` set to the same secret from Script Properties. Keep `API_URL` set to the Render API origin so verification links point back to this app. Save and redeploy.
6. Register a test account or use **Resend verification email**. Check the Apps Script **Executions** page if sending fails. After changing the script, update the deployment to a new version.

Apps Script sends from the Google account that owns the web app, not an arbitrary `MAIL_FROM` address. Consumer Google accounts currently have a daily recipient quota; quotas can change. Check the college’s policies before sending student information through a personal account. For local SMTP, use a Google App Password, not your regular password.

The review sequence is now: Student submits → SSO first review (`pending_sso`) → DSA final review (`pending_dsa`) → Approved. Rejections remain final. Existing pending requests are migrated once to the corresponding new review stage.
