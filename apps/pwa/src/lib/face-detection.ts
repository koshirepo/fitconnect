/**
 * Browser-based face detection utility.
 *
 * Strategy:
 *  1. Use the native FaceDetector API (Chrome/Edge/Opera – behind flags on others).
 *  2. Fallback: load a lightweight TF.js face-detection model on demand.
 *  3. Final fallback: skip validation (allow upload) so the feature degrades gracefully.
 */

export interface FaceDetectionResult {
  /** Number of faces found */
  count: number;
  /** Human-readable error message, or null if exactly one face was found */
  error: string | null;
}

// ─── Native FaceDetector (Shape Detection API) ───────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const _win = window as Record<string, any>;

async function detectWithNativeAPI(img: ImageBitmap): Promise<number | null> {
  if (typeof _win.FaceDetector === "undefined") return null;

  try {
    const detector = new _win.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
    const faces: unknown[] = await detector.detect(img);
    return faces.length;
  } catch {
    return null; // API present but failed – fall through
  }
}

// ─── TF.js fallback (lazy-loaded) ────────────────────────────────────────────

let tfFallbackReady: ReturnType<typeof loadTfDetector> | null = null;

async function loadTfDetector() {
  // Dynamically import so bundle only grows when needed
  const [tf, blazeface] = await Promise.all([
    import("@tensorflow/tfjs-core"),
    import("@tensorflow-models/blazeface"),
  ]);
  // Prefer WebGL, fall back to WASM/CPU
  try {
    await import("@tensorflow/tfjs-backend-webgl");
    await tf.setBackend("webgl");
  } catch {
    try {
      await import("@tensorflow/tfjs-backend-cpu");
      await tf.setBackend("cpu");
    } catch {
      /* ignore – tf may already have a backend */
    }
  }
  await tf.ready();
  return blazeface.load({ maxFaces: 10 });
}

async function detectWithTfjs(img: HTMLImageElement | ImageBitmap): Promise<number | null> {
  try {
    if (!tfFallbackReady) tfFallbackReady = loadTfDetector();
    const model = await tfFallbackReady;
    const predictions = await model.estimateFaces(img as HTMLImageElement, false);
    return predictions.length;
  } catch {
    return null; // tf.js failed – degrade gracefully
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Detects faces in a File/Blob image.
 * Returns `{ count, error }` – error is null when exactly one face is found.
 */
export async function validateFace(source: Blob): Promise<FaceDetectionResult> {
  const bitmap = await createImageBitmap(source);

  // 1. Try native API
  let count = await detectWithNativeAPI(bitmap);

  // 2. Fallback to TF.js
  if (count === null) {
    count = await detectWithTfjs(bitmap);
  }

  // 3. If all detection failed, allow the photo (don't block the user)
  if (count === null) {
    return { count: -1, error: null };
  }

  if (count === 0) {
    return { count, error: "No face detected. Please upload a clear photo of your face." };
  }
  if (count > 1) {
    return {
      count,
      error: "Multiple faces detected. Please upload a photo with only your face.",
    };
  }

  return { count: 1, error: null };
}

/**
 * Returns true if the browser supports at least one face detection method.
 */
export function isFaceDetectionSupported(): boolean {
  return typeof _win.FaceDetector !== "undefined" || true; // tf.js is always loadable
}

// ─── Real-time face detection for live camera feeds ──────────────────────────

export interface LiveFaceBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LiveFaceResult {
  count: number;
  boxes: LiveFaceBox[];
}

/**
 * Detect faces from a video element (single frame). Used for real-time overlays.
 * Returns face count and bounding boxes relative to the video's natural dimensions.
 */
export async function detectFacesLive(video: HTMLVideoElement): Promise<LiveFaceResult> {
  if (!video.videoWidth || !video.videoHeight) {
    return { count: 0, boxes: [] };
  }

  // 1. Try native FaceDetector
  if (typeof _win.FaceDetector !== "undefined") {
    try {
      const detector = new _win.FaceDetector({ fastMode: true, maxDetectedFaces: 10 });
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const faces: any[] = await detector.detect(video);
      return {
        count: faces.length,
        boxes: faces.map((f) => ({
          x: f.boundingBox.x,
          y: f.boundingBox.y,
          width: f.boundingBox.width,
          height: f.boundingBox.height,
        })),
      };
    } catch {
      // fall through
    }
  }

  // 2. Fallback to TF.js blazeface
  try {
    if (!tfFallbackReady) tfFallbackReady = loadTfDetector();
    const model = await tfFallbackReady;
    const predictions = await model.estimateFaces(video, false);
    return {
      count: predictions.length,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      boxes: predictions.map((p: any) => {
        const start = p.topLeft as [number, number];
        const end = p.bottomRight as [number, number];
        return {
          x: start[0],
          y: start[1],
          width: end[0] - start[0],
          height: end[1] - start[1],
        };
      }),
    };
  } catch {
    return { count: 0, boxes: [] };
  }
}
