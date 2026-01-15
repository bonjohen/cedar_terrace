# Test Parking Lot Layout

**Generated**: 2026-01-14
**Purpose**: Testing and development

## Overview

This is a simple test parking lot with 12 parking spaces arranged in 2 rows of 6. The layout includes different parking position types to test all enforcement scenarios.

## Parking Lot Dimensions

- **Width**: 1200px
- **Height**: 800px
- **Space Radius**: 60px (120px diameter per space)

## Layout Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Cedar Terrace Test Lot                        │
│                                                                       │
│  Row 1 (y=200):                                                      │
│    [H1]  [H2]  [3]   [4]   [P5]  [P6]                              │
│     ♿    ♿    👥    👥    🔒   🔒                                 │
│                                                                       │
│                                                                       │
│  Row 2 (y=600):                                                      │
│    [7]   [8]   [R9]  [P10] [P11] [12]                              │
│     👥    👥    🅁    🔒   🔒    👥                                │
│                                                                       │
└─────────────────────────────────────────────────────────────────────┘
```

## Parking Spaces Detail

### Row 1 (Top, y=200)

| Space | Type        | Identifier | X Position | Description                |
|-------|-------------|------------|------------|----------------------------|
| H1    | HANDICAPPED | H1         | 150        | Handicapped space 1        |
| H2    | HANDICAPPED | H2         | 300        | Handicapped space 2        |
| 3     | OPEN        | 3          | 450        | Open parking               |
| 4     | OPEN        | 4          | 600        | Open parking               |
| P5    | PURCHASED   | P5         | 750        | Reserved for unit 101      |
| P6    | PURCHASED   | P6         | 900        | Reserved for unit 102      |

### Row 2 (Bottom, y=600)

| Space | Type        | Identifier | X Position | Description                |
|-------|-------------|------------|------------|----------------------------|
| 7     | OPEN        | 7          | 150        | Open parking               |
| 8     | OPEN        | 8          | 300        | Open parking               |
| R9    | RESERVED    | R9         | 450        | Reserved for management    |
| P10   | PURCHASED   | P10        | 600        | Reserved for unit 103      |
| P11   | PURCHASED   | P11        | 750        | Reserved for unit 104      |
| 12    | OPEN        | 12         | 900        | Open parking               |

## Position Types

### HANDICAPPED (2 spaces: H1, H2)
- Requires valid handicapped placard or plate
- Violations created if no placard evidence
- Can be resolved with subsequent placard photos

### OPEN (5 spaces: 3, 4, 7, 8, 12)
- Available to all vehicles
- No authorization required
- Can still receive violations for expired registration

### PURCHASED (4 spaces: P5, P6, P10, P11)
- Reserved for specific residents/units
- Requires vehicle assignment
- Violations created for unauthorized vehicles

### RESERVED (1 space: R9)
- Reserved for specific purpose (management, guest, etc.)
- Requires vehicle assignment
- Similar to PURCHASED but different semantic meaning

## Test Vehicles

The seed script creates 3 test vehicles:

| License Plate | State | Make   | Model | Color |
|--------------|-------|--------|-------|-------|
| ABC123       | CA    | Toyota | Camry | Blue  |
| XYZ789       | WA    | Honda  | Civic | Red   |
| DEF456       | OR    | Ford   | F150  | Black |

## Testing Scenarios

### Scenario 1: Unauthorized Stall Usage
- Park vehicle ABC123 in space P5 (reserved for unit 101)
- Should create UNAUTHORIZED_STALL violation

### Scenario 2: Handicapped Without Placard
- Park vehicle XYZ789 in space H1
- Should create HANDICAPPED_NO_PLACARD violation
- Later add placard photo to resolve

### Scenario 3: Open Parking (Valid)
- Park any vehicle in spaces 3, 4, 7, 8, or 12
- Should not create violation (unless registration expired)

### Scenario 4: Progressive Handicapped Evidence
1. Observe vehicle in H1 without visible placard → Violation created
2. Later observation adds placard photo → Violation automatically resolved
3. Demonstrates progressive evidence evaluation

## Database Seeding

### Run the Seed Script

```bash
cd backend
npm run seed
```

This will:
1. Build the backend TypeScript code
2. Create the test site "Cedar Terrace Test Site"
3. Create a lot image reference
4. Create all 12 parking positions
5. Create 3 test vehicles

### Reset Database

To clear all data and reseed:

```bash
cd backend
npm run db:reset
```

This will:
1. Run all migrations
2. Seed the test data

### Clear Data Only

To just clear all data without reseeding:

```bash
cd backend
npm run build
node -r dotenv/config dist/db/seed.js clear
```

## Coordinates Reference

All positions use a circle model with:
- **Center (x, y)**: Position of the circle center
- **Radius**: 60px (spaces are 120px diameter)

Position matching uses the formula:
```
distance = sqrt((px - x)² + (py - y)²)
matched = distance <= radius
```

## Future Enhancements

When you provide the real parking lot map:
1. Replace the lot image s3_key reference
2. Update width and height dimensions
3. Add actual parking positions based on the real layout
4. Keep test data script for development purposes

## API Testing

Once seeded, you can test the API endpoints:

```bash
# Get all positions for the site
GET /api/v1/parking-positions/site/{siteId}

# Find position at coordinates (e.g., space H1)
POST /api/v1/parking-positions/find-at-point
{
  "lotImageId": "{lotImageId}",
  "x": 150,
  "y": 200
}

# Submit an observation
POST /api/v1/observations/submit
{
  "idempotencyKey": "test-obs-1",
  "siteId": "{siteId}",
  "observedAt": "2026-01-14T12:00:00Z",
  "licensePlate": "ABC123",
  "issuingState": "CA",
  "parkingPositionId": "{positionId}",
  "evidence": [
    {
      "type": "TEXT_NOTE",
      "noteText": "Test observation"
    }
  ]
}
```

## Notes

- Site ID and Lot Image ID will be printed when you run the seed script
- Save these IDs for API testing
- The seed script is idempotent-safe - it will add new data each time
- Use `npm run db:reset` to start fresh
