# Mobile & Web Panel Integration Testing Guide

## Overview

This guide provides a comprehensive integration testing strategy for the EduConnect mobile and web applications with the PostgreSQL backend API.

---

## Mobile App Integration Testing

### What to Verify

The React Native app must validate all API calls work correctly after the backend migration from Firestore to PostgreSQL.

#### 1. Authentication & Session Management

**Test Cases:**
```typescript
// tests/integration/auth.test.ts
describe("Mobile Auth Integration", () => {
  it("should login and receive valid JWT token", async () => {
    const response = await api.post("/auth/login", {
      email: "teacher@school.test",
      password: "password123",
    });
    
    expect(response.data.token).toBeDefined();
    expect(response.data.user).toHaveProperty("id", "role", "schoolId");
  });

  it("should refresh expired token", async () => {
    const oldToken = expiredToken();
    const response = await api.post("/auth/refresh", {
      refreshToken: oldToken,
    });
    
    expect(response.data.token).toBeDefined();
    expect(response.status).toBe(200);
  });

  it("should logout and clear session", async () => {
    const response = await api.post("/auth/logout");
    expect(response.status).toBe(200);
    expect(localStorage.getItem("token")).toBeNull();
  });
});
```

**What Changed:** Token format might differ between Firestore Auth and UUID-based JWT tokens.

#### 2. Student List & Search

**Test Cases:**
```typescript
describe("Student Management (Mobile)", () => {
  it("should list all students in school", async () => {
    const response = await getStudents({
      schoolId: "test-school-id",
    });
    
    expect(response.success).toBe(true);
    expect(Array.isArray(response.data)).toBe(true);
    expect(response.data[0]).toHaveProperty(
      "id",
      "firstName",
      "lastName",
      "classId"
    );
  });

  it("should search students by name", async () => {
    const response = await getStudents({
      search: "John",
      schoolId: "test-school-id",
    });
    
    expect(response.data.every((s) =>
      s.firstName.toLowerCase().includes("john") ||
      s.lastName.toLowerCase().includes("john")
    )).toBe(true);
  });

  it("should filter students by class", async () => {
    const response = await getStudents({
      classId: "class-10-a",
      schoolId: "test-school-id",
    });
    
    expect(response.data.every((s) => s.classId === "class-10-a")).toBe(true);
  });

  it("should paginate student list", async () => {
    const response = await getStudents({
      limit: 20,
      skip: 0,
      schoolId: "test-school-id",
    });
    
    expect(response.data.length).toBeLessThanOrEqual(20);
    expect(response.meta.total).toBeDefined();
  });
});
```

**What Changed:** Response format now includes `meta` object with pagination info.

#### 3. Attendance Marking

**Test Cases:**
```typescript
describe("Attendance (Mobile)", () => {
  it("should mark attendance for single student", async () => {
    const response = await markAttendance({
      studentId: "stu-123",
      date: "2024-03-26",
      status: "present",
      classId: "class-10-a",
    });
    
    expect(response.success).toBe(true);
    expect(response.data.status).toBe("present");
  });

  it("should mark attendance for entire class", async () => {
    const response = await bulkMarkAttendance({
      classId: "class-10-a",
      date: "2024-03-26",
      records: [
        { studentId: "stu-1", status: "present" },
        { studentId: "stu-2", status: "absent" },
        { studentId: "stu-3", status: "leave" },
      ],
    });
    
    expect(response.success).toBe(true);
    expect(response.data).toHaveLength(3);
  });

  it("should prevent backdating attendance", async () => {
    const oldDate = "2024-01-01"; // 3+ months ago
    const response = await markAttendance({
      studentId: "stu-123",
      date: oldDate,
      status: "present",
    });
    
    expect(response.success).toBe(false);
    expect(response.error.code).toContain("BACKDATE");
  });

  it("should handle offline attendance sync", async () => {
    // Mark attendance while offline
    const offlineRecord = {
      studentId: "stu-123",
      date: "2024-03-26",
      status: "present",
      _syncPending: true,
    };
    
    // When connection restored
    const response = await syncOfflineAttendance([offlineRecord]);
    expect(response.success).toBe(true);
  });
});
```

**What Changed:** Bulk operations now use `/attendance/bulk-mark` endpoint. Offline sync requires client-side queue.

#### 4. Assignments & Results

