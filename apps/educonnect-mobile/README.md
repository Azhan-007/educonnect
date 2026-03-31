<p align="center">
  <img src="./assets/images/icon.png" alt="EduConnect Logo" width="120" height="120">
</p>

<h1 align="center">EduConnect</h1>

<p align="center">
  <strong>A Modern School ERP Mobile Application</strong>
</p>

<p align="center">
  <a href="#features">Features</a> •
  <a href="#tech-stack">Tech Stack</a> •
  <a href="#architecture">Architecture</a> •
  <a href="#installation">Installation</a> •
  <a href="#usage">Usage</a> •
  <a href="#contributing">Contributing</a>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/platform-iOS%20%7C%20Android%20%7C%20Web-blue" alt="Platform">
  <img src="https://img.shields.io/badge/expo-54.0-000020?logo=expo" alt="Expo">
  <img src="https://img.shields.io/badge/react--native-0.81-61DAFB?logo=react" alt="React Native">
  <img src="https://img.shields.io/badge/firebase-12.8-FFCA28?logo=firebase" alt="Firebase">
  <img src="https://img.shields.io/badge/typescript-5.9-3178C6?logo=typescript" alt="TypeScript">
  <img src="https://img.shields.io/badge/license-Private-red" alt="License">
</p>

---

## Overview

**EduConnect** is a comprehensive, cross-platform mobile application designed to streamline school management and enhance communication between students, teachers, parents, and administrators. Built with modern technologies and a premium user experience in mind, EduConnect serves as a centralized hub for all academic activities.

### What Problem Does It Solve?

Traditional school management relies on fragmented systems—paper records, multiple apps, and disconnected communication channels. EduConnect addresses this by providing:

- **Unified Platform**: Single application for attendance, assignments, results, fees, and more
- **Real-time Sync**: Instant updates across all stakeholders via Firebase
- **Role-based Access**: Tailored experiences for students, teachers, and administrators
- **Offline Support**: Seamless functionality with or without internet connectivity
- **Mobile-first Design**: Native experience on iOS, Android, and web

### Target Audience

| Role | Use Case |
|------|----------|
| **Students** | View grades, track attendance, access assignments, pay fees, browse library |
| **Teachers** | Mark attendance, create assignments, manage grades, schedule events |
| **Administrators** | Manage users, configure timetables, oversee fees, control system settings |
| **Parents** | Monitor child's progress, view fee status, receive notifications |

---

## Features

### Core Modules

#### 📊 Dashboard
- Role-specific personalized dashboards
- Today's summary with configurable widgets
- Event carousel and announcements
- Quick action shortcuts

#### ✅ Attendance Management
- Real-time attendance tracking
- Mark attendance by class/subject (teachers)
- View attendance history and statistics (students)
- Percentage calculations and visual analytics

#### 📝 Assignments
- Create and distribute assignments with deadlines
- File attachment support via document picker
- Subject/class/section filtering
- Submission tracking and notifications

#### 📈 Results & Grades
- Comprehensive result management
- Term-wise and subject-wise breakdowns
- Grade calculation and GPA tracking
- Export and share functionality

#### 💰 Fees Management
- Fee structure configuration
- Payment history and receipts
- Pending dues notifications
- Multi-term fee tracking

#### 📚 Library System
- Digital resource management
- Category-based organization
- Teacher content upload
- Student resource access

#### ❓ Question Bank
- Curated question repository
- Subject and topic categorization
- Teacher contribution system
- Student practice mode

#### 📅 Timetable
- Class schedule management
- Teacher schedule view
- Subject and room assignments
- Admin configuration panel

#### 📆 Events & Activities
- School event calendar
- Activity announcements
- Event management for administrators
- Push notifications (planned)

#### 👤 User Profiles
- Complete profile management
- Photo upload capability
- Academic history
- Settings and preferences

---

## Tech Stack

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| **React Native** | 0.81.5 | Cross-platform mobile framework |
| **Expo** | 54.0 | Development toolchain and OTA updates |
| **Expo Router** | 6.0 | File-based navigation and routing |
| **TypeScript** | 5.9 | Type-safe development |
| **React** | 19.1 | UI component library |

### Backend & Database

| Technology | Purpose |
|------------|---------|
| **Firebase** | Backend-as-a-Service platform |
| **Cloud Firestore** | NoSQL document database with real-time sync |
| **Firebase Authentication** | User authentication and session management |
| **Firestore Security Rules** | Role-based access control |

