import { decode, encode } from 'jpeg-js';

/**
 * Tesseract skips the pale-yellow Public Gold card on a full-screen capture
 * and returns only the white Silver card. Lifting that yellow to white and
 * stretching contrast makes the Gold row readable.
 * Returns null when the buffer is not a JPEG.
 */
export function preparePublicGoldScreenshotForOcr(
  buffer: Buffer,
): Buffer | null {
  if (buffer.length < 4 || buffer[0] !== 0xff || buffer[1] !== 0xd8) {
    return null;
  }

  try {
    const decoded = decode(buffer, {
      useTArray: true,
      formatAsRGBA: true,
      maxResolutionInMP: 24,
    });
    if (!decoded.width || !decoded.height || decoded.data.length < 4) {
      return null;
    }
    liftYellowCard(decoded.data);
    const encoded = encode(
      { data: decoded.data, width: decoded.width, height: decoded.height },
      90,
    );
    return Buffer.from(encoded.data);
  } catch {
    return null;
  }
}

function liftYellowCard(data: Uint8Array): void {
  const pixels = data.length / 4;
  const gray = new Uint8Array(pixels);
  let min = 255;
  let max = 0;

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    let red = data[i];
    let green = data[i + 1];
    let blue = data[i + 2];
    if (red > 180 && green > 150 && blue < 190 && red + green > blue * 2.2) {
      red = 255;
      green = 255;
      blue = 255;
    } else if (red < 90 && green < 90 && blue < 90) {
      red = 0;
      green = 0;
      blue = 0;
    }
    const luminance = Math.round(0.299 * red + 0.587 * green + 0.114 * blue);
    gray[pixel] = luminance;
    if (luminance < min) {
      min = luminance;
    }
    if (luminance > max) {
      max = luminance;
    }
  }

  const span = Math.max(1, max - min);
  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const stretched = Math.round(((gray[pixel] - min) * 255) / span);
    data[i] = stretched;
    data[i + 1] = stretched;
    data[i + 2] = stretched;
    data[i + 3] = 255;
  }
}
