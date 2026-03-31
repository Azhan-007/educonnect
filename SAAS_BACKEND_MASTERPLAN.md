# EduConnect — SaaS Backend Master Plan

> **Status**: Product Mode — Building to Launch & Sell  
> **Created**: February 2026  
> **Last Updated**: February 27, 2026  
> **Architecture**: Fastify + Firebase Admin + Firestore + Razorpay + Multi-Tenant  
> **Clients**: Next.js Web Panel + React Native Mobile App  
> **Backend**: 82 source files, 0 TypeScript errors  
> **Tests**: 141 tests, 6 suites, 81% line coverage

---

## Current State Assessment

### What Exists (Backend — `apps/backend/`)
| Area | Status | Details |
|------|--------|---------|
| Student CRUD | ✅ Partial | Create, List, Get, Soft-Delete. **No Update.** |
| Teacher CRUD | ✅ Partial | Create, List, Get, Soft-Delete. **No Update.** |
| Attendance | ✅ Partial | Single mark + list by date. No bulk, no update/delete. |
| Auth Middleware | ✅ Done | Firebase ID token verification |
| Tenant Isolation | ✅ Done | Server-side schoolId from user doc |
| RBAC | ✅ Done | Role middleware factory |
| Subscription Enforcement | ✅ Basic | Student creation gated by plan limits |
| Razorpay Payments | ✅ Done | Order creation + webhook (payment.captured) |
| Webhook Failure Handling | ✅ Done | Persist failures + manual retry |
| Audit Logging | ✅ Basic | Fire-and-forget to Firestore |
| Zod Validation | ✅ Done | Student, Teacher, Attendance schemas |
| Rate Limiting | ✅ Basic | 100/min per IP (global) |
| Logging | ✅ Basic | Pino (Fastify built-in) |
| Storage Helpers | ✅ Done | Tenant-scoped upload/delete |

### What's Missing (Remaining Gaps)
| Gap | Impact | Priority |
|-----|--------|----------|
| ~~No plan upgrade/downgrade API~~ | ✅ Fixed (Feb 27) — POST /subscriptions/change-plan + preview | ~~High~~ |
| ~~No OpenAPI/Swagger auto-docs~~ | ✅ Fixed (Feb 27) — @fastify/swagger at /api/docs | ~~Medium~~ |
| No caching layer | ✅ Fixed (Feb 27) — node-cache plugin with 5 namespaces, TTL-based, integrated in auth + subscription middleware | ~~Medium~~ |
| ~~No CI/CD pipeline~~ | ✅ Fixed (Feb 27) — GitHub Actions for all 3 apps | ~~Medium~~ |
| ~~No email/SMS sending~~ | ✅ Fixed (Feb 27) — SendGrid wired + email templates + worker triggers | ~~Low~~ |
| ~~Hardcoded default password~~ | ✅ Fixed (Feb 27) — requirePasswordChange flag + POST /auth/change-password | ~~Low~~ |

### Frontend State (Web Panel)
- ✅ **All 15 feature pages** now call the real backend API (migration complete)
- ✅ All 10 demo-mode services rewritten to use `apiFetch()` with API response envelope auto-unwrap
- ✅ Students, Teachers, Attendance were already migrated (3 services)
- ✅ Remaining 10 services migrated: Classes, Events, Fees, Library, Results, Timetable, Settings, Dashboard, Schools, Subscriptions
- ✅ Export service is pure utility (no data fetching needed)
- ✅ Real-time updates via 30-second polling (replacing demo store subscriptions)
- ✅ 0 TypeScript compile errors in migrated frontend code
- `demoDataStore.ts` retained but no longer referenced by any service

---

## Architecture Target

