# Cedar Terrace - Ticket Recipient Portal

Parking violation ticket portal for recipients to view violation details via QR code.

## Features

- QR code-based ticket access
- Email authentication with activation link
- Profile completion requirement
- Ticket details viewing with evidence photos
- Responsive mobile-first design

## Development

```bash
# Install dependencies (from root)
npm install

# Run development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Create `.env` file:

```
VITE_API_BASE_URL=http://localhost:3000
```

## User Flow

1. **Landing** (`/?qr=NT-XXXXX`)
   - User scans QR code from printed notice
   - Enters email address
   - System sends activation email

2. **Activation** (`/activate/:token`)
   - User clicks link in email
   - Email is verified
   - Redirects to profile completion

3. **Profile** (`/profile`)
   - User enters first name, last name, phone (optional)
   - Profile completion required before ticket access

4. **Ticket** (`/ticket`)
   - View violation details
   - See evidence photos
   - Read notice instructions and deadlines

## Tech Stack

- React 18 + TypeScript
- Vite - Build tool
- React Router - Routing
- Zustand - State management
- Tailwind CSS - Styling

## API Integration

All API calls are made through `src/api/client.ts` which connects to the backend at port 3000 (development) or `/api` (production).

Protected routes check email verification and profile completion status before allowing access.
