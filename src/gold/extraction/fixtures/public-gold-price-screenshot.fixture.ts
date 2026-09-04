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