```
                    ┌─────────────────────────────────────┐
                    │            Clients                   │
                    │  ┌──────────┐    ┌───────────────┐  │
                    │  │ Web Panel│    │  Mobile App    │  │
                    │  │ (Next.js)│    │ (React Native) │  │
                    │  └────┬─────┘    └──────┬────────┘  │
                    └───────┼─────────────────┼───────────┘
                            │                 │
                     ┌──────▼─────────────────▼──────┐
                     │   API Gateway (Fastify)        │
                     │   /api/v1/*                    │
                     │   ┌─────────────────────────┐  │
                     │   │  Middleware Pipeline     │  │
                     │   │  Request ID → Logger →   │  │
                     │   │  Auth → Tenant → RBAC →  │  │
                     │   │  Rate Limit → Validate   │  │
                     │   └─────────────────────────┘  │
                     │                                 │
                     │   ┌──────────┐ ┌─────────────┐ │
                     │   │  Routes   │ │  Schemas    │ │
                     │   │  (HTTP)   │ │  (Zod)      │ │
                     │   └────┬──────┘ └─────────────┘ │
                     │        │                         │
                     │   ┌────▼──────────────────────┐  │
                     │   │   Controllers (thin)      │  │
                     │   │   Request → Response map  │  │
                     │   └────┬──────────────────────┘  │
                     │        │                         │
                     │   ┌────▼──────────────────────┐  │
                     │   │   Services (business)     │  │
                     │   │   Validation + Logic      │  │
                     │   └────┬──────────────────────┘  │
                     │        │                         │
                     │   ┌────▼──────────────────────┐  │
                     │   │   Repositories (data)     │  │
                     │   │   Firestore abstraction   │  │
                     │   └───────────────────────────┘  │
                     └─────────────────────────────────┘
                                      │
              ┌───────────────────────┼────────────────────────┐
              │                       │                        │
     ┌────────▼──────┐    ┌──────────▼────────┐   ┌──────────▼──────┐
     │   Firestore    │    │  Firebase Auth     │   │  Cloud Storage   │
     │   (Database)   │    │  (Identity)        │   │  (Files)         │
     └───────────────┘    └───────────────────┘   └─────────────────┘
                                      │
                          ┌───────────▼───────────┐
                          │   Background Workers   │
                          │   (node-cron / BullMQ)  │
                          │   • Subscription expiry │
                          │   • Webhook retry       │
                          │   • Usage snapshots     │
                          │   • Notification sender │
                          └───────────────────────┘
```

---

## Phase 0 — Foundation Hardening (Week 1-2) ✅ COMPLETE
> Make the existing code production-grade before adding features

### 0.1 API Versioning
**All routes move under `/api/v1/`**

```
Before: POST /students
After:  POST /api/v1/students
```

- Create `src/routes/v1/` directory
- Register all routes under `/api/v1` prefix
- Add version header: `X-API-Version: 1`
- Frontend `api.ts` updates `BASE_URL` to include `/api/v1`

### 0.2 Centralized Error System

```typescript
// src/errors/AppError.ts
export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,        // Machine-readable: STUDENT_LIMIT_REACHED
    public message: string,     // Human-readable
    public details?: unknown    // Validation errors, context
  ) {
    super(message);
  }
}

// Standard error codes:
// AUTH_TOKEN_MISSING, AUTH_TOKEN_INVALID, AUTH_USER_DISABLED
// TENANT_MISSING, TENANT_MISMATCH  
// ROLE_UNAUTHORIZED
// SUBSCRIPTION_EXPIRED, SUBSCRIPTION_LIMIT_REACHED
// RESOURCE_NOT_FOUND, RESOURCE_ALREADY_EXISTS
// VALIDATION_ERROR
// PAYMENT_FAILED, PAYMENT_DUPLICATE
// RATE_LIMIT_EXCEEDED
// INTERNAL_ERROR
```

Standardized response envelope:

```json
// Success
{ "success": true, "data": {...}, "meta": { "requestId": "..." } }

// Error  
{ "success": false, "error": { "code": "STUDENT_LIMIT_REACHED", "message": "...", "details": {} }, "meta": { "requestId": "..." } }

// List
{ "success": true, "data": [...], "pagination": { "cursor": "...", "hasMore": true, "total": 150 }, "meta": { "requestId": "..." } }
```

### 0.3 Request Context (Request ID + Logging)

```typescript
// Every request gets:
// - Unique requestId (UUID v4)
// - Start timestamp
// - Structured logging with requestId, userId, schoolId, duration
// - Response includes X-Request-Id header

// src/plugins/requestContext.ts
fastify.decorateRequest('requestId', '');
fastify.addHook('onRequest', (request, reply, done) => {
  request.requestId = request.headers['x-request-id'] || crypto.randomUUID();
  reply.header('X-Request-Id', request.requestId);
  request.log = request.log.child({ requestId: request.requestId });
  done();
});
```

### 0.4 Pagination System

```typescript
// src/utils/pagination.ts
interface PaginationParams {
  limit: number;     // default 20, max 100
  cursor?: string;   // Firestore doc ID for cursor-based
  sortBy?: string;   // field name
  sortOrder?: 'asc' | 'desc';
}

interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    cursor: string | null;
    hasMore: boolean;
    total?: number;      // Only when explicitly requested (?count=true)
    limit: number;
  };
}

// Applied to ALL list endpoints
// GET /api/v1/students?limit=20&cursor=abc123&sortBy=name&sortOrder=asc
```

### 0.5 Update Endpoints (PATCH)

Add missing PATCH routes:
- `PATCH /api/v1/students/:id` — Partial update with Zod partial schema
- `PATCH /api/v1/teachers/:id` — Partial update with Zod partial schema
- Both must validate schoolId ownership, log audit event

### 0.6 Search & Filtering

```
GET /api/v1/students?search=john&classId=10A&section=A&status=active
GET /api/v1/teachers?search=sharma&subject=math&status=active
GET /api/v1/attendance?date=2026-02-23&classId=10A&section=A
```

