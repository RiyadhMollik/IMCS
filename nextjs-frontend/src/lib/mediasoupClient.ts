import { Device } from 'mediasoup-client';
import type {
  AppData,
  DtlsParameters,
  IceCandidate,
  IceParameters,
  MediaKind,
  Producer,
  RtpCapabilities,
  RtpParameters,
  SctpParameters,
  Transport,
} from 'mediasoup-client/types';
import { io, Socket } from 'socket.io-client';

type Ack<T> = (response: T) => void;

type JoinRoomResponse = {
  rtpCapabilities?: RtpCapabilities;
  error?: string;
};

type CreateTransportResponse = {
  params?: {
    id: string;
    iceParameters: IceParameters;
    iceCandidates: IceCandidate[];
    dtlsParameters: DtlsParameters;
    sctpParameters?: SctpParameters;
  };
  error?: string;
};

type ProduceResponse = {
  id?: string;
  error?: string;
};

type ConsumeResponse = {
  params?: {
    id: string;
    producerId: string;
    kind: MediaKind;
    rtpParameters: RtpParameters;
    type: 'simple' | 'simulcast' | 'svc' | 'pipe';
    producerPaused: boolean;
  };
  error?: string;
};

type GetProducersResponse = {
  producerIds: Array<{ producerId: string; peerId: string; userId?: number; kind: MediaKind }>;
};

type RemoteTrackCallback = (track: MediaStreamTrack, producerId: string) => void;
type ProducerClosedCallback = (producerId: string) => void;

type ConnectEventPayload = { dtlsParameters: DtlsParameters };
type ConnectEventCallback = () => void;
type ConnectEventErrback = (error: Error) => void;

type ProduceEventPayload = {
  kind: MediaKind;
  rtpParameters: RtpParameters;
  appData: AppData;
};
type ProduceEventCallback = (params: { id: string }) => void;
type ProduceEventErrback = (error: Error) => void;

export class MediasoupConferenceClient {
  private readonly serverUrl: string;
  private readonly roomId: string;
  private readonly userId: number;
  private socket: Socket | null = null;
  private device: Device | null = null;
  private sendTransport: Transport | null = null;
  private recvTransport: Transport | null = null;
  private producers: Producer[] = [];
  private consumedProducerIds = new Set<string>();
  private onRemoteTrackCb: RemoteTrackCallback | null = null;
  private onProducerClosedCb: ProducerClosedCallback | null = null;

  constructor(serverUrl: string, roomId: string, userId: number) {
    this.serverUrl = serverUrl;
    this.roomId = roomId;
    this.userId = userId;
  }

  onRemoteTrack(cb: RemoteTrackCallback) {
    this.onRemoteTrackCb = cb;
  }

  onProducerClosed(cb: ProducerClosedCallback) {
    this.onProducerClosedCb = cb;
  }

  private emitAck<TResponse>(event: string, payload: object): Promise<TResponse> {
    if (!this.socket) {
      return Promise.reject(new Error('Socket is not connected'));
    }

    return new Promise((resolve) => {
      this.socket!.emit(event, payload, (response: TResponse) => resolve(response));
    });
  }

  async connect(): Promise<void> {
    this.socket = io(this.serverUrl, {
      transports: ['websocket'],
      withCredentials: false,
      timeout: 15000,
    });

    await new Promise<void>((resolve, reject) => {
      if (!this.socket) {
        reject(new Error('Socket initialization failed'));
        return;
      }

      this.socket.on('connect', () => resolve());
      this.socket.on('connect_error', (error) => reject(error));
    });

    const joined = await this.emitAck<JoinRoomResponse>('joinRoom', {
      roomId: this.roomId,
      userId: this.userId,
    });

    if (joined.error || !joined.rtpCapabilities) {
      throw new Error(joined.error || 'Missing router RTP capabilities');
    }

    this.device = new Device();
    await this.device.load({ routerRtpCapabilities: joined.rtpCapabilities });

    await this.createSendTransport();
    await this.createRecvTransport();

    this.socket.on('newProducer', async ({ producerId }: { producerId: string }) => {
      try {
        await this.consumeProducer(producerId);
      } catch (error) {
        console.error('consume new producer failed:', error);
      }
    });

    this.socket.on('producerClosed', ({ producerId }: { producerId: string }) => {
      this.consumedProducerIds.delete(producerId);
      if (this.onProducerClosedCb) {
        this.onProducerClosedCb(producerId);
      }
    });

    await this.consumeExistingProducers();
  }

  private async createSendTransport(): Promise<void> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const response = await this.emitAck<CreateTransportResponse>('createWebRtcTransport', {
      roomId: this.roomId,
      direction: 'send',
    });

    if (response.error || !response.params) {
      throw new Error(response.error || 'Failed to create send transport');
    }

