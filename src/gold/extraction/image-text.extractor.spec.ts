import { readFileSync } from 'fs';
import { join } from 'path';
import { ImageTextExtractorService } from './image-text.extractor';

const recognize = jest.fn(async () => ({
  data: { text: 'Buy GAP / SAP\nGold (Au 999.9)\nRM 625/g' },
}));

const createWorker = jest.fn(async (_lang: string) => ({
  recognize,
  terminate: jest.fn(),
}));

jest.mock('tesseract.js', () => ({
  createWorker: (lang: string) => createWorker(lang),
}));

describe('ImageTextExtractorService', () => {
  const pkg = JSON.parse(
    readFileSync(join(__dirname, '../../../package.json'), 'utf8'),
  ) as {
    dependencies: Record<string, string>;
    devDependencies: Record<string, string>;
  };

  it('lists tesseract.js as a production dependency', () => {
    expect(pkg.dependencies['tesseract.js']).toBeDefined();
    expect(pkg.devDependencies['tesseract.js']).toBeUndefined();
  });

  it('invokes tesseract.js createWorker(eng) then recognize(buffer)', async () => {
    const service = new ImageTextExtractorService();
    const buffer = Buffer.from('fake-image');
    const text = await service.extractTextFromImageBuffer(buffer);

    expect(createWorker).toHaveBeenCalledWith('eng');
    expect(recognize).toHaveBeenCalledWith(buffer);
    expect(text).toContain('Buy GAP / SAP');
    expect(text).not.toContain('OCR_NOT_IMPLEMENTED');
  });
});