- Server-side Firestore queries with composite indexes
- Search by name (case-insensitive prefix match using Firestore array-contains or >= / < range)

### 0.7 Fix Critical Security Issues

1. **Remove `.env` from git** — add to `.gitignore`, create `.env.example`
2. **Force password change** — mark student accounts requiring password reset
3. **Exempt webhooks from rate limiting** — separate rate limit config for webhook routes
4. **Add request body size limits** — `bodyLimit: 1048576` (1MB default)
5. **Add Helmet-equivalent headers** — security headers via Fastify plugin
6. **Strict CORS** — whitelist specific origins instead of `*`

---

## Phase 1 — Complete Feature Modules (Week 3-6) ✅ COMPLETE
> Build all missing backend modules that frontend expects

### Architecture per Module

Each module follows the same pattern:
```
src/
  routes/v1/{module}.ts       — HTTP layer, middleware chain, response mapping
  schemas/{module}.schema.ts   — Zod validation schemas (create, update, query)
  services/{module}.service.ts — Business logic, cross-service calls
  repositories/{module}.repo.ts — Firestore queries (new layer)
```

### 1.1 Classes Module
```
POST   /api/v1/classes              — Create class (Admin+)
GET    /api/v1/classes              — List classes for school
GET    /api/v1/classes/:id          — Get class details with sections
PATCH  /api/v1/classes/:id          — Update class
DELETE /api/v1/classes/:id          — Soft-delete class
POST   /api/v1/classes/:id/sections — Add section to class
DELETE /api/v1/classes/:id/sections/:sectionId — Remove section
```

### 1.2 Events Module
```
POST   /api/v1/events               — Create event
GET    /api/v1/events               — List events (?upcoming=true&type=holiday)
GET    /api/v1/events/:id           — Get event
PATCH  /api/v1/events/:id           — Update event
DELETE /api/v1/events/:id           — Soft-delete event
```

### 1.3 Fees Module
```
POST   /api/v1/fees                  — Create fee record
GET    /api/v1/fees                  — List fees (?studentId=&status=pending)
GET    /api/v1/fees/:id              — Get fee details
PATCH  /api/v1/fees/:id              — Update fee (mark paid, etc.)
DELETE /api/v1/fees/:id              — Soft-delete fee
GET    /api/v1/fees/stats            — Fee collection statistics
GET    /api/v1/fees/chart            — Monthly collection chart data
```

### 1.4 Library Module
```
POST   /api/v1/library/books         — Add book
GET    /api/v1/library/books         — List books (?category=&available=true)
GET    /api/v1/library/books/:id     — Get book
PATCH  /api/v1/library/books/:id     — Update book
DELETE /api/v1/library/books/:id     — Soft-delete book
POST   /api/v1/library/transactions  — Issue/Return book
GET    /api/v1/library/transactions  — List transactions
GET    /api/v1/library/stats         — Library statistics
```

### 1.5 Results Module
```
POST   /api/v1/results               — Add exam result
GET    /api/v1/results               — List results (?examId=&studentId=&classId=)
GET    /api/v1/results/:id           — Get result
PATCH  /api/v1/results/:id           — Update result
DELETE /api/v1/results/:id           — Soft-delete result
GET    /api/v1/results/student/:studentId — All results for student
```

### 1.6 Timetable Module
```
POST   /api/v1/timetables            — Create/update timetable  
GET    /api/v1/timetables            — Get timetable (?classId=&day=)
PATCH  /api/v1/timetables/:id        — Update timetable
DELETE /api/v1/timetables/:id        — Delete timetable entry
```

### 1.7 Settings Module
```
GET    /api/v1/settings               — Get school settings
PATCH  /api/v1/settings               — Update school settings
POST   /api/v1/settings/logo          — Upload school logo (multipart)
```

### 1.8 Dashboard Module
```
GET    /api/v1/dashboard/stats        — Aggregated counts (students, teachers, etc.)
GET    /api/v1/dashboard/activity     — Recent activity feed
GET    /api/v1/dashboard/attendance-chart — Attendance trend data
GET    /api/v1/dashboard/fee-chart    — Fee collection trend
```

### 1.9 Reports Module
```
GET    /api/v1/reports/attendance     — Attendance report (?from=&to=&classId=)
GET    /api/v1/reports/fees           — Fee collection report
GET    /api/v1/reports/results        — Academic performance report
GET    /api/v1/reports/export         — CSV/PDF export (?type=attendance&format=csv)
```

### 1.10 Admin Schools Module (SuperAdmin)
```
POST   /api/v1/admin/schools          — Create school
GET    /api/v1/admin/schools          — List all schools (with usage stats)
GET    /api/v1/admin/schools/:id      — Get school details
PATCH  /api/v1/admin/schools/:id      — Update school
DELETE /api/v1/admin/schools/:id      — Soft-delete school
PATCH  /api/v1/admin/schools/:id/plan — Change school plan (SuperAdmin)
GET    /api/v1/admin/stats            — Platform-wide statistics
```

