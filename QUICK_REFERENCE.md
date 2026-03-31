# EduConnect Quick Reference Guide

## Common Commands

### Backend Development
```bash
cd apps/backend

# Install & setup
npm install
npm run build
npm run dev

# Database
npx prisma migrate dev         # Create new migration
npx prisma migrate status      # Check migration status
npx prisma studio             # Open Prisma Studio GUI
npx prisma db seed            # Seed database

# Testing
npm run test                   # All tests
npm run test:unit             # Unit tests only
npm run test:integration      # Integration tests
npm test -- --watch           # Watch mode

# Load Testing
npm run load:smoke            # Quick test
npm run load:load             # Full load test
npm run load:spike            # Spike test

# Linting
npm run lint                   # Check errors
npm run lint:fix              # Auto-fix

# Building
npm run build                  # Compile TypeScript
npm run start                  # Production start
```

### Key API Endpoints

```
GET    /health                           → Health check
GET    /api/v1/students                  → List students
POST   /api/v1/students                  → Create student
GET    /api/v1/students/:id              → Get student
PATCH  /api/v1/students/:id              → Update student
DELETE /api/v1/students/:id              → Delete student

POST   /api/v1/attendance                → Mark attendance
GET    /api/v1/attendance/statistics/:id → Get stats
POST   /api/v1/attendance/bulk-mark      → Bulk mark

GET    /api/v1/activities                → List activities
POST   /api/v1/activities                → Create activity

GET    /api/v1/config/summary-card       → Get config
PATCH  /api/v1/config/summary-card       → Update config

GET    /api/v1/fees                      → List fees
POST   /api/v1/fees                      → Create fee

GET    /api/v1/subscriptions/:schoolId   → Get subscription
```

### Database Models Quick Map

```typescript
// Core entities
School          → schoolId, name, subscriptionPlan, limits
User            → userId, email, role, schoolId
Student         → studentId, firstName, lastName, classId, schoolId
Teacher         → teacherId, firstName, lastName, email, schoolId
Class           → classId, name, schoolId
Attendance      → attendanceId, studentId, status, date
Fee             → feeId, studentId, amount, feeType, status
Activity        → activityId, userId, studentId, type, title
SchoolConfig    → configId, schoolId, summaryCard, metadata
Subscription    → subscriptionId, schoolId, plan, status

// Relationships
School → teachers, students, classes, fees, activities, config
Student → attendance, fees, activities
Teacher → classes, attendance, assignments
User ← has one School
```

### Cache Namespaces

```typescript
cache.get('user', userId)              // 5min TTL - Auth & permissions
cache.get('school', schoolId)          // 5min TTL - Subscription info
cache.get('settings', schoolId)        // 10min TTL - Config
cache.get('plan', planType)            // 1hr TTL - Plan details
cache.get('dashboard', schoolId)       // 1min TTL - Dashboard stats

// Invalidate on mutation:
cache.flushNamespace('school')         // Flush all school caches
cache.flushNamespace('dashboard')      // Flush all dashboard caches
```

### Repository Usage

```typescript
import { StudentRepository } from '@/repositories'

const studentRepo = new StudentRepository(prisma)

// Find
const student = await studentRepo.findById(id)
const students = await studentRepo.findMany()
const byClass = await studentRepo.findByClass('class-10-a')
const results = await studentRepo.search('John')
const count = await studentRepo.count()

// Create
const newStudent = await studentRepo.create({
  firstName: 'John',
  lastName: 'Doe',
  // ...
})

// Update
const updated = await studentRepo.update(id, {
  email: 'newemail@test.com'
})

// Delete
await studentRepo.softDelete(id)  // Marks isDeleted = true
```

### Testing Patterns

```typescript
// Unit Test
describe('StudentRepository', () => {
  it('should find student by id', async () => {
    const result = await repo.findById('stu-123')
    expect(result?.id).toBe('stu-123')
  })
})

// Integration Test (E2E)
it('should create and retrieve student', async () => {
  const res = await request(app).post('/api/v1/students').send(data)
  expect(res.status).toBe(201)
  expect(res.body.data.id).toBeDefined()
})

// Load Test
group('Student Creation', () => {
  const res = http.post('/api/v1/students', JSON.stringify(data), { headers })
  check(res, { 'status 201': r => r.status === 201 })
})
```

### Response Format

