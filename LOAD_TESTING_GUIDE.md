# Load Testing Guide - EduConnect

## Overview

Load testing ensures the EduConnect backend can handle production traffic. This guide covers setup, execution, and interpretation of load test results.

---

## Quick Start

### 1. Install k6

**macOS:**
```bash
brew install k6
```

**Windows (PowerShell):**
```powershell
choco install k6
```

**Linux:**
```bash
sudo apt-get install k6
```

**Docker:**
```bash
docker run -i grafana/k6 run - < load-tests/scenarios.js
```

### 2. Set Up Environment Variables

```bash
# Create .env.load-test
BASE_URL=http://localhost:3001
API_TOKEN=<your-test-token>
SCHOOL_ID=test-school-id
```

### 3. Start Backend (if local)

```bash
cd apps/backend
npm run dev
```

### 4. Run Smoke Test (validation)

```bash
k6 run -e BASE_URL=http://localhost:3001 \
       -e API_TOKEN=xxx \
       -s smoke \
       load-tests/scenarios.js
```

Expected output:
```
█ smoke
  ✓ Health Check
  ✓ List Students
  ✓ Create Student

     checks.........................: 100% (3 out of 3)
     http_reqs........................: 3
     http_req_duration..............: avg=250ms p(95)=300ms p(99)=350ms
```

---

## Test Scenarios

### 1. Smoke Test (Baseline)
**Purpose:** Quick sanity check that API is functional
**Duration:** ~1 minute
**VUs:** 1 user
**What it tests:**
- Health check endpoint
- Student list endpoint
- Student creation endpoint

**When to run:** Before every test, to verify API is working

```bash
k6 run --scenario smoke load-tests/scenarios.js
```

**Pass criteria:**
- All requests return 2xx status
- No errors
- Response times < 500ms

---

### 2. Load Test (Sustained Traffic)
**Purpose:** Test normal operation under typical load
**Duration:** 16 minutes total
**VU Ramp:** 50 → 50 (5min) → 100 → 100 (5min) → 0
**What it tests:**
- Student CRUD operations
- Attendance marking
- Fee queries
- Dashboard performance
- Pagination

**When to run:** Weekly or before releases

```bash
k6 run \
  --vus 50 \
  --duration 5m \
  load-tests/scenarios.js
```

**Pass criteria:**
- p(95) response time < 500ms
- p(99) response time < 1000ms
- Error rate < 1%
- All endpoints available

**Typical results for a well-optimized backend:**
| Endpoint | p(95) | p(99) | Error Rate |
|----------|-------|-------|-----------|
| List Students | 120ms | 250ms | 0% |
| Create Student | 180ms | 350ms | 0% |
| Mark Attendance | 150ms | 300ms | 0% |
| Dashboard | 200ms | 400ms | 0% |

---

### 3. Spike Test (Traffic Surge)
**Purpose:** Test behavior when traffic suddenly increases
**Duration:** 4 minutes total
**VU Ramp:** 10 → 200 (sudden) → 10
**What it tests:**
- Connection pool exhaustion
- Queue behavior
- Error handling under spike
- Recovery after spike

**When to run:** When expecting viral events or marketing pushes

```bash
k6 run --scenario spike load-tests/scenarios.js
```

**Pass criteria:**
- No 5xx errors during spike
- Error rate < 5% during spike
- Graceful degradation (some slowdown acceptable)
- Full recovery after spike clears

**Success example:**
```
Stage 1 (10 VUs): Response time avg 120ms
Stage 2 (200 VUs): Response time avg 350ms (degraded but working)
Stage 3 (10 VUs): Response time avg 120ms (recovered)
```

---

### 4. Stress Test (Breaking Point)
**Purpose:** Find system limits and breaking point
**Duration:** 6 minutes total
**VU Ramp:** 50 → 100 → 200 → 300 → 400 → 0
**What it tests:**
- Database connection limits
- Memory constraints
- CPU saturation
- Where system fails

**When to run:** Before major black Friday/year-end events

```bash
k6 run --scenario stress load-tests/scenarios.js
```

**Pass criteria:**
- System continues operating up to 200+ VUs
- No cascading failures
- Controlled degradation (not abrupt drops)
- Error rate doesn't exceed 10% at peak

**Analysis:**
- If errors start at 150 VUs → plan for 100 concurrent user capacity
- If memory exhausted → increase database pool size
- If CPU maxes out → optimize hot queries or add replicas

---

### 5. Endurance Test (Long-Run Stability)
**Purpose:** Find memory leaks and subtle issues over time
**Duration:** 30 minutes at constant 25 VUs
**What it tests:**
- Memory leak detection
- Connection pool stability
- Cache behavior
- Database connection reuse

**When to run:** Before production deployment

```bash
k6 run --scenario endurance load-tests/scenarios.js
```

**Pass criteria:**
- Memory usage stays stable (not growing)
- No degradation in response time over 30 minutes
- No connection pool exhaustion
- Error rate remains < 0.1%

**Memory analysis:**
```
Time 0min: Heap 120MB, HTTP connections 100
Time 10min: Heap 125MB, HTTP connections 100
Time 20min: Heap 130MB, HTTP connections 100  ← Slight growth OK
Time 30min: Heap 512MB, HTTP connections 500  ← LEAK detected!
```

---

## Running Tests in CI/CD

### GitHub Actions Integration

```yaml
# .github/workflows/load-test.yml
name: Load Testing

on: [workflow_dispatch]

jobs:
  load-test:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node
        uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install k6
        run: |
          sudo apt-get update
          sudo apt-get install -y k6

      - name: Start backend
        run: |
          cd apps/backend
          npm install
          npm run build
          npm run start &

      - name: Run smoke test
        run: k6 run -s smoke load-tests/scenarios.js

      - name: Run load test
        run: k6 run --vus 50 --duration 5m load-tests/scenarios.js

      - name: Upload results
        uses: actions/upload-artifact@v3
        with:
          name: load-test-results
          path: results/
```