### 1.11 Bulk Attendance
```
POST   /api/v1/attendance/bulk        — Mark attendance for entire class at once
GET    /api/v1/attendance/stats       — Weekly/monthly attendance statistics
```

### 1.12 User Management
```
POST   /api/v1/users                  — Create staff/admin user
GET    /api/v1/users                  — List users for school
PATCH  /api/v1/users/:id             — Update user (role, status)
DELETE /api/v1/users/:id             — Deactivate user
```

---

## Phase 2 — Repository Layer (Week 5-6, parallel with Phase 1) ✅ COMPLETE
> Separate data access from business logic

### Why
- Services currently contain Firestore queries mixed with business logic
- Makes testing impossible without Firestore emulator
- Makes future DB migration (Firestore → Postgres) a complete rewrite
- Violates single responsibility

### Implementation

```typescript
// src/repositories/base.repo.ts
export abstract class BaseRepository<T> {
  constructor(protected collectionName: string) {}
  
  async findById(id: string): Promise<T | null> { ... }
  async findMany(filters: Filter[], pagination: PaginationParams): Promise<PaginatedResult<T>> { ... }
  async create(data: Omit<T, 'id'>): Promise<T> { ... }
  async update(id: string, data: Partial<T>): Promise<T> { ... }
  async softDelete(id: string, deletedBy: string): Promise<void> { ... }
  async count(filters: Filter[]): Promise<number> { ... }
}

// src/repositories/student.repo.ts
export class StudentRepository extends BaseRepository<Student> {
  constructor() { super('students'); }
  
  async findBySchool(schoolId: string, pagination: PaginationParams): Promise<PaginatedResult<Student>> {
    return this.findMany([
      { field: 'schoolId', op: '==', value: schoolId },
      { field: 'isDeleted', op: '==', value: false }
    ], pagination);
  }
  
  async findByClass(schoolId: string, classId: string): Promise<Student[]> { ... }
  async countBySchool(schoolId: string): Promise<number> { ... }
}
```

Each existing service gets refactored:
- `student.service.ts` → uses `StudentRepository` instead of raw Firestore
- `teacher.service.ts` → uses `TeacherRepository` 
- etc.

---

## Phase 3 — Subscription Lifecycle Engine (Week 7-8) ✅ COMPLETE
> Turn billing from a static flag into a living system

### 3.1 Subscription State Machine

```
                    ┌──────────┐
          ┌────────►│  trial    │────────────┐
          │         └──────────┘             │
     (create)            │              (trial expires,
          │         (payment)            no payment)
          │              │                   │
          │         ┌────▼─────┐        ┌────▼──────┐
          │         │  active   │───────►│  past_due  │
          │         └──────────┘        └───────────┘
          │              │   (grace          │
          │         (cancel)  period)   (7 days,
          │              │                no payment)
          │         ┌────▼─────┐        ┌────▼──────┐
          │         │ cancelled │        │  expired   │
          │         └──────────┘        └───────────┘
          │                                  │
          │                            (reactivate
          │                             + payment)
          └──────────────────────────────────┘
```

### 3.2 Background Workers (node-cron)

```typescript
// src/workers/subscriptionWorker.ts
// Runs every hour

// 1. Trial Expiry Check
//    WHERE status == 'trial' AND trialEndDate < now()
//    → Move to 'expired' if no payment method
//    → Move to 'active' if payment captured

// 2. Active → Past Due
//    WHERE status == 'active' AND currentPeriodEnd < now()
//    → Move to 'past_due'
//    → Send notification event

// 3. Past Due → Expired (after 7-day grace)
//    WHERE status == 'past_due' AND currentPeriodEnd < (now() - 7 days)
//    → Move to 'expired'
//    → Restrict access (read-only mode)
//    → Send notification event

// 4. Auto-Renewal
//    WHERE status == 'active' AND autoRenew == true AND nextBillingDate <= now()
//    → Create Razorpay subscription charge
//    → Generate invoice
```

### 3.3 Webhook Processing Enhancements

Handle additional Razorpay events:
- `payment.failed` → Log, increment failure count, notify admin
- `payment.authorized` → Pre-capture validation
- `refund.created` → Process refund, update invoice
- `subscription.charged` → Renewal confirmation
- `subscription.cancelled` → Handle cancellation

### 3.4 Invoice Generation

```typescript
// Auto-generate invoices:
// - On successful payment → paid invoice
// - On subscription renewal → new invoice
// - On plan upgrade → prorated invoice
// - Sequential invoice numbers: INV-{schoolCode}-{YYYYMM}-{seq}
```

