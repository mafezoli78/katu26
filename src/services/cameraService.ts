let currentStream: MediaStream | null = null;
let pendingRequest: Promise<MediaStream> | null = null;

export async function requestCamera(): Promise<MediaStream> {
  if (pendingRequest) {
    return pendingRequest;
  }

  pendingRequest = (async () => {
    try {
      if (currentStream) {
        currentStream.getTracks().forEach(t => t.stop());
        currentStream = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
        audio: false,
      });

      currentStream = stream;
      return stream;
    } catch (err) {
      currentStream = null;
      throw err;
    } finally {
      pendingRequest = null;
    }
  })();

  return pendingRequest;
}

export function getStream(): MediaStream | null {
  return currentStream;
}

export function stopCamera(): void {
  if (currentStream) {
    currentStream.getTracks().forEach(t => t.stop());
    currentStream = null;
  }
}

export function isActive(): boolean {
  return currentStream !== null && currentStream.getTracks().some(t => t.readyState === 'live');
}
