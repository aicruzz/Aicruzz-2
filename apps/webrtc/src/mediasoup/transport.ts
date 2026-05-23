/* eslint-disable @typescript-eslint/no-explicit-any */

const TRANSPORT_OPTIONS = {
  listenIps: [
    {
      ip: '0.0.0.0',
      announcedIp: process.env.ANNOUNCED_IP ?? '127.0.0.1',
    },
  ],
  enableUdp: true,
  enableTcp: true,
  preferUdp: true,
  initialAvailableOutgoingBitrate: 800_000,
  maxSctpMessageSize: 262144,
};

export async function createWebRtcTransport(router: any): Promise<any> {
  const transport = await router.createWebRtcTransport(TRANSPORT_OPTIONS) as any;

  transport.on('dtlsstatechange', (state: string) => {
    if (state === 'failed' || state === 'closed') {
      transport.close();
    }
  });

  return transport;
}

export function serializeTransport(transport: any) {
  return {
    id: transport.id,
    iceParameters: transport.iceParameters,
    iceCandidates: transport.iceCandidates,
    dtlsParameters: transport.dtlsParameters,
    sctpParameters: transport.sctpParameters,
  };
}
