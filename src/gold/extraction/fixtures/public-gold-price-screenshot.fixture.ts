/** Simulated OCR text from real Buy GAP / SAP screenshot (sanitized). */
export const BUY_GAP_SCREENSHOT_OCR_TEXT = `
Buy GAP / SAP
Gold (Au 999.9)
Current Price:
RM 625/g
Silver (Ag 999.9)
Current Price:
RM 1,059/100g
Prices last updated on 30-Aug-2026 2:37 PM
Total GAP (Au 999.9): 0.0000 g
Total Amount: RM 0.00
`.trim();

/** Simulated OCR text from real Sell GAP / SAP screenshot (sanitized). */
export const SELL_GAP_SCREENSHOT_OCR_TEXT = `
Sell GAP / SAP
Gold (Au 999.9)
Current Price:
RM 573/g
Silver (Ag 999.9)
Current Price:
RM 963/100g
Prices last updated on 30-Aug-2026 2:37 PM
Total GAP (Au 999.9): 0.0000 g
Total Amount: RM 0
`.trim();

/**
 * Two-column OCR often emits Gold and Silver on the same line *before* prices.
 * Truncating at "Silver" would drop RM 625/g and yield GOLD_PRICE_NOT_FOUND.
 */
export const BUY_GAP_TWO_COLUMN_OCR_TEXT = `
Buy GAP / SAP
Gold Silver
(Au 999.9) (Ag 999.9)
Current Price: Current Price:
RM 625/g RM 1,059/100g
Prices last updated on 30-Aug-2026 2:37 PM
`.trim();

export const SELL_GAP_TWO_COLUMN_OCR_TEXT = `
Sell GAP / SAP
Gold Silver
(Au 999.9) (Ag 999.9)
Current Price: Current Price:
RM 573/g RM 963/100g
Prices last updated on 30-Aug-2026 2:37 PM
`.trim();

/** Typical Tesseract noise on the yellow gold card. */
export const BUY_GAP_NOISY_OCR_TEXT = `
Buy GAP / SAP
Gold (Au 999 9)
Current Price:
RM 625/9
Silver (Ag 999.9)
RM 1,059/100g
Prices last updated on 30-Aug-2026 2:37 PM
`.trim();

/**
 * October 2026 Buy GAP card. Public Gold sells to the customer (PG SELL).
 * RM 100 = 0.1689 gram is a bundle row, not the per-gram price.
 */
export const BUY_GAP_ONE_GRAM_OCR_TEXT = `
Buy GAP / SAP
Gold - GAP (Au 999.9)
RM 100 = 0.1689 gram
RM 592 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 100 = 10.7643 gram
RM 929 = 100.0000 gram
Last update: 18/10/2026 10:03:09 AM
`.trim();

/**
 * October 2026 Sell GAP card. Public Gold buys from the customer (PG BUY).
 * Silver's RM 8.44 = 1.0000 gram must not be selected.
 */
export const SELL_GAP_ONE_GRAM_OCR_TEXT = `
Sell GAP / SAP
Gold - GAP (Au 999.9)
RM 542 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:15 AM
`.trim();

/** Spaces removed around RM and the equals sign. */
export const BUY_GAP_ONE_GRAM_COMPACT_OCR_TEXT = `
Buy GAP / SAP
Gold - GAP (Au 999.9)
RM592=1.0000gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:09 AM
`.trim();

/** Tesseract split the 1g row across lines. */
export const BUY_GAP_ONE_GRAM_SPLIT_OCR_TEXT = `
Buy GAP / SAP
Gold - GAP (Au 999.9)
RM 100 = 0.1689 gram
RM 592
=
1.0000 gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update:
18/10/2026 10:03:09 AM
`.trim();

/** Contrast-recovered Buy OCR: missing spaces around "=" and a bundle row. */
export const BUY_GAP_ONE_GRAM_NOISY_SPACING_OCR_TEXT = `
Buy GAP/SAP
Gold - GAP (Au 999.9)
RM 100=0.1689 gram
RM 592 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 100 = 10.7643 gram
RM 929 = 100.0000 gram
Last update: 18/10/2026 10:03:09 AM
`.trim();

/**
 * tesseract.js text from the attached 460px Buy JPEG after 2x grayscale.
 * Spacing around "=" is uneven: "RM 100 =0.1689 gram".
 */
export const BUY_GAP_TESSERACT_RECOVERED_OCR_TEXT = `
Buy GAP/SAP
Gold - GAP (Au 999.9)
RM 100 =0.1689 gram
RM 592 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 100 = 10.7643 gram
RM 929 = 100.0000 gram
Last update: 18/10/2026 10:03:09 AM
`.trim();

/**
 * tesseract.js text from the attached 460px Sell JPEG after 2x grayscale.
 * Silver also has a 1.0000 gram row.
 */
export const SELL_GAP_TESSERACT_RECOVERED_OCR_TEXT = `
Sell GAP/SAP
Gold - GAP (Au 999.9)
RM 542 = 1.0000 gram
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:15 AM
`.trim();

/** Default Tesseract on the attached Buy JPEG: yellow Gold card was not read. */
export const BUY_GAP_TESSERACT_RAW_OCR_TEXT = `
Buy GAP/SAP
Sliver - SAP (Ag 999.0)
RM 100=10.7643 gram
RM 929 = 100.0000 gram
Last update: 18/10/2026 10:03:09 AM
`.trim();

/** Default Tesseract on a compressed Sell screenshot: yellow Gold card dropped. */
export const SELL_GAP_SILVER_ONLY_OCR_TEXT = `
Sell GAP/SAP
Silver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:15 AM
`.trim();

/** Gold header present, but OCR spelled the following silver header as Sliver. */
export const SELL_GAP_SLIVER_OCR_TEXT = `
Sell GAP / SAP
Gold - GAP (Au 999.9)
RM 542 = 1.0000 gram
Sliver - SAP (Ag 999.0)
RM 8.44 = 1.0000 gram
Last update: 18/10/2026 10:03:15 AM
`.trim();
