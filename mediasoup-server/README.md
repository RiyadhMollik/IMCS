# Sociala mediasoup SFU

This service provides server-side WebRTC media routing for group calls.

## Run

```bash
cp .env.example .env
npm install
npm run dev
```

## Environment

```env
PORT=4000
ANNOUNCED_IP=
RTC_MIN_PORT=40000
RTC_MAX_PORT=49999
```

Set `ANNOUNCED_IP` for Docker/NAT/public deployments so browser ICE candidates are reachable.

## Health check

`GET /health`