### Key Libraries

| Library | Purpose |
|---------|---------|
| `expo-router` | File-based routing with typed routes |
| `react-native-reanimated` | High-performance animations |
| `react-native-gesture-handler` | Native gesture system |
| `expo-image-picker` | Photo capture and selection |
| `expo-document-picker` | File attachment support |
| `expo-linear-gradient` | Gradient backgrounds |
| `@react-native-async-storage/async-storage` | Local storage persistence |
| `@expo/vector-icons` | Icon library (MaterialCommunityIcons) |

### Development Tools

| Tool | Purpose |
|------|---------|
| **ESLint** | Code linting and formatting |
| **EAS Build** | Cloud builds for iOS/Android |
| **EAS Update** | OTA updates distribution |
| **VS Code** | Recommended IDE |

---

## Architecture

### System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Client Layer                             │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │   iOS App    │  │ Android App  │  │   Web App    │           │
│  │  (Expo Go)   │  │  (Expo Go)   │  │  (Browser)   │           │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘           │
│         │                 │                 │                    │
│         └─────────────────┼─────────────────┘                    │
│                           │                                      │
│         ┌─────────────────▼─────────────────┐                    │
│         │        React Native Core          │                    │
│         │    (Expo Router + TypeScript)     │                    │
│         └─────────────────┬─────────────────┘                    │
└───────────────────────────┼──────────────────────────────────────┘
                            │
┌───────────────────────────┼──────────────────────────────────────┐
│                           ▼                                      │
│  ┌─────────────────────────────────────────────────────────────┐ │
│  │                  Firebase Platform                          │ │
│  ├─────────────────────────────────────────────────────────────┤ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │ │
│  │  │    Auth     │  │  Firestore  │  │  Security Rules     │  │ │
│  │  │  Service    │  │  Database   │  │  (RBAC)             │  │ │
│  │  └─────────────┘  └─────────────┘  └─────────────────────┘  │ │
│  └─────────────────────────────────────────────────────────────┘ │
│                       Backend Layer                              │
└──────────────────────────────────────────────────────────────────┘
```

### Data Flow

```
User Action → Component → Firebase SDK → Firestore → Real-time Listener → UI Update
     ↓
AsyncStorage (Offline Cache) ←─────────────────────────────────────┘
```

### Authentication Flow

```
┌────────────┐     ┌──────────────┐     ┌───────────────┐
│  Login UI  │────▶│ Firebase Auth│────▶│ Firestore DB  │
└────────────┘     └──────────────┘     └───────┬───────┘
                                                │
                   ┌──────────────┐             │
                   │ AsyncStorage │◀────────────┘
                   │ (Session)    │    (Fetch user role/data)
                   └──────┬───────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Role-based Navigation │
              │ Student │ Teacher │ Admin
              └───────────────────────┘
