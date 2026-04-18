/**
 * Abre a webcam e associa ao elemento <video>.
 * Em muitos telemóveis (iOS/Android), o navegador só mostra o pedido de permissão
 * se `getUserMedia` for chamado dentro de um gesto do utilizador (toque).
 *
 * @param {HTMLVideoElement} videoEl
 * @param {MediaStreamConstraints} [constraints]
 * @returns {Promise<MediaStream>}
 */
export async function setupCamera(videoEl, constraints) {
  const extra =
    constraints && constraints.video && typeof constraints.video === "object"
      ? constraints.video
      : {};
  const videoBase = {
    facingMode: "user",
    ...extra,
  };

  const tryConstraints = [
    {
      video: {
        ...videoBase,
        width: { ideal: 640 },
        height: { ideal: 480 },
      },
      audio: false,
    },
    {
      video: {
        ...videoBase,
        width: { ideal: 1280 },
        height: { ideal: 720 },
      },
      audio: false,
    },
    {
      video: videoBase,
      audio: false,
    },
  ];

  const getStream = async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      let lastErr;
      for (const c of tryConstraints) {
        try {
          return await navigator.mediaDevices.getUserMedia(c);
        } catch (e) {
          lastErr = e;
        }
      }
      throw lastErr ?? new Error("getUserMedia falhou");
    }

    const legacy =
      navigator.getUserMedia ||
      navigator.webkitGetUserMedia ||
      navigator.mozGetUserMedia ||
      navigator.msGetUserMedia;
    if (!legacy) {
      throw new Error("getUserMedia não está disponível neste navegador.");
    }

    const c = tryConstraints[tryConstraints.length - 1];
    return new Promise((resolve, reject) => {
      legacy.call(
        navigator,
        c,
        (stream) => resolve(stream),
        (err) => reject(err),
      );
    });
  };

  const stream = await getStream();
  videoEl.srcObject = stream;

  videoEl.setAttribute("playsinline", "");
  videoEl.setAttribute("webkit-playsinline", "");
  videoEl.muted = true;

  await new Promise((resolve, reject) => {
    videoEl.onloadedmetadata = () => {
      videoEl
        .play()
        .then(resolve)
        .catch(reject);
    };
  });

  return stream;
}

/**
 * Telemóveis / tablets em que o pedido de câmera deve vir após um toque (iOS, Android).
 */
export function prefersCameraUserGesture() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod|Android/i.test(ua)) return true;
  if (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1) return true;
  return false;
}

/**
 * `getUserMedia` exige contexto seguro (HTTPS ou localhost).
 */
export function isCameraContextOk() {
  if (typeof window === "undefined") return true;
  if (window.isSecureContext) return true;
  const h = location.hostname;
  return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
}