### 3.5 Plan Change Logic

```typescript
// Upgrade: Immediate, prorated credit for remaining days
// Downgrade: Effective at period end, enforce new limits
// Cancel: Effective at period end, data retained for 90 days
```

### 3.6 Idempotent Payment Processing

```typescript
// Every payment operation uses idempotency key:
// key = `${schoolId}_${plan}_${billingCycle}_${periodStart}`
// Check before creating: if invoice exists with this key → skip
// Razorpay order notes include this key for tracing
```

---

## Phase 4 — Observability & Monitoring (Week 9-10) ✅ COMPLETE

### 4.1 Structured Logging Enhancement

```typescript
// Every log entry includes:
{
  requestId: "uuid",
  userId: "firebase-uid",
  schoolId: "school-id",
  action: "student.create",
  duration: 145,           // ms
  statusCode: 201,
  ip: "x.x.x.x",
  userAgent: "EduConnect-Mobile/1.0",
  timestamp: "ISO-8601"
}
```

### 4.2 Metrics Collection

Track and expose:
- Request count per route per status code
- Response time percentiles (p50, p95, p99)
- Active schools count
- Database query latency
- Webhook processing time
- Background job duration and success rate
- Error rates by category

```
GET /api/v1/internal/metrics    — Prometheus-format metrics (internal only)
GET /api/v1/internal/health     — Detailed health check (DB, Auth, Storage connectivity)
```

### 4.3 Error Tracking

```typescript
// Integration with Sentry or similar:
// - Capture unhandled exceptions with full context
// - Capture failed background jobs
// - Capture webhook processing failures
// - Capture payment failures
// - Source maps for stack traces
```

### 4.4 Audit Log Upgrade

```typescript
// src/services/audit.service.ts (enhanced)
interface AuditEntry {
  id: string;
  timestamp: Date;
  
  // Actor
  userId: string;
  userRole: UserRole;
  schoolId: string;
  
  // Action
  action: AuditAction;    // Expanded enum: 50+ actions
  resource: string;        // 'student', 'fee', 'subscription'
  resourceId: string;
  
  // Context
  requestId: string;
  ipAddress: string;
  userAgent: string;
  
  // Changes
  before?: Record<string, unknown>;   // Previous state (for updates)
  after?: Record<string, unknown>;    // New state
  metadata?: Record<string, unknown>;
  
  // Integrity
  previousHash?: string;   // Hash of previous audit entry (tamper detection)
  entryHash: string;        // SHA-256 of this entry
}

// Queryable:
// GET /api/v1/audit?from=&to=&action=&userId=&resource=
// GET /api/v1/audit/export?format=csv
```

---

## Phase 5 — Security Hardening (Week 11-12) ✅ COMPLETE

### 5.1 Security Headers

```typescript
// @fastify/helmet equivalent
{
  contentSecurityPolicy: true,
  crossOriginEmbedderPolicy: true,
  crossOriginOpenerPolicy: true,
  crossOriginResourcePolicy: true,
  dnsPrefetchControl: true,
  frameguard: { action: 'deny' },
  hidePoweredBy: true,
  hsts: { maxAge: 31536000, includeSubDomains: true },
  ieNoOpen: true,
  noSniff: true,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter: true
}
```

### 5.2 Per-Tenant Rate Limiting

```typescript
// Replace global IP-based with tenant-aware:
{
  global: { max: 200, timeWindow: '1 minute' },          // Per IP fallback
  authenticated: { max: 300, timeWindow: '1 minute' },    // Per schoolId
  webhooks: { max: 50, timeWindow: '1 minute' },          // Separate for webhooks  
  auth: { max: 10, timeWindow: '1 minute' },              // Login attempts
  payments: { max: 5, timeWindow: '1 minute' },           // Payment creation
}

// Key generator: schoolId (authenticated) or IP (public)
```

### 5.3 Input Validation Hardening

```typescript
// All string fields:
// - Maximum length enforced (name: 100, email: 255, notes: 2000)
// - HTML/script tag stripping
// - SQL injection patterns blocked (defense in depth)
// - Unicode normalization

// File uploads:
// - MIME type validation (not just extension)
// - File size limits per plan (Free: 5MB, Enterprise: 50MB)
// - Image dimension limits
// - Virus scanning (future: ClamAV integration)
```

### 5.4 Token & Session Security

```typescript
// - Firebase token expiry validation (1 hour max)
// - Token blacklist for force-logout (Redis or Firestore subcollection)
// - Concurrent session limiting (max 3 devices per user)
// - Suspicious activity detection:
//   - Login from new IP → notify
//   - Multiple failed attempts → temporary lock
//   - Unusual data export volume → alert
```

### 5.5 CORS Hardening