```

---

## Folder Structure

```
educonnect-mobile/
│
├── app/                          # Application screens (file-based routing)
│   ├── _layout.tsx               # Root layout with navigation setup
│   ├── index.tsx                 # Entry point (redirects to login)
│   ├── login.tsx                 # Authentication screen
│   ├── school-select.tsx         # Multi-school selection
│   │
│   ├── (student)/                # Student route group (parallel layouts)
│   │   ├── activities.tsx        # Student activities view
│   │   ├── attendance-screen.tsx # Detailed attendance view
│   │   └── ...
│   │
│   ├── (teacher)/                # Teacher route group
│   │   ├── attendance-screen.tsx # Attendance marking
│   │   └── ...
│   │
│   ├── student/                  # Student module screens
│   │   ├── _layout.tsx           # Student layout wrapper
│   │   ├── dashboard.tsx         # Student home screen
│   │   ├── menu.tsx              # Navigation menu
│   │   ├── attendance.tsx        # Attendance overview
│   │   ├── assignments.tsx       # Assignment list and details
│   │   ├── results.tsx           # Academic results
│   │   ├── fees.tsx              # Fee management
│   │   ├── library.tsx           # Library resources
│   │   ├── question-bank.tsx     # Practice questions
│   │   ├── timetable.tsx         # Class schedule
│   │   ├── activity.tsx          # Extra-curricular activities
│   │   └── profile.tsx           # User profile
│   │
│   ├── teacher/                  # Teacher module screens
│   │   ├── _layout.tsx           # Teacher layout wrapper
│   │   ├── dashboard.tsx         # Teacher home screen
│   │   ├── menu.tsx              # Navigation menu
│   │   ├── attendance.tsx        # Attendance management
│   │   ├── assignments.tsx       # Assignment creation/management
│   │   ├── results.tsx           # Grade entry
│   │   ├── library.tsx           # Resource management
│   │   ├── question-bank.tsx     # Question management
│   │   ├── add-question.tsx      # New question form
│   │   ├── events.tsx            # Event management
│   │   ├── schedule.tsx          # Personal schedule
│   │   ├── activity.tsx          # Activity tracking
│   │   └── profile.tsx           # Profile settings
│   │
│   └── admin/                    # Administrator module screens
│       ├── dashboard.tsx         # Admin control center
│       ├── manage-students.tsx   # Student CRUD operations
│       ├── manage-teachers.tsx   # Teacher CRUD operations
│       ├── attendance.tsx        # Attendance oversight
│       ├── fees.tsx              # Fee configuration
│       ├── library.tsx           # Library administration
│       ├── timetable.tsx         # Timetable configuration
│       ├── events.tsx            # Event administration
│       ├── carousel.tsx          # Dashboard carousel management
│       └── summary-config.tsx    # Widget configuration
│
├── components/                   # Reusable UI components
│   ├── AttendanceCard.tsx        # Attendance display widget
│   ├── BottomNav.tsx             # Bottom navigation bar
│   ├── BottomSheet.tsx           # Modal bottom sheet
│   ├── Card.tsx                  # Base card component
│   ├── CreateAssignmentForm.tsx  # Assignment creation wizard
│   ├── IconCircle.tsx            # Circular icon wrapper
│   ├── LibraryForm.tsx           # Library item form
│   ├── ListItem.tsx              # Standard list item
│   ├── MenuTile.tsx              # Menu grid tile
│   ├── ModalPortal.tsx           # Modal rendering utility
│   ├── ProfileHeader.tsx         # Profile page header
│   ├── ResultForm.tsx            # Result entry form
│   ├── ScheduleForm.tsx          # Schedule entry form
│   ├── Screen.tsx                # Base screen wrapper
│   ├── Section.tsx               # Content section wrapper
│   ├── SectionTitle.tsx          # Section heading
│   └── AssignmentPickers.tsx     # Date/time pickers
│
├── config/                       # Configuration files
│   └── ...
│
├── data/                         # Static data and mock APIs
│   ├── attendance-api.ts         # Attendance data helpers
│   ├── attendance.js             # Mock attendance data
│   └── class.js                  # Class information
│
├── hooks/                        # Custom React hooks
│   └── useAuth.ts                # Authentication hook
│
├── services/                     # Business logic layer
│   └── attendanceService.ts      # Attendance operations
│
├── assets/                       # Static assets
│   └── images/                   # App icons, splash screens
│
├── scripts/                      # Utility scripts
│   └── reset-project.js          # Project reset utility
│
├── firebase.ts                   # Firebase configuration
├── firestore.rules               # Firestore security rules
├── firestore.indexes.json        # Firestore indexes
├── firebase.json                 # Firebase CLI config
├── app.json                      # Expo configuration
├── package.json                  # Dependencies and scripts
├── tsconfig.json                 # TypeScript configuration
├── eslint.config.js              # ESLint configuration
└── eas.json                      # EAS Build configuration
```

---

## UI/UX Design Principles

### Design System

EduConnect follows a strict design token system for consistency:

| Token | Value | Usage |
|-------|-------|-------|
| **Primary Color** | `#E6F4FE` | Backgrounds, highlights |
| **Accent Color** | `#4A90D9` | Interactive elements |
| **Surface** | `#FFFFFF` | Card backgrounds |
| **Text Primary** | `#1A1A1A` | Headings |
| **Text Secondary** | `#6B7280` | Body text, labels |
| **Border Radius (Hero)** | `16px` | Hero cards |
| **Border Radius (Card)** | `12px` | Standard cards |
| **Border Radius (Inner)** | `8px` | Nested elements |

### Design Patterns

- **Card-based Layout**: Content organized in elevated, rounded cards
- **Visual Hierarchy**: Distinct elevation levels (hero → section → inner)
- **Soft UI**: Gentle shadows, subtle gradients, calm color palette
- **Native Feel**: Platform-specific behaviors (iOS/Android)
- **Parallax Scrolling**: Hero cards with subtle motion effect

