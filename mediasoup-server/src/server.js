import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import * as mediasoup from 'mediasoup';

dotenv.config();

const PORT = Number(process.env.PORT || 4000);
const ANNOUNCED_IP = process.env.ANNOUNCED_IP || undefined;
const RTC_MIN_PORT = Number(process.env.RTC_MIN_PORT || 40000);
const RTC_MAX_PORT = Number(process.env.RTC_MAX_PORT || 49999);

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
];

const app = express();
app.use(cors());
app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'mediasoup-sfu' });
});

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
  },
});

let worker;
const rooms = new Map();

function createRoomState(router) {
  return {
    router,
    peers: new Map(),
  };
}

function getPeer(room, socketId) {
  return room.peers.get(socketId);
}

async function createWorker() {
  worker = await mediasoup.createWorker({
    rtcMinPort: RTC_MIN_PORT,
    rtcMaxPort: RTC_MAX_PORT,
    logLevel: 'warn',
    logTags: ['info', 'ice', 'dtls', 'rtp', 'srtp', 'rtcp'],
  });

  worker.on('died', () => {
    console.error('mediasoup worker died, exiting in 2 seconds...');
    setTimeout(() => process.exit(1), 2000);
  });
}

async function getOrCreateRoom(roomId) {
  if (rooms.has(roomId)) {
    return rooms.get(roomId);
  }

  const router = await worker.createRouter({ mediaCodecs });
  const room = createRoomState(router);
  rooms.set(roomId, room);
  return room;
}

function removeRoomIfEmpty(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  if (room.peers.size === 0) {
    room.router.close();
    rooms.delete(roomId);
  }
}

function cleanupPeer(room, socketId) {
  const peer = room.peers.get(socketId);
  if (!peer) return;

  for (const consumer of peer.consumers.values()) {
    consumer.close();
  }
  for (const producer of peer.producers.values()) {
    producer.close();
  }
  for (const transport of peer.transports.values()) {
    transport.close();
  }

  room.peers.delete(socketId);
}

async function createWebRtcTransport(router) {
  const transport = await router.createWebRtcTransport({
    listenIps: [
      {
        ip: '0.0.0.0',
        announcedIp: ANNOUNCED_IP,
      },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    initialAvailableOutgoingBitrate: 1_000_000,
  });

  return transport;
}

function transportParams(transport) {
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
  };
}

io.on('connection', (socket) => {
  socket.on('joinRoom', async ({ roomId, userId }, callback = () => {}) => {
    try {
      const room = await getOrCreateRoom(roomId);
      socket.join(roomId);

      room.peers.set(socket.id, {
        socketId: socket.id,
        userId,
        roomId,
        transports: new Map(),
        producers: new Map(),
        consumers: new Map(),
      });

      callback({
        rtpCapabilities: room.router.rtpCapabilities,
      });

      socket.to(roomId).emit('peerJoined', { peerId: socket.id, userId });
    } catch (error) {
      console.error('joinRoom error:', error);
      callback({ error: 'Failed to join room' });
    }
  });

  socket.on('createWebRtcTransport', async ({ roomId, direction }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        callback({ error: 'Room not found' });
        return;
      }

      const peer = getPeer(room, socket.id);
      if (!peer) {
        callback({ error: 'Peer not found' });
        return;
      }

      const transport = await createWebRtcTransport(room.router);
      peer.transports.set(transport.id, {
        transport,
        direction,
      });

      callback({ params: transportParams(transport) });
    } catch (error) {
      console.error('createWebRtcTransport error:', error);
      callback({ error: 'Failed to create transport' });
    }
  });

  socket.on('connectTransport', async ({ roomId, transportId, dtlsParameters }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      const peer = room ? getPeer(room, socket.id) : null;
      const transportData = peer ? peer.transports.get(transportId) : null;

      if (!transportData) {
        callback({ error: 'Transport not found' });
        return;
      }

      await transportData.transport.connect({ dtlsParameters });
      callback({ connected: true });
    } catch (error) {
      console.error('connectTransport error:', error);
      callback({ error: 'Failed to connect transport' });
    }
  });

  socket.on('produce', async ({ roomId, transportId, kind, rtpParameters, appData }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      const peer = room ? getPeer(room, socket.id) : null;
      const transportData = peer ? peer.transports.get(transportId) : null;

      if (!transportData) {
        callback({ error: 'Transport not found' });
        return;
      }

      const producer = await transportData.transport.produce({ kind, rtpParameters, appData });
      peer.producers.set(producer.id, producer);

      producer.on('transportclose', () => {
        peer.producers.delete(producer.id);
      });

      producer.on('close', () => {
        peer.producers.delete(producer.id);
      });

      socket.to(roomId).emit('newProducer', {
        producerId: producer.id,
        peerId: socket.id,
        userId: peer.userId,
        kind,
      });

      callback({ id: producer.id });
    } catch (error) {
      console.error('produce error:', error);
      callback({ error: 'Failed to produce' });
    }
  });

  socket.on('getProducers', ({ roomId }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        callback({ producerIds: [] });
        return;
      }

      const producerIds = [];
      for (const [peerId, peer] of room.peers.entries()) {
        if (peerId === socket.id) continue;
        for (const producer of peer.producers.values()) {
          producerIds.push({ producerId: producer.id, peerId, userId: peer.userId, kind: producer.kind });
        }
      }

      callback({ producerIds });
    } catch (error) {
      console.error('getProducers error:', error);
      callback({ producerIds: [] });
    }
  });

  socket.on('consume', async ({ roomId, consumerTransportId, producerId, rtpCapabilities }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      if (!room) {
        callback({ error: 'Room not found' });
        return;
      }

      if (!room.router.canConsume({ producerId, rtpCapabilities })) {
        callback({ error: 'Cannot consume producer' });
        return;
      }

      const peer = getPeer(room, socket.id);
      const transportData = peer ? peer.transports.get(consumerTransportId) : null;

      if (!transportData) {
        callback({ error: 'Consumer transport not found' });
        return;
      }

      const consumer = await transportData.transport.consume({
        producerId,
        rtpCapabilities,
        paused: true,
      });

      peer.consumers.set(consumer.id, consumer);

      consumer.on('transportclose', () => {
        peer.consumers.delete(consumer.id);
      });

      consumer.on('producerclose', () => {
        peer.consumers.delete(consumer.id);
        socket.emit('producerClosed', { producerId });
      });

      callback({
        params: {
          id: consumer.id,
          producerId,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
          type: consumer.type,
          producerPaused: consumer.producerPaused,
        },
      });
    } catch (error) {
      console.error('consume error:', error);
      callback({ error: 'Failed to consume' });
    }
  });

  socket.on('resumeConsumer', async ({ roomId, consumerId }, callback = () => {}) => {
    try {
      const room = rooms.get(roomId);
      const peer = room ? getPeer(room, socket.id) : null;
      const consumer = peer ? peer.consumers.get(consumerId) : null;
      if (!consumer) {
        callback({ error: 'Consumer not found' });
        return;
      }

      await consumer.resume();
      callback({ resumed: true });
    } catch (error) {
      console.error('resumeConsumer error:', error);
      callback({ error: 'Failed to resume consumer' });
    }
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms.entries()) {
      const peer = room.peers.get(socket.id);
      if (!peer) continue;

      cleanupPeer(room, socket.id);
      socket.to(roomId).emit('peerLeft', { peerId: socket.id, userId: peer.userId });
      removeRoomIfEmpty(roomId);
      break;
    }
  });
});

await createWorker();

httpServer.listen(PORT, () => {
  console.log(`mediasoup SFU listening on :${PORT}`);
});