```typescript
// Success Response
{
  success: true,
  data: { /* entity data */ },
  meta: {
    requestId: "req-xxx",
    timestamp: "2024-03-26T10:00:00Z",
    total?: 100,              // For list endpoints
    limit?: 20,
    skip?: 0,
    hasMore?: true
  }
}

// Error Response
{
  success: false,
  error: {
    code: "INVALID_INPUT",
    message: "Required field: email",
    fields?: {
      email: "Must be valid email"
    }
  }
}
```

### Security Quick Checks

```bash
# Check RBAC
- SuperAdmin: Can do anything
- Admin: School-level access (cannot change subscription)
- Principal: Same as Admin
- Staff: Can read all, create assignments/attendance
- Accountant: Can read/update finance only

# Protected Fields:
- user.role cannot be changed by non-SuperAdmin
- school.subscriptionPlan cannot be changed by Admin
- fee.studentId cannot be changed after creation
- activity.schoolId cannot change on update
```

### Environment Variables Checklist

```bash
# Required
DATABASE_URL                   # PostgreSQL connection string
FIREBASE_PROJECT_ID           # Firebase project ID
FIREBASE_PRIVATE_KEY          # Firebase service account key
FIREBASE_CLIENT_EMAIL         # Firebase service account email

# Optional (with defaults)
NODE_ENV=development          # default: "development"
PORT=3001                      # default: 3001
LOG_LEVEL=info                # default: "info"
CACHE_TTL_USER=300            # default: 300 (5min)
CACHE_TTL_SCHOOL=300          # default: 300 (5min)
```

### Debugging Tips

```bash
# View database
npx prisma studio            # Opens GUI at localhost:5555

# Check logs
export LOG_LEVEL=debug       # Verbose logging
npm run dev

# Profile performance
node --prof app.js
node --prof-process isolate-*.log > isolate-*.txt

# Monitor database
SELECT * FROM pg_stat_statements ORDER BY mean_exec_time DESC;

# Check connections
SELECT count(*) FROM pg_stat_activity;
```

### Common Issues & Fixes

| Issue | Fix |
|-------|-----|
| Cannot connect to DB | Check DATABASE_URL format |
| Migration fails | `npx prisma migrate reset` |
| Cache not updating | Check middleware in server.ts |
| Tests timeout | Increase Jest timeout: `jest.setTimeout(10000)` |
| Slow queries | Add indexes: `@@index([shoolId, createdAt])` |
| Memory leak | Check event listeners, implement cleanup |

### Useful URLs (when running locally)

```
API:              http://localhost:3001
Health Check:     http://localhost:3001/health
API Docs:         http://localhost:3001/api/docs
Prisma Studio:    http://localhost:5555
```

### Git Workflow

```bash
# Create feature branch
git checkout -b feature/task-name

# Commit changes
git add .
git commit -m "feat: describe change"

# Push and create PR
git push origin feature/task-name

# CI/CD triggers automatically
# Wait for all checks to pass

# Merge PR
git merge feature/task-name
```

### Release Checklist

```bash
□ All tests passing
□ Build succeeds (npm run build → 0 errors)
□ Load test results acceptable (p95 < 500ms)
□ Security audit completed
□ Database migrations ready
□ Environment variables configured
□ Logs configured properly
□ Monitoring alerts set up
□ Documentation updated
□ Team trained on changes
```

---

## Documentation Index

| Document | Purpose | Audience |
|----------|---------|----------|
| [SECURITY_AUDIT_REPORT.md](./SECURITY_AUDIT_REPORT.md) | Firestore rules security review | Security, Backend |
| [INTEGRATION_TESTING_GUIDE.md](./INTEGRATION_TESTING_GUIDE.md) | Mobile & Web API integration tests | QA, Frontend |
| [LOAD_TESTING_GUIDE.md](./LOAD_TESTING_GUIDE.md) | k6 performance testing | DevOps, Backend |
| [IMPLEMENTATION_COMPLETE.md](./IMPLEMENTATION_COMPLETE.md) | Full project summary | All teams |
| [API_REFERENCE.md](./apps/backend/API_REFERENCE.md) | API endpoint documentation | Frontend, Mobile |

---

## Contact & Support

**Backend Lead:** [To be filled]  
**DevOps Lead:** [To be filled]  
**QA Lead:** [To be filled]  

**Standup:** [Time TBD]  
**On-call:** [Schedule TBD]  
**Issue Tracker:** [GitHub Issues or Jira]