**Test Cases:**
```typescript
describe("Assignments (Mobile)", () => {
  it("should fetch assignments for teacher", async () => {
    const response = await getAssignments({
      teacherId: "teach-123",
    });
    
    expect(response.success).toBe(true);
    expect(response.data[0]).toHaveProperty(
      "id",
      "title",
      "description",
      "dueDate",
      "createdBy"
    );
  });

  it("should submit assignment solution", async () => {
    const response = await submitAssignment({
      assignmentId: "assign-456",
      studentId: "stu-123",
      content: "Solution text",
      attachments: [], // File uploads
    });
    
    expect(response.success).toBe(true);
    expect(response.data.submissionStatus).toBe("submitted");
  });

  it("should upload assignment attachment", async () => {
    const file = new File(["content"], "solution.pdf");
    const response = await uploadAttachment("assign-456", file);
    
    expect(response.success).toBe(true);
    expect(response.data.url).toBeDefined();
  });

  it("should grade student assignment", async () => {
    const response = await gradeAssignment({
      submissionId: "subm-789",
      score: 85,
      feedback: "Good effort",
    });
    
    expect(response.success).toBe(true);
  });
});
```

**What Changed:** Assignment endpoints expect `/assignments` not `/queries/assignment`. File uploads now go to storage backend.

#### 5. Events & Announcements

**Test Cases:**
```typescript
describe("Events (Mobile)", () => {
  it("should fetch school events", async () => {
    const response = await getEvents({
      schoolId: "school-123",
      limit: 20,
    });
    
    expect(response.success).toBe(true);
    expect(response.data[0]).toHaveProperty(
      "id",
      "title",
      "startDate",
      "description"
    );
  });

  it("should listen to new event notifications", async () => {
    const subscription = subscribeToEvents("school-123", (event) => {
      expect(event).toHaveProperty("id", "title");
    });
    
    // When new event created in backend
    // Client should receive real-time update
  });

  it("should create event (admin only)", async () => {
    const response = await createEvent({
      title: "Sports Day",
      startDate: "2024-04-15",
      description: "Annual sports event",
      schoolId: "school-123",
    });
    
    expect(response.success).toBe(true);
  });
});
```

**What Changed:** Real-time events now use WebSocket connection instead of polling Firestore.

#### 6. Fee Management

**Test Cases:**
```typescript
describe("Fee Management (Mobile)", () => {
  it("should fetch student fee records", async () => {
    const response = await getStudentFees({
      studentId: "stu-123",
    });
    
    expect(response.success).toBe(true);
    expect(response.data[0]).toHaveProperty(
      "amount",
      "feeType",
      "dueDate",
      "paymentStatus"
    );
  });

  it("should calculate total dues", async () => {
    const response = await calculateStudentDues({
      studentId: "stu-123",
      courseYear: 2024,
    });
    
    expect(response.data).toHaveProperty("totalDue", "paidAmount", "pending");
    expect(response.data.totalDue).toBeGreaterThanOrEqual(0);
  });

  it("should show payment history", async () => {
    const response = await getPaymentHistory({
      studentId: "stu-123",
    });
    
    expect(response.data[0]).toHaveProperty(
      "amount",
      "date",
      "method",
      "transactionId"
    );
  });
});
```

**What Changed:** Fee calculations now happen server-side. Payment history comes from `/fees/{studentId}/payments`.

#### 7. Error Handling

**Test Cases:**
```typescript
describe("Error Handling (Mobile)", () => {
  it("should handle 401 Unauthorized", async () => {
    const response = await apiCall({
      endpoint: "/students",
      token: "invalid_token",
    });
    
    expect(response.status).toBe(401);
    expect(response.error.code).toBe("AUTH_INVALID_TOKEN");
    // Trigger login redirect in app
  });

  it("should handle 403 Forbidden", async () => {
    const response = await deleteStudent("stu-123"); // Staff trying to delete
    
    expect(response.status).toBe(403);
    expect(response.error.code).toBe("PERMISSION_DENIED");
  });

  it("should handle 422 Validation Error", async () => {
    const response = await createStudent({
      firstName: "John", // Missing required fields
    });
    
    expect(response.status).toBe(422);
    expect(response.error.fields).toHaveProperty("lastName", "email");
  });

  it("should handle network timeouts", async () => {
    // Simulate slow network
    const response = await apiCall({
      timeout: 5000,
    });
    
    expect(response.error.code).toBe("TIMEOUT");
    // Show retry UI
  });

  it("should handle rate limiting", async () => {
    // Make rapid requests
    const responses = await makeManyRequests(100);
    
    const rateLimited = responses.find((r) => r.status === 429);
    expect(rateLimited).toBeDefined();
  });
});
```

---

## Web Panel Integration Testing

### What to Verify

The Next.js admin panel must validate that all management features still work with PostgreSQL backend.

#### 1. Admin Dashboard

