# Cedar Terrace Mobile App

Offline-first mobile application for parking enforcement observation capture.

## Overview

The mobile app enables field enforcement officers to capture vehicle observations with photo and text evidence, even without network connectivity. Observations are queued locally and synchronized to the backend when connectivity is available.

## Architecture

### Tech Stack

- **Framework**: Expo + React Native
- **UI Library**: React Native Paper (Material Design)
- **Navigation**: React Navigation (Bottom Tabs)
- **State Management**: Zustand
- **Local Storage**: SQLite (expo-sqlite) + AsyncStorage
- **Camera**: expo-camera
- **Image Processing**: expo-image-manipulator
- **Type Safety**: TypeScript

### Key Features

#### Offline-First Operation
- All observations captured locally in SQLite database
- Photos stored on device file system
- Background synchronization when online
- Idempotent submission prevents duplicates
- Retry logic for failed uploads

#### Capture Workflow
1. **Vehicle Information**: License plate, state, registration details
2. **Evidence Collection**: Photos with intent tagging, text notes
3. **Review & Submit**: Verify all information before queueing

#### Evidence Types
- **Photos**: Captured with camera or selected from gallery
  - Primary Vehicle View
  - Secondary Vehicle View
  - Registration/Plate
  - Handicapped Placard
  - General
- **Text Notes**: Free-form contextual information

#### Queue Management
- Visual status indicators (pending, uploading, submitting, submitted, failed)
- Statistics dashboard (total, pending, failed, submitted)
- Manual sync trigger
- Retry failed submissions
- View observation details and errors

## Project Structure

```
mobile/
├── src/
│   ├── api/
│   │   ├── client.ts           # Backend API client
│   │   └── sync.ts             # Background sync service
│   ├── components/
│   │   ├── CameraView.tsx      # Camera interface
│   │   ├── PhotoIntentPicker.tsx  # Evidence intent selector
│   │   ├── TextNoteInput.tsx   # Text note dialog
│   │   ├── EvidenceList.tsx    # Evidence review/display
│   │   └── index.ts
│   ├── screens/
│   │   ├── CaptureScreen.tsx   # Main capture workflow
│   │   ├── QueueScreen.tsx     # Sync queue display
│   │   └── index.ts
│   ├── services/
│   │   ├── database.ts         # SQLite operations
│   │   ├── storage.ts          # AsyncStorage utilities
│   │   └── queue.ts            # Queue management
│   ├── store/
│   │   ├── capture-store.ts    # Current observation state
│   │   ├── queue-store.ts      # Queue state
│   │   └── auth-store.ts       # Authentication state
│   └── types/
│       └── index.ts            # TypeScript types
├── App.tsx                     # Root component with navigation
└── package.json
```

## Database Schema

### queue_observations
```sql
CREATE TABLE queue_observations (
  id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE NOT NULL,
  site_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  license_plate TEXT,
  issuing_state TEXT,
  registration_month INTEGER,
  registration_year INTEGER,
  parking_position_id TEXT,
  status TEXT NOT NULL,
  error_message TEXT,
  backend_observation_id TEXT,
  created_at TEXT NOT NULL
);
```

### queue_evidence
```sql
CREATE TABLE queue_evidence (
  id TEXT PRIMARY KEY,
  queue_observation_id TEXT NOT NULL,
  type TEXT NOT NULL,
  intent TEXT,
  note_text TEXT,
  local_photo_uri TEXT,
  s3_key TEXT,
  captured_at TEXT,
  FOREIGN KEY (queue_observation_id) REFERENCES queue_observations(id) ON DELETE CASCADE
);
```

## Sync Process

1. **Load Pending**: Query SQLite for observations with status `pending` or `failed`
2. **Upload Photos**: For each observation:
   - Request pre-signed S3 URL from backend
   - Upload photo directly to S3
   - Store S3 key in local database
3. **Submit Observation**: POST to `/api/v1/observations/submit` with:
   - Observation details
   - Evidence items with S3 keys or note text
   - Idempotency key (prevents duplicates)
4. **Handle Response**:
   - Success (200): Mark as `submitted`, store backend observation ID
   - Already Submitted (409): Mark as `submitted` (idempotency worked)
   - Error: Mark as `failed`, store error message