```typescript
{
  origin: [
    'https://app.educonnect.in',          // Production web
    'https://admin.educonnect.in',        // Admin panel
    /^https:\/\/.*\.educonnect\.in$/,     // Subdomains
    ...(isDev ? ['http://localhost:3000'] : [])
  ],
  methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  allowedHeaders: ['Authorization', 'Content-Type', 'X-Request-Id', 'X-School-Id'],
  credentials: true,
  maxAge: 86400
}
```

---

## Phase 6 — Monetization Engine (Week 13-16) ⏳ PARTIAL

### 6.1 Plan Enforcement at Scale

```typescript
// Every mutating endpoint checks:
// 1. Is subscription active/trial? (not expired/cancelled)
// 2. Is this feature available on their plan?
// 3. Is this entity within plan limits?

// Feature gates:
// - Library management: Pro+ only
// - Timetable management: Pro+ only
// - API access: Enterprise only
// - Custom branding: Basic+ only
// - Export to CSV: Basic+ only
// - Export to PDF: Pro+ only
// - Bulk operations: Pro+ only
// - Audit logs access: Enterprise only
```

### 6.2 Plan Upgrade/Downgrade

```typescript
// POST /api/v1/subscriptions/change-plan
{
  newPlan: 'pro',
  billingCycle: 'yearly'
}

// Upgrade flow:
// 1. Calculate prorated credit for remaining days on current plan
// 2. Calculate charge for new plan
// 3. Create Razorpay order for difference
// 4. On payment success → switch plan immediately
// 5. Generate credit note + new invoice

// Downgrade flow:
// 1. Validate current usage fits within new plan limits
// 2. If over-limit → reject with details of what needs reducing
// 3. Schedule downgrade for end of current period
// 4. Send confirmation notification
```

### 6.3 Usage Tracking

```typescript
// src/workers/usageWorker.ts (daily)
// For each school:
// 1. Count students, teachers, classes
// 2. Calculate storage usage
// 3. Store usage snapshot
// 4. Check threshold alerts:
//    - 80% of limit → warning notification
//    - 95% of limit → critical notification
//    - 100% of limit → enforce (block creation)
```

### 6.4 Trial Management

```typescript
// Trial flow:
// 1. School created → 14-day trial on selected plan (30 for Enterprise)
// 2. Day 7 → reminder notification
// 3. Day 12 → urgent notification
// 4. Day 14 → trial expires
// 5. If no payment → downgrade to Free plan limits
// 6. Data intact but features locked
// 7. Can still upgrade anytime
```

### 6.5 Failed Payment Retry

```typescript
// On payment failure:
// 1. First failure → retry after 24 hours
// 2. Second failure → retry after 48 hours, notify admin
// 3. Third failure → move to past_due, notify admin
// 4. 7 days past_due → move to expired, send final notice
// 5. 90 days expired → data archival warning
```

---

## Phase 7 — API Documentation (Week 14-15, parallel) ⏳ PARTIAL

### 7.1 OpenAPI / Swagger

```typescript
// @fastify/swagger + @fastify/swagger-ui
// Auto-generated from Zod schemas + route decorators
// Available at: /api/docs

// Every route documented with:
// - Summary + description
// - Request body schema
// - Query parameter schema  
// - Response schemas (success + error variants)
// - Authentication requirements
// - Rate limit info
// - Example requests/responses
```

### 7.2 Developer Documentation

```
docs/
  api/
    authentication.md
    pagination.md
    error-codes.md
    rate-limiting.md
    webhooks.md
  guides/
    getting-started.md
    school-setup.md
    subscription-management.md
    data-export.md
```

---

## Phase 8 — Scalability Preparation (Week 17-20) ❌ NOT STARTED

### 8.1 Caching Layer

```typescript
// In-memory cache (node-cache) or Redis:
// - School settings: 5 min TTL
// - Plan details: 1 hour TTL (rarely changes)
// - User role/permissions: 5 min TTL
// - Dashboard stats: 1 min TTL
// - Feature flags: 5 min TTL

// Cache invalidation:
// - On write → invalidate relevant keys
// - On subscription change → invalidate school cache
// - Pub/sub for multi-instance invalidation (future)
```

### 8.2 Background Job Queue

```typescript
// Move from node-cron to BullMQ (Redis-backed) for:
// - Subscription lifecycle checks
// - Email/SMS notifications
// - Report generation (heavy)
// - Data export (heavy)
// - Webhook retry
// - Usage snapshot calculation
// - File processing (image resize, etc.)

// Benefits:
// - Retry with backoff
// - Concurrency control
// - Job priority
// - Dead letter queue
// - Dashboard (Bull Board)
```

### 8.3 Stateless Backend

```typescript
// Ensure zero server-side state:
// - No in-memory sessions (Firebase tokens are stateless)
// - No file system dependencies (Cloud Storage)
// - No singleton state that would break with multiple instances
// - Cache in external store (Redis)
// This enables horizontal scaling behind a load balancer
```

