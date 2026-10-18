import { decode, encode } from 'jpeg-js';
import { preparePublicGoldScreenshotForOcr } from './public-gold-screenshot-image';

describe('preparePublicGoldScreenshotForOcr', () => {
  it('turns a pale yellow card white and keeps dark text dark', () => {
    const width = 32;
    const height = 16;
    const rgba = Buffer.alloc(width * height * 4);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const offset = (y * width + x) * 4;
        const yellow = x < width / 2;
        rgba[offset] = yellow ? 241 : 39;
        rgba[offset + 1] = yellow ? 217 : 38;
        rgba[offset + 2] = yellow ? 147 : 33;
        rgba[offset + 3] = 255;
      }
    }
    const jpeg = encode({ data: rgba, width, height }, 100);

    const prepared = preparePublicGoldScreenshotForOcr(Buffer.from(jpeg.data));
    expect(prepared).not.toBeNull();
    const out = decode(prepared!, { useTArray: true, formatAsRGBA: true });
    const yellow = (2 * width + 2) * 4;
    const text = (2 * width + width - 3) * 4;
    expect(out.data[yellow]).toBeGreaterThan(240);
    expect(out.data[yellow + 1]).toBeGreaterThan(240);
    expect(out.data[yellow + 2]).toBeGreaterThan(240);
    expect(out.data[text]).toBeLessThan(40);
    expect(out.data[text + 1]).toBeLessThan(40);
    expect(out.data[text + 2]).toBeLessThan(40);
  });

  it('leaves PNG screenshots untouched', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(preparePublicGoldScreenshotForOcr(png)).toBeNull();
  });
});