5. **Retry**: Failed observations can be retried manually

## State Management

### CaptureStore (Zustand)
- Current observation being captured
- Vehicle information
- Photo and note arrays
- Validation logic
- Reset after submission

### QueueStore (Zustand)
- List of queued observations
- Statistics (total, pending, failed, submitted)
- Load from SQLite
- Add to queue
- Update status

### AuthStore (Zustand)
- User ID persistence
- Authentication state

## Components

### CameraView
- Full-screen camera interface
- Front/back camera toggle
- Capture button with compression (max 1920px width, 80% quality)
- Permission handling

### PhotoIntentPicker
- Modal dialog for selecting photo purpose
- 5 intent options with descriptions
- Material Design styling

### TextNoteInput
- Modal dialog for text notes
- Multiline input (500 char limit)
- Character counter

### EvidenceList
- Display photos and notes
- Remove evidence items
- Intent chips
- Empty state

### CaptureScreen
- Multi-step wizard (Vehicle → Evidence → Review)
- Segmented button step indicator
- Form validation
- Evidence collection interface
- Review summary
- Submit to queue

### QueueScreen
- Statistics dashboard
- Sync now button
- Observation cards with status
- Error messages
- Retry failed submissions
- Pull to refresh

## Development

### Setup
```bash
cd mobile
npm install
```

### Run
```bash
# Start Expo dev server
npm start

# Run on Android
npm run android

# Run on iOS
npm run ios

# Run in web browser
npm run web
```

### Environment Variables
Create `.env` file:
```
EXPO_PUBLIC_API_BASE_URL=http://localhost:3000
```

## Implementation Status

### Phase 2: Database & Storage Services ✅
- SQLite schema for offline queue
- AsyncStorage utilities for preferences
- Queue service wrapping database operations

### Phase 3: API Client ✅
- Type-safe backend API client
- Photo upload to S3
- Idempotent submission

### Phase 4: State Management ✅
- Capture store (current observation)
- Queue store (submission queue)
- Auth store (user state)

### Phase 5: Camera & Evidence Components ✅
- CameraView with compression
- PhotoIntentPicker dialog
- TextNoteInput dialog
- EvidenceList display

### Phase 6: CaptureScreen Workflow ✅
- Multi-step capture wizard
- Vehicle information form
- Evidence collection UI
- Review and submit

### Phase 7: QueueScreen Display ✅
- Queue list with status
- Statistics dashboard
- Sync trigger
- Retry logic

### Phase 8: Sync Service ✅
- Background synchronization
- Photo upload to S3
- Idempotent submission
- Error handling

### Remaining Work
- **Phase 9**: Settings screen (full implementation)
- **Phase 10**: Position selection map/list
- **Phase 11**: App polish (loading states, error boundaries)
- **Phase 12**: Testing and deployment

## Testing

### Manual Testing Checklist
- [ ] Capture observation with photo
- [ ] Capture observation with text note
- [ ] Capture observation with multiple evidence items
- [ ] Queue observation when offline
- [ ] Sync observation when online
- [ ] Handle failed submission and retry
- [ ] Verify idempotency (duplicate submission prevented)
- [ ] Test camera permissions
- [ ] Test photo compression
- [ ] Verify SQLite persistence across app restarts

### Integration with Backend
The mobile app integrates with the Cedar Terrace backend API:
- `POST /api/v1/observations/submit` - Submit observation (idempotent)
- `GET /api/v1/storage/upload-url` - Get S3 pre-signed URL
- Direct S3 upload via pre-signed URL
- `GET /api/v1/sites` - List sites
- `GET /api/v1/positions` - List parking positions

## Next Steps

1. Implement full Settings screen with:
   - Site selection
   - User profile
   - Photo quality settings
   - Sync preferences
2. Add position selection interface:
   - Map view with lot image overlay
   - Position list view
   - Search and filter
3. Polish and error handling:
   - Loading states throughout
   - Error boundaries
   - Network status indicator
   - Background sync indicator
4. Testing and deployment:
   - Write unit tests
   - Write integration tests
   - Build for Android (APK/AAB)
   - Build for iOS (IPA)

## License

Private - Cedar Terrace Project