**Test Cases:**
```typescript
describe("Web Panel Dashboard", () => {
  it("should load dashboard with current metrics", async () => {
    const response = await getDashboard({
      schoolId: "school-123",
    });
    
    expect(response.success).toBe(true);
    expect(response.data).toHaveProperty(
      "totalStudents",
      "activeTeachers",
      "attendanceRate",
      "pendingFees"
    );
  });

  it("should cache dashboard data for 1 minute", async () => {
    const start = Date.now();
    const data1 = await getDashboard({ schoolId: "school-123" });
    const data2 = await getDashboard({ schoolId: "school-123" });
    
    expect(data1).toEqual(data2); // Should be same cached response
    expect(Date.now() - start).toBeLessThan(100); // Very fast (cached)
  });

  it("should refresh dashboard when mutation occurs", async () => {
    const cache = getCache("dashboard");
    const cachedValue = cache.get("school-123");
    expect(cachedValue).toBeDefined();
    
    // After creating new student
    await createStudent({ schoolId: "school-123", ... });
    
    // Cache should be cleared
    const newValue = cache.get("school-123");
    expect(newValue).toBeUndefined();
  });
});
```

**What Changed:** Dashboard queries now aggregate from PostgreSQL instead of Firestore. Caching via node-cache added.

#### 2. Student Management UI

**Test Cases:**
```typescript
describe("Web Panel - Student Management", () => {
  it("should render student list with pagination controls", async () => {
    const students = await getStudents({
      schoolId: "school-123",
      limit: 50,
      skip: 0,
    });
    
    expect(students.meta.total).toBeGreaterThan(0);
    expect(students.meta.hasMore).toBeDefined();
  });

  it("should support bulk operations", async () => {
    const response = await bulkUpdateStudents({
      studentIds: ["stu-1", "stu-2", "stu-3"],
      updates: { classId: "class-11-a" },
    });
    
    expect(response.success).toBe(true);
    expect(response.data.updated).toBe(3);
  });

  it("should export students to CSV", async () => {
    const csv = await exportStudents({
      schoolId: "school-123",
      format: "csv",
    });
    
    expect(csv).toContain("firstname,lastname,email");
  });

  it("should import students from CSV", async () => {
    const file = new File([csvData], "students.csv");
    const response = await importStudents(file);
    
    expect(response.success).toBe(true);
    expect(response.data.imported).toBeGreaterThan(0);
  });

  it("should soft-delete student (not hard delete)", async () => {
    const response = await deleteStudent("stu-123");
    
    expect(response.success).toBe(true);
    // Student should still be queryable with isDeleted filter
  });
});
```

**What Changed:** Bulk operations now use dedicated endpoints. Delete becomes soft-delete with isDeleted flag.

#### 3. Fee Collection & Payments

**Test Cases:**
```typescript
describe("Web Panel - Fee Management", () => {
  it("should generate fee structure for academic year", async () => {
    const response = await generateFees({
      schoolId: "school-123",
      academicYear: 2024,
      feeStructure: {
        tuition: 50000,
        transport: 10000,
        exam: 5000,
      },
    });
    
    expect(response.success).toBe(true);
    expect(response.data.feeRecords).toBeGreaterThan(0);
  });

  it("should show fee collection dashboard", async () => {
    const response = await getFeeStats({
      schoolId: "school-123",
    });
    
    expect(response.data).toHaveProperty(
      "totalDue",
      "totalCollected",
      "collectionRate",
      "outstandingFees"
    );
  });

  it("should mark payment received", async () => {
    const response = await markPayment({
      feeId: "fee-001",
      amount: 50000,
      method: "bank_transfer",
      transactionId: "TXN-12345",
    });
    
    expect(response.success).toBe(true);
    // Should auto-generate invoice
    expect(response.data.invoiceId).toBeDefined();
  });

  it("should generate invoice PDF", async () => {
    const response = await generateInvoice({
      feeId: "fee-001",
      format: "pdf",
    });
    
    expect(response.data.url).toBeDefined();
    expect(response.data.filename).toContain(".pdf");
  });

  it("should send payment reminder emails", async () => {
    const response = await sendPaymentReminders({
      schoolId: "school-123",
      daysOverdue: 30,
    });
    
    expect(response.data.emailsSent).toBeGreaterThan(0);
  });
});
```

**What Changed:** Fee generation now server-side. Invoices auto-generated. Reminders use email service API.

#### 4. Subscription & Billing