### Accessibility

- High contrast text for readability
- Touch targets minimum 44x44 points
- Screen reader-friendly labels
- Consistent icon system (MaterialCommunityIcons)

### Responsiveness

- Scales from iPhone SE to iPad Pro
- Web support with responsive breakpoints
- Safe area handling for notched devices

---

## Installation

### Prerequisites

| Requirement | Version | Notes |
|-------------|---------|-------|
| **Node.js** | ≥ 18.x | LTS recommended |
| **npm** | ≥ 9.x | Comes with Node.js |
| **Expo CLI** | Latest | `npx expo` |
| **Git** | Latest | Version control |
| **VS Code** | Latest | Recommended IDE |

#### Optional (for native builds)

| Requirement | Platform | Notes |
|-------------|----------|-------|
| **Xcode** | macOS only | iOS simulator |
| **Android Studio** | All | Android emulator |
| **Expo Go** | Mobile | Physical device testing |

### Installation Steps

1. **Clone the repository**

   ```bash
   git clone https://github.com/your-org/educonnect-mobile.git
   cd educonnect-mobile
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure Firebase** *(optional: use existing config)*

   The app includes a pre-configured Firebase project. To use your own:
   
   ```typescript
   // firebase.ts
   const firebaseConfig = {
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_AUTH_DOMAIN",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_STORAGE_BUCKET",
     messagingSenderId: "YOUR_MESSAGING_SENDER_ID",
     appId: "YOUR_APP_ID",
     measurementId: "YOUR_MEASUREMENT_ID",
   };
   ```

4. **Start the development server**

   ```bash
   npx expo start
   ```

5. **Run on your device**

   - **Expo Go**: Scan QR code with Expo Go app
   - **iOS Simulator**: Press `i` in terminal
   - **Android Emulator**: Press `a` in terminal
   - **Web Browser**: Press `w` in terminal

---

## Usage

### Running the Application

| Command | Description |
|---------|-------------|
| `npm start` | Start Expo development server |
| `npm run android` | Start on Android emulator |
| `npm run ios` | Start on iOS simulator |
| `npm run web` | Start in web browser |
| `npm run lint` | Run ESLint checks |
| `npm run reset-project` | Reset to blank project |

### Common Workflows

#### Student Login

1. Launch the application
2. Select your school (if multi-school enabled)
3. Enter credentials (username/password)
4. Select "Student" role
5. Access dashboard with personalized content

#### Teacher Attendance Workflow

1. Login as teacher
2. Navigate to **Attendance** from dashboard
3. Select class and subject
4. Mark present/absent for each student
5. Submit attendance (auto-syncs to Firebase)

#### Admin User Management

1. Login as administrator
2. Navigate to **Manage Students** or **Manage Teachers**
3. Add/Edit/Delete user records
4. Configure roles and permissions

---

## Environment Variables

EduConnect uses Firebase configuration embedded in `firebase.ts`. For production deployments, consider using environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `FIREBASE_API_KEY` | Firebase API key | Yes |
| `FIREBASE_AUTH_DOMAIN` | Auth domain | Yes |
| `FIREBASE_PROJECT_ID` | Project identifier | Yes |
| `FIREBASE_STORAGE_BUCKET` | Cloud Storage bucket | Yes |
| `FIREBASE_MESSAGING_SENDER_ID` | FCM sender ID | Yes |
| `FIREBASE_APP_ID` | Application ID | Yes |
| `FIREBASE_MEASUREMENT_ID` | Analytics ID | No |

For EAS builds, configure secrets in `eas.json` or Expo dashboard.

---

## Firestore Data Model

### Collections

| Collection | Description | Access |
|------------|-------------|--------|
| `users` | User profiles and authentication data | Public read, authenticated write |
| `students` | Student records | Authenticated read, admin write |
| `teachers` | Teacher records | Authenticated read, admin write |
| `attendance` | Attendance records | Authenticated read, teacher/admin write |
| `assignments` | Assignment details | Authenticated read, teacher/admin write |
| `results` | Academic results | Authenticated read, teacher/admin write |
| `questionBank` | Question repository | Authenticated read, teacher/admin write |
| `timetable` | Class schedules | Public read, admin write |
| `events` | School events | Public read, admin write |
| `fees` | Fee records | Authenticated read, admin write |
| `library` | Library resources | Authenticated read, teacher/admin write |
| `carousel` | Dashboard banners | Public read, admin write |
| `summaryConfig` | Dashboard widgets | Authenticated read, admin write |

### Security Rules

Role-based access control is enforced via Firestore Security Rules. See `firestore.rules` for complete configuration.

---

## Testing

### Running Tests

```bash
# Unit tests (coming soon)
npm test

