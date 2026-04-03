# Audio & Video Calling System

A production-ready audio and video calling system built with **Django Rest Framework**, **Django Channels**, **WebRTC**, **mediasoup SFU**, and **MySQL**.

## 🎯 Features

- ✅ Audio & Video calling
- ✅ Real-time WebRTC signaling via WebSockets
- ✅ mediasoup SFU for scalable group audio/video
- ✅ JWT Authentication
- ✅ Call management (start, accept, reject, end, cancel)
- ✅ Call history & missed calls tracking
- ✅ Online/offline user status
- ✅ MySQL database for persistent storage
- ✅ REST API for call control
- ✅ Production-ready architecture

## 🏗️ Architecture

```
Frontend (Web/Mobile)
        ↓
    REST API (DRF)
        ↓
    WebSocket (Django Channels)
        ↓
   WebRTC Signaling (Django Channels)
      ↓
   mediasoup SFU (Server-side media routing)
        ↓
    STUN/TURN Servers
```

### Technology Stack

| Component | Technology |
|-----------|-----------|
| Backend Framework | Django 4.2 |
| REST API | Django Rest Framework |
| WebSockets | Django Channels |
| Database | MySQL |
| Authentication | JWT (Simple JWT) |
| Real-time Signaling | Redis + Channels |
| Group Media Streaming | WebRTC + mediasoup SFU |

## SFU Server (mediasoup)

Group conference media is now routed by mediasoup.

1. Go to the SFU folder:

```bash
cd mediasoup-server
```

2. Create environment file:

```bash
cp .env.example .env
```

3. Install and run:

```bash
npm install
npm run dev
```

Default mediasoup server URL is `http://localhost:4000`.

For Docker or NAT deployments set `ANNOUNCED_IP` in `mediasoup-server/.env` to a browser-reachable public IP or hostname.

## 📋 Prerequisites

- Python 3.8+
- MySQL 8.0+
- Redis 6.0+
- pip & virtualenv

## 🚀 Installation

### 1. Clone the repository

```bash
cd audio-video-call
```

### 2. Create virtual environment

```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Configure MySQL

Create a MySQL database:

```sql
CREATE DATABASE audiocall_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'audiocall_user'@'localhost' IDENTIFIED BY 'your_password';
GRANT ALL PRIVILEGES ON audiocall_db.* TO 'audiocall_user'@'localhost';
FLUSH PRIVILEGES;
```

### 5. Setup environment variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and configure:

```env
DEBUG=True
SECRET_KEY=your-secret-key-here
DB_NAME=audiocall_db
DB_USER=audiocall_user
DB_PASSWORD=your_password
DB_HOST=localhost
DB_PORT=3306
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
```

### 6. Run migrations

```bash
python manage.py makemigrations
python manage.py migrate
```

### 7. Create superuser

```bash
python manage.py createsuperuser
```

### 8. Start Redis (required for WebSockets)

```bash
redis-server
```

### 9. Run the development server

```bash
python manage.py runserver
```

Or for production with Daphne (ASGI server):

```bash
daphne -b 0.0.0.0 -p 8001 config.asgi:application
```

## 📡 API Endpoints

### Authentication

```http
POST   /api/token/              # Get JWT tokens
POST   /api/token/refresh/      # Refresh access token
```

### Users

```http
POST   /api/users/              # Register new user
GET    /api/users/me/           # Get current user
GET    /api/users/online_users/ # Get online users
POST   /api/users/set_online/   # Set status to online
POST   /api/users/set_offline/  # Set status to offline
```

### Calls

```http
POST   /api/calls/              # Initiate a call
GET    /api/calls/              # List all calls
GET    /api/calls/{id}/         # Get call details
POST   /api/calls/{id}/accept/  # Accept incoming call
POST   /api/calls/{id}/reject/  # Reject incoming call
POST   /api/calls/{id}/end/     # End ongoing call
POST   /api/calls/{id}/cancel/  # Cancel outgoing call
GET    /api/calls/history/      # Get call history
GET    /api/calls/active/       # Get active calls
GET    /api/calls/missed/       # Get missed calls
```

## 🔌 WebSocket Connection

### Connect to WebSocket

```javascript
const roomId = 'unique-room-id';
const token = 'your-jwt-token';
const ws = new WebSocket(`ws://localhost:8001/ws/call/${roomId}/`);
```

### WebSocket Message Types

#### Client → Server

```javascript
// Send offer
{
  "type": "call-offer",
  "offer": { /* SDP offer */ },
  "call_id": 123,
  "call_type": "video"
}

// Send answer
{
  "type": "call-answer",
  "answer": { /* SDP answer */ },
  "call_id": 123
}

// Send ICE candidate
{
  "type": "ice-candidate",
  "candidate": { /* ICE candidate */ },
  "call_id": 123
}

// End call
{
  "type": "call-end",
  "call_id": 123,
  "reason": "ended"
}

// Ringing status
{
  "type": "ringing",
  "call_id": 123
}
```

#### Server → Client

```javascript
// Receive offer
{
  "type": "call-offer",
  "offer": { /* SDP offer */ },
  "sender_id": 456,
  "call_id": 123
}

// Receive answer
{
  "type": "call-answer",
  "answer": { /* SDP answer */ },
  "sender_id": 456,
  "call_id": 123
}