---

## Interpreting Results

### Key Metrics

#### Response Time (ms)
- **p(50):** Median response time (half of requests faster, half slower)
- **p(95):** 95% of requests complete within this time
- **p(99):** 99% of requests complete within this time
- **p(99.9):** 99.9% of requests complete within this time

**Interpretation:**
```
p(95)=500ms means:
- 95% of users experience ≤500ms latency
- 5% experience slower (likely power users)
```

#### Error Rate
- **0%:** Perfect execution
- **< 0.1%:** Excellent (network timeouts acceptable)
- **0.1% - 1%:** Good (monitor but acceptable)
- **1% - 5%:** Concerning (investigate)
- **> 5%:** Critical (system under stress)

#### Throughput (requests/sec)
- **Expected:** Should increase linearly with VUs
- **If plateaus early:** Database bottleneck
- **If drops:** Connection exhaustion

### Example Results Analysis

```
# Load Test Run: 100 VUs for 5 minutes

HTTP Request Duration
  avg: 450ms
  p(95): 920ms    ← 95% of users accept 920ms, OK
  p(99): 1200ms   ← 99% of users accept 1.2s, within threshold
  p(99.9): 2500ms ← Only 0.1% wait > 2.5s

HTTP Requests: 15,000
HTTP Errors: 45 (0.3% error rate - GOOD)

Database:
  - Query avg: 150ms
  - Connection pool: 100/100 used (at limit)
  - Slow queries: 3 detected

Recommendation:
✓ API response times acceptable
⚠ Database connection pool size should increase to 150
✓ Error rate within acceptable range
✓ Consider query optimization for slow queries
```

---

## Performance Optimization

### If Load Test Fails

#### Timeout errors (p(99) > 2 seconds)
**Root causes:**
- Slow database queries
- N+1 query problems
- Inefficient code

**Solutions:**
1. Add database indexing
2. Use query pagination
3. Implement caching (node-cache is already enabled)
4. Profile with APM tool

#### Memory errors (OOM)
**Root causes:**
- Memory leak in Node.js
- Unbounded response buffers
- Connection pool too large

**Solutions:**
1. Enable new relic or Datadog monitoring
2. Check for event listener leaks
3. Limit connection pool size
4. Add garbage collection pressure

#### Connection pool exhaustion
**Root causes:**
- Too many concurrent database connections
- Slow query releases connections late

**Solutions:**
1. Increase `pool.max` in Prisma config
2. Implement query timeouts
3. Use connection pooler (PgBouncer)

#### CPU saturation (100% CPU, slow responses)
**Root causes:**
- Hot loops in request handling
- Missing database indexes
- Inefficient JSON serialization

**Solutions:**
1. Profile with Node profiler
2. Add database indexes
3. Use streaming responses for large datasets

---

## Performance Benchmarks

### Target Metrics (EduConnect Production)

| Scenario | 50 VUs | 100 VUs | 200 VUs | SLA |
|----------|--------|---------|---------|-----|
| Student list | 120ms | 150ms | 250ms | <500ms |
| Student create | 180ms | 220ms | 400ms | <1000ms |
| Mark attendance | 150ms | 180ms | 320ms | <500ms |
| Dashboard | 200ms | 250ms | 450ms | <500ms |
| Error rate | 0% | 0% | <1% | <1% |
| Throughput | 1200/s | 2100/s | 3500/s | Linear growth |

### How to Check If Meeting Benchmarks

```bash
# Run this and compare results
k6 run --vus 100 --duration 5m \
  -e BASE_URL=https://api.educonnect.prod \
  load-tests/scenarios.js
```

---

## Running from Docker

### Local Development
```bash
cd apps/backend
docker-compose up -d  # Start Postgres + app

docker run -i grafana/k6 run - < load-tests/scenarios.js
```

### With Custom Environment
```bash
docker run \
  -e BASE_URL=http://host.docker.internal:3001 \
  -e API_TOKEN=test-token \
  -i grafana/k6 run - < load-tests/scenarios.js
```

---

## Monitoring During Test

### Real-time Monitoring (Optional - Requires Cloud k6 Account)

```bash
# With Grafana Cloud
k6 run -o cloud load-tests/scenarios.js
```

### Local Monitoring

**Terminal 1: Start backend**
```bash
npm run dev
```

**Terminal 2: Monitor resources**
```bash
# macOS
top

# Linux
htop

# Windows
Measure-Object -InputObject (Get-Process node) -Property WorkingSet
```

**Terminal 3: Run test**
```bash
k6 run load-tests/scenarios.js
```

---

## Next Steps After Load Testing

1. **If performance is good (< 100ms p95):**
   - Deploy to production
   - Monitor with APM tool
   - Set up alerts for degradation

2. **If performance needs improvement:**
   - Profile hot paths
   - Add indexes to slow queries
   - Implement caching for expensive operations
   - Re-run tests after optimizations

3. **If stress test revealed limits at 200 VUs:**
   - Document current capacity: "System handles 200 concurrent users"
   - Plan scaling strategy:
     - Vertical: Add more CPU/RAM
     - Horizontal: Add database replicas
     - Caching: Increase cache hit ratio
     - CDN: Offload static assets

---

## Resources

- [k6 Documentation](https://k6.io/docs/)
- [Load Testing Best Practices](https://k6.io/blog/how-to-write-effective-load-tests/)
- [Prometheus Metrics Integration](https://k6.io/docs/results-output/real-time/prometheus-remote-write/)
- [Node.js Profiling Guide](https://nodejs.org/en/docs/guides/profiling/)