### 8.4 Database Optimization

```typescript
// Firestore-specific optimizations:
// 1. Composite indexes for all multi-field queries
// 2. Denormalization for dashboard counts (avoid aggregation queries)
// 3. Subcollections vs root collections decision matrix
// 4. Collection group queries where needed
// 5. Batch reads (getAll) instead of sequential reads
// 6. Firestore TTL policies for temporary data
// 7. Data archival: move old records to archive subcollection
```

---

## Phase 9 — Testing & CI/CD (Week 18-22, parallel) ⏳ PARTIAL

### 9.1 Testing Strategy

```
Unit Tests (Jest)
├── Services — business logic with mocked repositories
├── Schemas — validation edge cases  
├── Utils — pagination, error formatting, etc.
└── Workers — subscription state machine logic

Integration Tests (Supertest + Firebase Emulator)
├── Route tests — full HTTP lifecycle
├── Middleware tests — auth, tenant, RBAC
├── Webhook tests — Razorpay event processing
└── Background job tests

E2E Tests (Future)
├── Full flow: Create school → Add students → Mark attendance
├── Payment flow: Create order → Webhook → Subscription active
└── Plan change flow
```

### 9.2 CI/CD Pipeline

```yaml
# GitHub Actions
on: [push, pull_request]

jobs:
  lint:        # ESLint + Prettier
  typecheck:   # tsc --noEmit
  test:        # Jest with Firebase Emulator
  build:       # Compile TypeScript
  deploy:      # Cloud Run / Railway / Render
    only: main branch
```

### 9.3 Environment Management

```
.env.example          # Template with all required vars
.env.development      # Local development
.env.staging          # Staging environment
.env.production       # Production (in CI secrets, never committed)
```

---

## Phase 10 — Notification System (Week 20-22) ⏳ PARTIAL

### 10.1 Notification Types

```typescript
// In-app notifications (Firestore `notifications` collection)
// Email notifications (SendGrid / Resend)
// Push notifications (Firebase Cloud Messaging for mobile)
// SMS notifications (future: Twilio / MSG91)

// Triggered by:
// - Subscription events (trial expiring, payment failed, plan changed)
// - Usage alerts (approaching limits)
// - Attendance events (student absent)
// - Fee events (payment due, payment received)
// - System events (maintenance, updates)
```

### 10.2 Notification Service Architecture

```typescript
// src/services/notification.service.ts
// Template-based system:
// 1. Event fires (e.g., PAYMENT_FAILED)
// 2. Notification service looks up template
// 3. Resolves recipients (school admins)
// 4. Queues notification jobs (BullMQ)
// 5. Workers process: in-app write + email send + push send
```

---

## Execution Priority & Dependencies

```
Week 1-2:   Phase 0 (Foundation)        ✅ COMPLETE
Week 3-6:   Phase 1 (Feature Modules)   ✅ COMPLETE (all 12 modules)
Week 5-6:   Phase 2 (Repository Layer)  ✅ COMPLETE
Week 7-8:   Phase 3 (Subscription)      ✅ COMPLETE (state machine + workers)
Week 9-10:  Phase 4 (Observability)     ✅ COMPLETE (metrics, health, error tracking)
Week 11-12: Phase 5 (Security)          ✅ COMPLETE (headers, sanitization, CORS, rate limits)
Week 13-16: Phase 6 (Monetization)      ✅ COMPLETE (plan change API + proration + limits)
Week 14-15: Phase 7 (API Docs)          ✅ COMPLETE (API_REFERENCE.md + OpenAPI/Swagger at /api/docs)
Week 17-20: Phase 8 (Scalability)       ⏳ PARTIAL (caching done via node-cache; BullMQ + stateless TBD)
Week 18-22: Phase 9 (Testing + CI/CD)   ⏳ PARTIAL (165 tests done, CI/CD pipelines added Feb 27)
Week 20-22: Phase 10 (Notifications)    ✅ COMPLETE (in-app + SendGrid email + templates + worker triggers)
```

**Frontend Migration**: ✅ COMPLETE — All 10 demo-mode services migrated to real API calls.

---

## Frontend Migration Plan ✅ COMPLETE

All backend modules completed and all frontend services migrated:

### Migration per Module
1. ~~Create backend route + service + schema + repo~~
2. ~~Update frontend service: remove `isDemoMode`, replace Firestore calls with `apiFetch()`~~
3. ~~Update frontend to use pagination (`useInfiniteQuery` pattern or cursor state)~~
4. ~~Test end-to-end~~
5. ~~Remove demo data for that module from `demoDataStore.ts`~~