// Receive ICE candidate
{
  "type": "ice-candidate",
  "candidate": { /* ICE candidate */ },
  "sender_id": 456,
  "call_id": 123
}

// User joined
{
  "type": "user-joined",
  "user_id": 789,
  "username": "john_doe"
}

// User left
{
  "type": "user-left",
  "user_id": 789,
  "username": "john_doe"
}
```

## 🎥 WebRTC Configuration

### STUN Server (Free - Google)

```javascript
const configuration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' }
  ]
};
```

### TURN Server (Production - Required for NAT traversal)

Install Coturn:

```bash
sudo apt install coturn
```

Configure in `.env`:

```env
TURN_SERVER=turn:your-server.com:3478
TURN_USERNAME=your-username
TURN_PASSWORD=your-password
```

## 🔐 Security Features

- JWT-based authentication
- WebSocket authentication middleware
- CORS configuration
- HTTPS/WSS support (production)
- Password validation
- SQL injection protection (ORM)

## 📊 Database Schema

### Users Table

```sql
- id (PK)
- username (unique)
- email (unique)
- password (hashed)
- is_online (boolean)
- last_seen (timestamp)
- profile_picture
- channel_name
```

### Calls Table

```sql
- id (PK)
- caller_id (FK → users)
- receiver_id (FK → users)
- call_type (audio/video)
- status (initiated/ringing/accepted/rejected/ended/missed/cancelled)
- room_id (unique)
- initiated_at
- ringing_at
- accepted_at
- ended_at
- duration (seconds)
```

### Call Signals Table (Logging)

```sql
- id (PK)
- call_id (FK → calls)
- signal_type (offer/answer/ice-candidate)
- signal_data (JSON)
- sender_id (FK → users)
- created_at
```

## 🧪 Testing

### Using cURL

#### Register a user

```bash
curl -X POST http://localhost:8001/api/users/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "testpass123",
    "password_confirm": "testpass123"
  }'
```

#### Login

```bash
curl -X POST http://localhost:8001/api/token/ \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "testpass123"
  }'
```

#### Start a call

```bash
curl -X POST http://localhost:8001/api/calls/ \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -d '{
    "receiver": 2,
    "call_type": "video"
  }'
```

## 🌐 Frontend Integration Example (JavaScript)

### Complete Call Flow

```javascript
// 1. Get JWT token
const response = await fetch('http://localhost:8001/api/token/', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    username: 'user1',
    password: 'password'
  })
});
const { access } = await response.json();

// 2. Initiate call via REST API
const callResponse = await fetch('http://localhost:8001/api/calls/', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${access}`
  },
  body: JSON.stringify({
    receiver: 2,
    call_type: 'video'
  })
});
const call = await callResponse.json();

// 3. Connect to WebSocket
const ws = new WebSocket(`ws://localhost:8001/ws/call/${call.room_id}/`);

// 4. Setup WebRTC
const peerConnection = new RTCPeerConnection({
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
});

// 5. Add local stream
const localStream = await navigator.mediaDevices.getUserMedia({
  video: true,
  audio: true
});
localStream.getTracks().forEach(track => {
  peerConnection.addTrack(track, localStream);
});

// 6. Create and send offer
const offer = await peerConnection.createOffer();
await peerConnection.setLocalDescription(offer);
ws.send(JSON.stringify({
  type: 'call-offer',
  offer: offer,
  call_id: call.id,
  call_type: 'video'
}));

// 7. Handle ICE candidates
peerConnection.onicecandidate = (event) => {
  if (event.candidate) {
    ws.send(JSON.stringify({
      type: 'ice-candidate',
      candidate: event.candidate,
      call_id: call.id
    }));
  }
};

// 8. Handle incoming messages
ws.onmessage = async (event) => {
  const data = JSON.parse(event.data);
  
  if (data.type === 'call-answer') {
    await peerConnection.setRemoteDescription(data.answer);
  } else if (data.type === 'ice-candidate') {
    await peerConnection.addIceCandidate(data.candidate);
  }
};

// 9. Handle remote stream
peerConnection.ontrack = (event) => {
  const remoteVideo = document.getElementById('remote-video');
  remoteVideo.srcObject = event.streams[0];
};
```

## 🚀 Production Deployment

### Checklist

- [ ] Set `DEBUG=False`
- [ ] Generate strong `SECRET_KEY`
- [ ] Configure MySQL for production
- [ ] Setup Redis with persistence
- [ ] Install and configure TURN server (Coturn)
- [ ] Setup HTTPS with Let's Encrypt
- [ ] Use Daphne or Uvicorn for ASGI
- [ ] Setup Nginx as reverse proxy
- [ ] Configure firewall rules
- [ ] Setup monitoring and logging
- [ ] Enable database backups

### Nginx Configuration Example

```nginx
upstream django {
    server 127.0.0.1:8001;
}

server {
    listen 80;
    server_name yourdomain.com;
    return 301 https://$server_name$request_uri;
}

server {
    listen 443 ssl http2;
    server_name yourdomain.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://django;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
    
    location /ws/ {
        proxy_pass http://django;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

## 📝 License

MIT License

## 🤝 Contributing

Pull requests are welcome. For major changes, please open an issue first.

## 📧 Support

For issues and questions, please open an issue on GitHub.

---

**Built with ❤️ using Django, DRF, WebRTC, and MySQL**

# IMCS

# IMCS
