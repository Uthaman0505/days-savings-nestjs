/** Sanitized Public Gold Proforma Invoice text for parser tests (no customer PII). */
export const PUBLIC_GOLD_PROFORMA_INVOICE_FIXTURE = `
PUBLIC GOLD MARKETING SDN BHD
Proforma Invoice

Doc No : 21727607
Invoice Date : 2026-08-26 13:31:36
Purchase Date : 2026-08-26 13:30:31
Payment By : GAP

GOLD ACCUMULATION PROGRAM - GAP (AU 999.9)
Price/Gram Total Wgt (Grams) Total Excl SST SST Total Incl SST
654.00 0.1529 100.00 0.00 100.00

TOTAL PAYABLE INCL SST : MYR 100.00
`.trim();

export const PUBLIC_GOLD_PROFORMA_SPACING_VARIANT = `
PUBLIC GOLD MARKETING SDN BHD
Proforma Invoice

Doc No:21727607
Invoice Date: 2026-08-26 13:31:36
Purchase Date: 2026-08-26 13:30:31
Payment By: GAP

GOLD ACCUMULATION PROGRAM - GAP (AU 999.9)
654.00 0.1529 100.00 0.00 100.00

TOTAL PAYABLE INCL SST : MYR 100.00
`.trim();

export const PUBLIC_GOLD_INVOICE_DATE_ONLY = `
PUBLIC GOLD MARKETING SDN BHD
Proforma Invoice

Doc No : 21727607
Invoice Date : 2026-07-01 10:00:00
Payment By : GAP

GOLD ACCUMULATION PROGRAM - GAP (AU 999.9)
654.00 0.1529 100.00 0.00 100.00

TOTAL PAYABLE INCL SST : MYR 100.00
`.trim();

export const PUBLIC_GOLD_MISMATCH_AMOUNT = `
PUBLIC GOLD MARKETING SDN BHD
Proforma Invoice

Doc No : 21727607
Purchase Date : 2026-08-26 13:30:31
Payment By : GAP

GOLD ACCUMULATION PROGRAM - GAP (AU 999.9)
654.00 0.1529 100.00 0.00 100.00

TOTAL PAYABLE INCL SST : MYR 120.00
`.trim();

export const UNSUPPORTED_PDF_TEXT = `
Acme Corp Monthly Statement
Account summary for January 2026.
No gold purchases listed.
`.trim();