**Test Cases:**
```typescript
describe("Web Panel - Subscription", () => {
  it("should show subscription details", async () => {
    const response = await getSubscription({
      schoolId: "school-123",
    });
    
    expect(response.data).toHaveProperty(
      "subscriptionPlan",
      "renewalDate",
      "studentLimit",
      "activeStudents"
    );
  });

  it("should prevent actions exceeding plan limits", async () => {
    const school = await getSchool("school-123");
    const plan = getPlanLimits(school.subscriptionPlan);
    
    if (school.activeStudents >= plan.maxStudents) {
      const response = await createStudent({ ... });
      expect(response.status).toBe(429); // Plan limit exceeded
    }
  });

  it("should display upgrade options", async () => {
    const response = await getAvailablePlans({
      currentPlan: "basic",
    });
    
    expect(response.data.length).toBeGreaterThan(0);
    response.data.forEach((plan) => {
      expect(plan).toHaveProperty("name", "price", "features");
    });
  });

  it("should process upgrade request", async () => {
    const response = await upgradeSubscription({
      schoolId: "school-123",
      newPlan: "premium",
      billingCycle: "annual",
    });
    
    expect(response.success).toBe(true);
    // Should create subscription change request
  });

  it("should handle webhook payment success", async () => {
    const webhook = {
      type: "charge.succeeded",
      data: {
        amount: 10000,
        currency: "INR",
        schoolId: "school-123",
      },
    };
    
    const response = await processPaymentWebhook(webhook);
    expect(response.success).toBe(true);
    // Subscription status should update
  });
});
```

**What Changed:** Subscription enforcement now server-side. Webhook signature validation required.

#### 5. Reports & Analytics

**Test Cases:**
```typescript
describe("Web Panel - Reports", () => {
  it("should generate attendance report", async () => {
    const response = await generateReport({
      type: "attendance",
      startDate: "2024-03-01",
      endDate: "2024-03-31",
      classId: "class-10-a",
    });
    
    expect(response.data.fileName).toContain("attendance");
    expect(response.data.url).toBeDefined();
  });

  it("should generate result card", async () => {
    const response = await generateResultCard({
      studentId: "stu-123",
      academicYear: 2024,
    });
    
    expect(response.data).toHaveProperty("studentName", "results", "gpa");
  });

  it("should generate admin audit log", async () => {
    const response = await getAuditLog({
      schoolId: "school-123",
      limit: 100,
      filters: {
        action: "delete", // Only deletions
      },
    });
    
    expect(response.data[0]).toHaveProperty(
      "action",
      "user",
      "timestamp",
      "target"
    );
  });
});
```

**What Changed:** Reports now generated server-side with PostgreSQL aggregations. Audit logs stored in DB.

---

## Integration Test Checklist

### Before Production
- [ ] All mobile endpoints respond with correct format
- [ ] Web panel shows accurate data from PostgreSQL
- [ ] Pagination works correctly (limit, skip, hasMore)
- [ ] Caching functions as expected (ttl honored)
- [ ] Cache invalidation triggers on mutations
- [ ] File uploads/downloads work correctly
- [ ] Error responses match documented format
- [ ] Rate limiting enforced on endpoints
- [ ] Security headers present in responses
- [ ] CORS configured for frontend apps

### Performance Validation
- [ ] Dashboard loads in < 500ms
- [ ] Student list returns in < 1s (100 records)
- [ ] Attendance bulk mark handles 1000+ records
- [ ] Fee collection report generates in < 5s
- [ ] No N+1 queries on list endpoints
- [ ] Caching reduces response time by 50%+

### Data Migration Validation
- [ ] All Firestore data successfully migrated
- [ ] No data loss in the transition
- [ ] Foreign key relationships maintained
- [ ] Audit trail preserved from Firestore
- [ ] User accounts still functional

---

## Troubleshooting

### Issue: "Invalid token format"
**Cause**: Token format changed between Firestore and PostgreSQL backend
**Solution**: Update mobile/web to expect new JWT format

### Issue: "Student not found"
**Cause**: Firestore IDs might differ from PostgreSQL UUIDs
**Solution**: Verify ID migration script ran correctly

### Issue: "Slow dashboard load"
**Cause**: Cache not working or cache key mismatch
**Solution**: Check cache invalidation logic in middleware

### Issue: "Rate limiting too aggressive"
**Cause**: Rate limits not configured properly
**Solution**: Check backend middleware configuration

---

##Reference Endpoints

- GET/POST `/api/v1/students` - Student management
- POST `/api/v1/attendance` - Mark attendance
- POST `/api/v1/attendance/bulk-mark` - Bulk attendance
- GET/POST `/api/v1/fees` - Fee management
- GET/POST `/api/v1/activities` - Activity feed
- GET `/api/v1/subscriptions/{schoolId}` - Subscription info
- POST `/api/v1/auth/login` - Authentication
- GET `/api/v1/auth/user` - Current user
- POST `/api/v1/auth/refresh` - Token refresh
