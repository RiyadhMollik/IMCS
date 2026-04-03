# Audio/Video Call App - Next.js Frontend

Modern Next.js frontend for the audio/video calling application with WebRTC and mediasoup SFU support.

## ✨ Features

- 🎥 Video & Audio Calling with WebRTC
- 🛰️ mediasoup SFU conference routing for group calls
- 🔐 JWT Authentication
- 👥 Real-time Online Users
- 📱 Responsive Design with Tailwind CSS
- 🔔 Incoming Call Notifications
- 🎨 Beautiful UI/UX
- ⚡ Fast Performance with Next.js
- 🎯 TypeScript Support
- 🪝 Custom React Hooks

## 🏗️ Architecture

```
src/
├── components/           # Reusable UI components
│   ├── UserCard.tsx
│   ├── VideoCallModal.tsx
│   └── IncomingCallModal.tsx
├── contexts/            # React Context providers
│   └── AuthContext.tsx
├── hooks/               # Custom React hooks
│   ├── useWebRTC.ts    # WebRTC logic
│   └── usePresence.ts  # Online users & notifications
├── lib/                 # Utilities
│   └── api.ts          # Axios instance with interceptors
├── pages/              # Next.js pages
│   ├── _app.tsx
│   ├── index.tsx
│   ├── login.tsx
│   ├── register.tsx
│   └── dashboard.tsx
└── styles/             # Global styles
    └── globals.css
```

## 🚀 Quick Start

### Prerequisites

- Node.js 18+ installed
- Django backend running on http://127.0.0.1:8001
- npm or yarn package manager

### Installation

1. **Navigate to the frontend directory:**
   ```bash
   cd nextjs-frontend
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Configure environment variables:**
   The `.env.local` file is already configured with defaults:
   ```env
   NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001/api
   NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:8001/ws
  NEXT_PUBLIC_MEDIASOUP_URL=http://127.0.0.1:4000
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   Navigate to [http://localhost:3000](http://localhost:3000)

## 📦 Available Scripts

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm start` - Start production server
- `npm run lint` - Run ESLint

## 🔧 Configuration

### Environment Variables

Create or modify `.env.local`:

```env
# Backend API URL
NEXT_PUBLIC_API_BASE=http://127.0.0.1:8001/api

# WebSocket URL
NEXT_PUBLIC_WS_BASE=ws://127.0.0.1:8001/ws

# mediasoup SFU URL
NEXT_PUBLIC_MEDIASOUP_URL=http://127.0.0.1:4000
```

Run the mediasoup service before starting group conference calls.

### Django Backend

Make sure your Django backend has CORS configured for `http://localhost:3000`:

```python
# config/settings.py
CORS_ALLOWED_ORIGINS = [
    'http://localhost:3000',  # Next.js dev server
    'http://127.0.0.1:3000',
]
```

## 🎯 Key Features Explained

### Authentication Context

The `AuthContext` provides global authentication state:

```tsx
import { useAuth } from '@/contexts/AuthContext';

function MyComponent() {
  const { user, login, logout, isAuthenticated } = useAuth();
  // Use authentication methods
}
```

### WebRTC Hook

The `useWebRTC` hook handles all WebRTC logic:

```tsx
import { useWebRTC } from '@/hooks/useWebRTC';

function VideoCall() {
  const {
    localVideoRef,
    remoteVideoRef,
    startCall,
    endCall,
    toggleAudio,
    toggleVideo,
  } = useWebRTC();
  // Use WebRTC methods
}
```

### Presence Hook

The `usePresence` hook manages online users and incoming calls:

```tsx
import { usePresence } from '@/hooks/usePresence';

function Dashboard() {
  const { onlineUsers, incomingCall, rejectCall } = usePresence();
  // Display online users and handle incoming calls
}
```

## 📱 Pages

### `/login` - Login Page
- Username and password authentication
- Error handling
- Auto-redirect if already authenticated

### `/register` - Registration Page
- Create new account
- Email validation
- Password confirmation

### `/dashboard` - Main Dashboard
- View online users
- Start video/audio calls
- Accept/reject incoming calls
- Active call interface

## 🎨 Styling

The app uses **Tailwind CSS** for styling with a custom color scheme:

```javascript
// tailwind.config.js
colors: {
  primary: '#667eea',    // Purple
  secondary: '#764ba2',  // Dark purple
}
```

## 🔒 Security

- JWT tokens stored in cookies
- Automatic token refresh
- Protected routes with authentication checks
- Secure WebSocket connections

## 🐛 Troubleshooting

### Port Already in Use

If port 3000 is already in use:
```bash
npm run dev -- -p 3001
```

### CORS Errors

Make sure Django backend allows `http://localhost:3000` in CORS settings.

### WebSocket Connection Issues

1. Ensure Django backend is running
2. Check that Redis is running
3. Verify WebSocket URL in `.env.local`

### Video/Audio Not Working

1. Grant camera/microphone permissions
2. Check browser console for errors
3. Ensure HTTPS in production (WebRTC requirement)

## 🚀 Production Deployment

### Build for Production

```bash
npm run build
npm start
```

### Environment Variables for Production

```env
NEXT_PUBLIC_API_BASE=https://your-api-domain.com/api
NEXT_PUBLIC_WS_BASE=wss://your-api-domain.com/ws
```

### Deployment Platforms

- **Vercel** (Recommended for Next.js)
- **Netlify**
- **AWS Amplify**
- **Docker**

## 📚 Tech Stack

- **Next.js 14** - React framework
- **React 18** - UI library
- **TypeScript** - Type safety
- **Tailwind CSS** - Styling
- **Axios** - HTTP client
- **WebRTC** - Real-time communication
- **WebSocket** - Real-time updates

## 🆚 Comparison with Vanilla JS Version

| Feature | Vanilla JS | Next.js |
|---------|-----------|---------|
| Code Organization | 959 lines in one file | Modular components & hooks |
| State Management | Global variables | React Context & Hooks |
| Type Safety | None | Full TypeScript support |
| Performance | Good | Excellent (Virtual DOM) |
| Maintainability | Hard | Easy |
| Reusability | Limited | High |
| Testing | Difficult | Easy with React Testing Library |

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is part of the Audio/Video Call application.

## 🆘 Support

If you encounter any issues:
1. Check the browser console for errors
2. Verify Django backend is running
3. Check environment variables
4. Review the troubleshooting section above

## 🎉 Success!

You now have a modern, production-ready Next.js frontend for your video calling app!

Happy coding! 🚀