# Type checking
npx tsc --noEmit

# Linting
npm run lint
```

### Manual Testing

1. Test on multiple devices using Expo Go
2. Verify offline functionality
3. Test role-based access for each user type
4. Validate form submissions and data persistence

---

## Deployment

### Development Builds

Use Expo Go for rapid development iteration.

### Preview Builds (EAS)

```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login

# Build for internal testing
eas build --profile preview --platform all
```

### Production Builds

```bash
# Production build for app stores
eas build --profile production --platform all

# Submit to app stores
eas submit --platform android
eas submit --platform ios
```

### OTA Updates

```bash
# Push updates without new build
eas update --branch production --message "Bug fixes"
```

### Web Deployment

```bash
# Export static web build
npx expo export -p web

# Deploy to hosting service (Netlify, Vercel, etc.)
```

---

## Future Enhancements

### Planned Features

| Feature | Priority | Status |
|---------|----------|--------|
| Push Notifications (FCM) | High | Planned |
| Parent Portal | High | Planned |
| Chat/Messaging System | Medium | Planned |
| Biometric Authentication | Medium | Planned |
| Report Generation (PDF) | Medium | Planned |
| Multi-language Support (i18n) | Medium | Planned |
| Dark Mode | Low | Planned |
| Offline-first Architecture | High | In Progress |
| Analytics Dashboard | Low | Planned |

### Technical Improvements

- [ ] Unit and integration test suite
- [ ] E2E testing with Detox
- [ ] CI/CD pipeline (GitHub Actions)
- [ ] Performance monitoring
- [ ] Error tracking (Sentry)
- [ ] API documentation (OpenAPI)

---

## Contributing

We welcome contributions from the community. Please follow these guidelines:

### Getting Started

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow the existing code style and TypeScript conventions
- Use `StyleSheet.create()` for all styles (no inline styles)
- Maintain strict typing (avoid `any`)
- Only use MaterialCommunityIcons for icons
- Write descriptive commit messages
- Update documentation for significant changes

### Code Review Criteria

- [ ] TypeScript types are properly defined
- [ ] Components follow established patterns
- [ ] No console.log statements in production code
- [ ] Handles loading/error states appropriately
- [ ] Responsive across device sizes

---

## Documentation

### Additional Guides

| Document | Description |
|----------|-------------|
| [Admin Setup Guide](./ADMIN_CONFIG_SETUP.md) | Administrator configuration |
| [User Creation Guide](./ADMIN_USER_CREATION_GUIDE.md) | Creating user accounts |
| [Carousel Setup](./CAROUSEL_SETUP.md) | Dashboard carousel configuration |
| [Events Setup](./EVENTS_SETUP.md) | Event management guide |
| [Timetable Setup](./TIMETABLE_ADMIN_SETUP.md) | Timetable configuration |
| [Question Bank Setup](./QUESTION_BANK_SETUP.md) | Question bank management |
| [Firebase Permissions](./FIREBASE_PERMISSION_FIX.md) | Fixing permission issues |
| [School Branding](./SCHOOL_BRANDING_GUIDE.md) | Customizing school branding |

---

## License

This project is **proprietary software**. All rights reserved.

Unauthorized copying, modification, distribution, or use of this software is strictly prohibited without express written permission from the project owner.

---

## Credits & Acknowledgments

### Development Team

- **EduConnect Team** — Design, Development, and Maintenance

### Technologies

- [Expo](https://expo.dev/) — React Native development platform
- [Firebase](https://firebase.google.com/) — Backend services
- [React Native](https://reactnative.dev/) — Mobile framework
- [TypeScript](https://www.typescriptlang.org/) — Programming language

### Resources

- [Expo Documentation](https://docs.expo.dev/)
- [React Native Documentation](https://reactnative.dev/docs/getting-started)
- [Firebase Documentation](https://firebase.google.com/docs)
- [Expo Router Documentation](https://docs.expo.dev/router/introduction/)

---

<p align="center">
  <sub>Built with ❤️ using Expo and React Native</sub>
</p>

<p align="center">
  <sub>© 2026 EduConnect. All rights reserved.</sub>
</p>
