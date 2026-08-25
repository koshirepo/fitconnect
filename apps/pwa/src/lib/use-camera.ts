import * as React from "react";

interface UseCameraOptions {
  facingMode?: "user" | "environment";
  width?: number;
  height?: number;
}

export function useCamera(options: UseCameraOptions = {}) {
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const [isActive, setIsActive] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const start = React.useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: options.facingMode ?? "user",
          width: { ideal: options.width ?? 640 },
          height: { ideal: options.height ?? 480 },
        },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setIsActive(true);
      setError(null);
    } catch (err: unknown) {
      const errorName = err instanceof DOMException ? err.name : null;
      setError(
        errorName === "NotAllowedError" ? "Camera permission denied" : "Camera unavailable",
      );
    }
  }, [options.facingMode, options.width, options.height]);

  const stop = React.useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setIsActive(false);
  }, []);

  const capture = React.useCallback((): Promise<Blob | null> => {
    const video = videoRef.current;
    if (!video) return Promise.resolve(null);

    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(video, 0, 0);

    return new Promise((resolve) => {
      canvas.toBlob((b) => resolve(b), "image/jpeg", 0.85);
    });
  }, []);

  React.useEffect(() => () => stop(), [stop]);

  return { videoRef, isActive, error, start, stop, capture };
}