    this.sendTransport = this.device.createSendTransport(response.params);

    this.sendTransport.on('connect', ({ dtlsParameters }: ConnectEventPayload, callback: ConnectEventCallback, errback: ConnectEventErrback) => {
      this.emitAck<{ connected?: boolean; error?: string }>('connectTransport', {
        roomId: this.roomId,
        transportId: this.sendTransport?.id,
        dtlsParameters,
      })
        .then((res) => {
          if (res.error) {
            errback(new Error(res.error));
            return;
          }
          callback();
        })
        .catch(errback);
    });

    this.sendTransport.on(
      'produce',
      ({ kind, rtpParameters, appData }: ProduceEventPayload, callback: ProduceEventCallback, errback: ProduceEventErrback) => {
      this.emitAck<ProduceResponse>('produce', {
        roomId: this.roomId,
        transportId: this.sendTransport?.id,
        kind,
        rtpParameters,
        appData,
      })
        .then((res) => {
          if (res.error || !res.id) {
            errback(new Error(res.error || 'Producer id not returned'));
            return;
          }
          callback({ id: res.id });
        })
        .catch(errback);
      }
    );
  }

  private async createRecvTransport(): Promise<void> {
    if (!this.device) {
      throw new Error('Device not initialized');
    }

    const response = await this.emitAck<CreateTransportResponse>('createWebRtcTransport', {
      roomId: this.roomId,
      direction: 'recv',
    });

    if (response.error || !response.params) {
      throw new Error(response.error || 'Failed to create recv transport');
    }

    this.recvTransport = this.device.createRecvTransport(response.params);

    this.recvTransport.on('connect', ({ dtlsParameters }: ConnectEventPayload, callback: ConnectEventCallback, errback: ConnectEventErrback) => {
      this.emitAck<{ connected?: boolean; error?: string }>('connectTransport', {
        roomId: this.roomId,
        transportId: this.recvTransport?.id,
        dtlsParameters,
      })
        .then((res) => {
          if (res.error) {
            errback(new Error(res.error));
            return;
          }
          callback();
        })
        .catch(errback);
    });
  }

  async startProducing(stream: MediaStream): Promise<void> {
    if (!this.sendTransport) {
      throw new Error('Send transport not initialized');
    }

    for (const track of stream.getTracks()) {
      const producer = await this.sendTransport.produce({
        track,
        appData: { mediaTag: track.kind },
      });
      this.producers.push(producer);
    }
  }

  async replaceVideoTrack(track: MediaStreamTrack | null): Promise<void> {
    const videoProducer = this.producers.find((producer) => producer.kind === 'video');

    if (!videoProducer) {
      if (!track) {
        return;
      }

      if (!this.sendTransport) {
        throw new Error('Send transport not initialized');
      }

      const producer = await this.sendTransport.produce({
        track,
        appData: { mediaTag: 'video' },
      });
      this.producers.push(producer);
      return;
    }

    await videoProducer.replaceTrack({ track });
  }

  private async consumeExistingProducers(): Promise<void> {
    const response = await this.emitAck<GetProducersResponse>('getProducers', {
      roomId: this.roomId,
    });

    for (const producer of response.producerIds || []) {
      await this.consumeProducer(producer.producerId);
    }
  }

  async consumeProducer(producerId: string): Promise<void> {
    if (!this.device || !this.recvTransport) {
      throw new Error('Consumer transport is not ready');
    }

    if (this.consumedProducerIds.has(producerId)) {
      return;
    }

    const response = await this.emitAck<ConsumeResponse>('consume', {
      roomId: this.roomId,
      consumerTransportId: this.recvTransport.id,
      producerId,
      rtpCapabilities: this.device.rtpCapabilities,
    });

    if (response.error || !response.params) {
      throw new Error(response.error || 'Failed to consume producer');
    }

    const consumer = await this.recvTransport.consume({
      id: response.params.id,
      producerId: response.params.producerId,
      kind: response.params.kind,
      rtpParameters: response.params.rtpParameters,
    });

    this.consumedProducerIds.add(producerId);

    await this.emitAck<{ resumed?: boolean; error?: string }>('resumeConsumer', {
      roomId: this.roomId,
      consumerId: consumer.id,
    });

    if (this.onRemoteTrackCb) {
      this.onRemoteTrackCb(consumer.track, producerId);
    }
  }

  close(): void {
    for (const producer of this.producers) {
      producer.close();
    }
    this.producers = [];

    if (this.sendTransport) {
      this.sendTransport.close();
      this.sendTransport = null;
    }

    if (this.recvTransport) {
      this.recvTransport.close();
      this.recvTransport = null;
    }

    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }

    this.device = null;
    this.consumedProducerIds.clear();
  }
}