### Migration Status (all complete)
1. ✅ Classes — `classService.ts` migrated (~210 lines)
2. ✅ Events — `eventService.ts` migrated (~220 lines)
3. ✅ Fees — `feeService.ts` migrated (~220 lines)
4. ✅ Library — `libraryService.ts` migrated (~190 lines)
5. ✅ Results — `resultService.ts` migrated (232 lines)
6. ✅ Timetable — `timetableService.ts` migrated (~185 lines)
7. ✅ Settings — `settingsService.ts` migrated (~175 lines)
8. ✅ Dashboard — `dashboardService.ts` migrated (~120 lines)
9. ✅ Admin Schools — `schoolService.ts` migrated (~200 lines)
10. ✅ Subscriptions — `subscriptionService.ts` migrated (~330 lines)
11. ✅ `lib/api.ts` — added auto-unwrap of `{ success, data }` response envelope

**Architecture pattern**: All services use `apiFetch()` with `ApiError`, `toDate()` helpers for ISO/Timestamp deserialization, and 30-second polling intervals for real-time updates.

---

## Tech Stack Additions

| Tool | Purpose | When | Status |
|------|---------|------|--------|
| `@fastify/swagger` + `@fastify/swagger-ui` | API documentation | Phase 7 | ❌ Not installed |
| Security headers (custom plugin) | Security headers | Phase 5 | ✅ Implemented (custom `security.ts` plugin) |
| `node-cron` | Background jobs | Phase 3 | ✅ Installed & running (4 workers) |
| `ioredis` | Caching + job queue backing | Phase 8 | ❌ Not installed |
| `bullmq` | Job queue (replaces node-cron) | Phase 8 | ❌ Not installed |
| Error tracking (custom) | Error tracking | Phase 4 | ✅ Implemented (ring buffer + Firestore) |
| Metrics (custom plugin) | Request metrics | Phase 4 | ✅ Implemented (`metrics.ts` plugin) |
| `@sendgrid/mail` or `resend` | Email notifications | Phase 10 | ❌ Not installed |
| `firebase-admin` (FCM) | Push notifications | Phase 10 | ❌ Not installed |
| `jest` + `ts-jest` + `@types/jest` | Automated testing | Phase 9 | ✅ Installed (141 tests) |

---

## Key Architectural Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| Database | Stay on Firestore | Already built, serverless scaling, real-time sync for mobile. Repository layer enables future migration. |
| API Framework | Stay on Fastify | Already built, fastest Node.js framework, excellent plugin ecosystem. |
| Auth | Stay on Firebase Auth | Already integrated in all 3 clients, minimal overhead. |
| Background Jobs | node-cron → BullMQ | Start simple, migrate when Redis is justified. |
| Caching | In-memory → Redis | Start with node-cache, migrate when multi-instance needed. |
| Payments | Stay on Razorpay | Indian market focus, already integrated. |
| Hosting | Cloud Run (GCP) | Pay-per-request, auto-scaling, Firebase native integration. |
| File Storage | Firebase Cloud Storage | Already set up, CDN-backed, Firebase Security Rules. |

---

## Definition of "Production Ready"

Before launching to first paying school:

- [x] All Phase 0 items complete (foundation)
- [x] All Phase 1 items complete (features — all 12 modules)
- [x] Phase 3 complete (subscription lifecycle)
- [x] Phase 5 items 5.1–5.3 complete (security basics)
- [x] At least integration tests for auth, payments, subscriptions
- [ ] CI/CD pipeline deploying to staging
- [x] `.env` secrets out of git (`.env.example` provided)
- [x] Error tracking active (custom ring buffer + Firestore)
- [x] Monitoring endpoints live (`/health`, `/metrics`)
- [ ] Data backup strategy documented
- [x] All frontend demo modes replaced with real API calls

**8 of 11 items complete.** Remaining: CI/CD pipeline, data backup docs.

---

## What to Build Next

The following items remain, ordered by impact:

1. ~~**Plan upgrade/downgrade API** (Phase 6)~~ — ✅ Done (Feb 27)
2. ~~**OpenAPI/Swagger** (Phase 7)~~ — ✅ Done (Feb 27)
3. ~~**CI/CD pipeline** (Phase 9)~~ — ✅ Done (Feb 27)
4. ~~**Caching layer** (Phase 8)~~ — ✅ Done (Feb 27) — node-cache plugin with user/school/settings/plan/dashboard namespaces
5. ~~**Email notifications** (Phase 10)~~ — ✅ Done (Feb 27)
6. ~~**Data backup strategy**~~ — ✅ Done (Feb 27) — docs/DATA_BACKUP.md
7. **BullMQ job queue** (Phase 8) — Replace cron-based workers with BullMQ for reliability + retries
8. **Mobile Firestore → API migration** — Audit 19 mobile service files, ensure all use `apiFetch()`
9. **Integration test coverage** — Expand to 80%+ route coverage (currently testing subscriptions + middleware)

---

> This is a living document. Last updated: February 27, 2026.
