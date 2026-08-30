# Phase 2 — Gold Purchase Document Upload + Auto-Extraction

## Analysis & Planning Report (No Implementation)

**Repository inspected:** `nest/` (NestJS backend) + `react-native/` (Android RN frontend)  
**Date:** 2026-08-30  
**Scope:** Planning only — no code changes

---

## 1. Executive Summary

Phase 2 adds **document-backed gold purchase import**: users upload Public Gold purchase evidence (image/screenshot/PDF), the system stores the original file, detects duplicates, extracts candidate transactions, and only creates `GoldPurchase` rows after **explicit user review and confirmation**.

Phase 1 already provides manual purchases, PG BUY/SELL pricing, dashboard valuation (PG BUY), 4-decimal gram support, and soft-delete. It also reserves hooks: `GoldPurchase.source` (`MANUAL` | `IMPORT` | `OCR`), `reference_number`, and planned-but-not-built `GoldDocument`.

The repo already has **production-grade object storage** via S3-compatible API (`ProfileMediaService` + `STORAGE_*` env vars on Railway). This is the correct persistence layer — **not** the Railway app filesystem. GraphQL is used for finance data; **REST + multipart** is the established pattern for binary uploads (avatar only today).

**Critical architectural decision:** Public Gold "History of Purchase" documents can contain **multiple transactions**. Phase 2 must use **`GoldDocument` + `GoldExtractionItem`** (not a strict 1:1 document→purchase model).

**Recommended extraction approach:** Backend **hybrid pipeline** — text PDF parsing first, OCR for images/scanned PDFs, deterministic Public Gold parsers, mandatory user confirmation. No on-device OCR in the first slice.

**Recommended delivery:** Five sub-phases (2A–2E), starting with upload/storage/duplicate detection only — **no portfolio changes until confirmation**.

---

## 2. Existing Upload/Storage Architecture

### Backend — ProfileMedia (only upload module)

| File | Role |
|------|------|
| `nest/src/profile-media/profile-media.controller.ts` | REST: `POST /profile/avatar`, `GET /profile/avatar` |
| `nest/src/profile-media/profile-media.service.ts` | S3 Put/Get/Delete, validation, streaming |
| `nest/src/profile-media/client-avatar-url.ts` | Proxy URL when bucket is private |
| `nest/src/profile-media/profile-media.module.ts` | Module wiring |

**Transport:** REST multipart via Nest `FileInterceptor('file')` + multer (in-memory buffer).

**Limits & validation (avatar):**

- Max size: **10 MB** (multer + service)
- MIME: `image/jpeg`, `image/png`, `image/webp` only
- No magic-byte sniffing (trusts client `mimetype`)
- Extension derived from MIME, not filename

**Storage:**

- S3-compatible client (`@aws-sdk/client-s3`)
- Key pattern: `profiles/{userId}/{timestamp}-{uuid}.{ext}`
- Env: `STORAGE_ENDPOINT`, `STORAGE_REGION`, `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY`, `STORAGE_SECRET_KEY`, `STORAGE_PUBLIC_BASE_URL`, optional `STORAGE_PUT_OBJECT_ACL`, `PUBLIC_APP_URL`
- **External object storage** (Tigris/storageapi.dev in `.env.example`) — survives Railway redeploys

**Auth:** `JwtAuthGuard` on REST routes (GraphQL-oriented guard, works today for profile routes).

**GraphQL:** No file upload support (`graphql-upload` not installed). Architecture docs explicitly say: *binary/multipart → REST* (`nest/docs/architecture/CODING_STANDARD.md`).

### Frontend — upload patterns

| File | Role |
|------|------|
| `react-native/src/api/profileApi.ts` | `FormData` + `fetch` + Bearer JWT → `POST ${API_BASE_URL}/profile/avatar` |
| `react-native/src/components/SideMenu.tsx` | `launchImageLibrary` (photos only), 10 MB client check |
| `react-native/src/hooks/useAvatarImageSource.ts` | Auth headers for proxied avatar GET |
| `react-native/src/config.ts` | `API_BASE_URL` = GraphQL URL minus `/graphql` |

**Dependencies:**

- `react-native-image-picker@^8.2.1` — installed
- **No** `react-native-document-picker` — PDF selection not supported yet

**Stub only:** `react-native/src/modules/expense/components/ReceiptUploader.tsx` — fake local URI, no backend upload.

### What ProfileMedia is / is not

| Reusable | Not reusable as-is |
|----------|-------------------|
| S3 client setup, Put/Get/Delete pattern | Avatar-specific `users.avatar_url` / `avatar_key` |
| JWT REST upload pattern | Image-only MIME whitelist |
| Private-bucket proxy stream (`GET`) | 10 MB limit for multi-page PDFs (may need 20–25 MB) |
| Key naming `{prefix}/{userId}/…` | Tight coupling to `UserService.updateAvatar` |

**Recommendation:** Extract a shared **`ObjectStorageService`** (or generalize profile-media internals), then add **`gold-media`** REST module — do not overload ProfileMedia.

---

## 3. Existing Gold Phase 1 Integration Points

### Backend (`nest/src/gold/`)

- **Entities:** `GoldPurchase` (`gold_purchases`), `GoldPrice` (`gold_prices`)
- **Weight:** `numeric(12,4)` + BigInt math (`GRAM_SCALE = 10000n`) in `gold-math.ts`
- **Source hook:** `GoldPurchase.source: 'MANUAL' | 'IMPORT' | 'OCR'` — service **hardcodes `'MANUAL'`** today
- **Reference:** `reference_number varchar(100)` nullable
- **No** `document_id`, `gold_document_id`, or file columns on purchases yet
- **GraphQL:** `createGoldPurchase`, `updateGoldPurchase`, `deleteGoldPurchase`, `goldDashboard`, etc.
- **Confirmation path exists:** `createGoldPurchase` + validation via `requireWeightGrams`, `derivePricePerGramCents`

### Frontend (`react-native/src/modules/gold/`)

- Screens: `GoldHome`, `GoldCreate`, `GoldDetails`, `GoldEdit`, `GoldPriceEdit`
- Form fields map 1:1 to Phase 1 manual entry (`GoldPurchaseForm.tsx`)
- No upload UI in gold module
- Profile entry → `GoldHome` (`ProfileStack`)

### Phase 2 touchpoints (minimal Phase 1 changes)

| Area | Change type |
|------|-------------|
| `createGoldPurchase` / service | Allow `source: 'OCR' \| 'IMPORT'` on confirmed import path only |
| `GoldPurchase` entity | Optional FK `gold_extraction_item_id` or `gold_document_id` (linkage) |
| `GoldCreateScreen` | Add entry: "Upload document" (new flow, not replace manual) |
| `GoldDetailsScreen` | Show linked document + source badge |
| Dashboard | **No change until confirmation** — existing `goldDashboard` query refreshes after confirm |

**Do not change:** PG BUY/SELL terminology, valuation formulas, auth internals.

---

## 4. Phase 2 Recommended Architecture

```
┌─────────────────┐     REST multipart      ┌──────────────────┐
│  React Native   │ ───────────────────────▶│ gold-media REST  │
│  (pick file)    │                         │  + SHA-256 hash  │
└────────┬────────┘                         └────────┬─────────┘
         │ GraphQL poll/status                      │
         ▼                                          ▼
┌─────────────────┐     async job (later)   ┌──────────────────┐
│ GoldDocument    │◀────────────────────────│ Object Storage   │
│ + ExtractionItems│                        │ (S3-compatible)  │
└────────┬────────┘                         └──────────────────┘
         │ user confirms selected rows
         ▼
┌─────────────────┐
│ GoldPurchase(s) │  source = OCR | IMPORT
│ (existing)      │  only after confirm mutation
└─────────────────┘
```

**Principles:**

1. Upload ≠ import (portfolio unchanged until confirm)
2. Backend is authoritative for hash, storage, validation, purchase creation
3. GraphQL for metadata/status/confirm; REST for bytes
4. Multi-row documents supported via child extraction items
5. All financial fields validated with existing `gold-math.ts` + 4dp rules

---

## 5. Storage Recommendation

### Do not use Railway filesystem

Railway container disk is **ephemeral** across deploys/restarts. Gold purchase documents are financial records — they must survive deploys.

### Use existing S3-compatible storage (recommended)

The project **already uses external object storage** for avatars. Gold documents should use the **same bucket** (or a dedicated prefix):

```
gold/{userId}/{documentId}/{timestamp}-{uuid}.{pdf|jpg|png}
```

| Aspect | Recommendation |
|--------|----------------|
| Provider | Keep `STORAGE_*` (Tigris/S3-compatible) |
| ACL | **Private** — no public URLs for gold docs |
| Retrieval | JWT-protected `GET /gold/documents/:id/file` stream (mirror avatar proxy) |
| Backup | Inherited from object storage provider |
| Railway volume | **Not recommended** as primary store |

### Optional later

Separate bucket `STORAGE_GOLD_BUCKET` — only if compliance/retention policies require isolation. Not needed for Phase 2 start.

---

## 6. GoldDocument Database Design

### Table: `gold_documents`

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `id` | uuid PK | NO | |
| `user_id` | uuid FK → users | NO | Ownership |
| `original_file_name` | varchar(255) | NO | Display name |
| `mime_type` | varchar(127) | NO | Stored content type |
| `file_size_bytes` | int | NO | |
| `storage_key` | varchar(512) | NO | S3 object key |
| `sha256_hash` | char(64) | NO | Exact duplicate detection |
| `extraction_status` | varchar(32) | NO | Document-level lifecycle |
| `extraction_error` | text | YES | Last failure message (no secrets) |
| `raw_extract` | jsonb | YES | Full OCR/parser output (audit/debug) |
| `page_count` | int | YES | PDF pages processed |
| `confirmed_at` | timestamptz | YES | When all selected items confirmed (or doc closed) |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | |

**Indexes / constraints:**

- `UNIQUE (user_id, sha256_hash)` — exact file duplicate per user
- `INDEX (user_id, created_at DESC)` — document history list
- `INDEX (user_id, extraction_status)` — processing queue

**Omitted (Phase 2):** separate `storage_provider` column if single provider; add later if multi-cloud.

---

## 7. Extraction Candidate Design

### Table: `gold_extraction_items`

One row = **one detected purchase candidate** from a document.

| Column | Type | Null | Purpose |
|--------|------|------|---------|
| `id` | uuid PK | NO | |
| `gold_document_id` | uuid FK | NO | Parent document |
| `user_id` | uuid FK | NO | Denormalized for auth/index (matches purchase pattern) |
| `row_index` | int | NO | Order in document (0-based) |
| `status` | varchar(32) | NO | Item lifecycle |
| `purchase_date` | date | YES | Extracted |
| `weight_grams` | numeric(12,4) | YES | Extracted |
| `amount_paid_cents` | int | YES | Extracted |
| `price_per_gram_cents` | int | YES | Extracted or derived |
| `reference_number` | varchar(100) | YES | PG transaction ref |
| `confidence` | numeric(5,4) | YES | 0–1 per field or aggregate |
| `raw_fields` | jsonb | YES | Original OCR strings + bounding boxes |
| `validation_warnings` | jsonb | YES | e.g. `["GRAMS_OVER_4DP", "MISSING_REFERENCE"]` |
| `gold_purchase_id` | uuid FK → gold_purchases | YES | Set on confirm |
| `confirmed_at` | timestamptz | YES | |
| `rejected_at` | timestamptz | YES | |
| `created_at` | timestamptz | NO | |
| `updated_at` | timestamptz | NO | |

**Indexes:**

- `INDEX (gold_document_id, row_index)`
- `UNIQUE (gold_document_id, row_index)`
- `INDEX (user_id, status)`
- `UNIQUE (gold_purchase_id)` where not null — one purchase per confirmed item

**Why JSONB + columns:** Normalized columns power validation, duplicates, and GraphQL; `raw_fields` preserves audit trail of what OCR returned vs what user confirmed.

---

## 8. Document/Purchase Relationship

### Do not use strict 1:1

| Document type | Typical rows |
|---------------|--------------|
| Single receipt screenshot | 1 |
| Public Gold History PDF/image | **Many** |
| Cropped image of one line | 1 |

### Recommended model

```
GoldDocument (1) ──▶ (N) GoldExtractionItem ──▶ (0..1) GoldPurchase
```

- **Before confirm:** items exist; **no** `GoldPurchase`
- **On confirm:** create `GoldPurchase`, set `gold_purchase_id`, `source = 'OCR'` or `'IMPORT'`, link optional `gold_extraction_item_id` on purchase (or FK on item only)
- **Same document, multiple confirms:** user selects subset of rows across sessions until all imported or rejected

### Optional on `gold_purchases`

| Column | Purpose |
|--------|---------|
| `gold_extraction_item_id` | uuid nullable FK | Traceability |
| `gold_document_id` | uuid nullable FK | Quick "view original" from purchase |

Prefer **item → purchase** as primary link; purchase → document is optional denormalization.

---

## 9. Duplicate Detection Design

### A. Exact file duplicate (mandatory)

| Step | Where |
|------|-------|
| Compute SHA-256 | **Backend only** (Node `crypto.createHash('sha256')` on buffer) |
| Check | `SELECT … WHERE user_id = ? AND sha256_hash = ?` |
| On duplicate | Return existing `GoldDocument` id + `duplicate: true` — **no new object, no re-extraction** (unless retry policy says otherwise) |

**Do not** trust client hash alone (can preview for UX only).

**Constraint:** `UNIQUE (user_id, sha256_hash)` — appropriate for same-user re-upload of identical bytes (even different filename).

**Cross-user:** Same hash allowed (different users may upload same PG template screenshot — rare; no global unique).

### B. Logical transaction duplicate (advisory, not blocking)

Same purchase uploaded as screenshot + PDF + crop → **different SHA-256**, same transaction.

**Detection heuristic (warn, don't hard-block):**

Match active `gold_purchases` where:

- `reference_number` matches (if present) **OR**
- (`purchase_date` + `weight_grams` + `amount_paid_cents`) all match

Also check other **confirmed** extraction items with same tuple.

**UX:** Show `LIKELY_DUPLICATE` warning on item; user can skip or confirm anyway (legitimate repeat buys on same day exist — e.g. two 0.5g buys).

**Do not** auto-reject — false positives block real purchases.

### C. Re-confirm idempotency

- Confirmed items: `status = CONFIRMED`, `gold_purchase_id` set
- Confirm mutation must be **idempotent** — second confirm returns same purchase, no double-create

---

## 10. OCR / Extraction Technology Recommendation

### Installed today

| Capability | Status |
|------------|--------|
| PDF parsing | **Not installed** (no `pdf-parse`, `pdfjs-dist`) |
| OCR (Tesseract) | **Not installed** |
| Image processing (sharp) | **Not installed** |
| Cloud vision APIs | **Not configured** |
| LLM vision | **Not configured** |

### Recommended: Backend hybrid (not on-device first)

| Stage | Input | Tool | Rationale |
|-------|-------|------|-----------|
| 1 | Text-based PDF | `pdf-parse` or `pdfjs-dist` | Fast, cheap, accurate for digital PDFs |
| 2 | Image / scanned PDF | **Tesseract** (`tesseract.js` or native `node-tesseract-ocr`) | No per-page API cost; runs on Railway |
| 3 | Layout parsing | Custom regex/table parser for Public Gold patterns | MYR amounts, dates DD/MM/YYYY, grams with 4dp |
| 4 (optional later) | Messy screenshots | Cloud OCR (Textract/Vision) or LLM vision | Higher accuracy, ongoing cost, privacy review |

**Avoid for Phase 2 start:**

- On-device OCR (hard to test, inconsistent, splits logic)
- Fully LLM-dependent extraction (non-deterministic money fields)
- Auto-create purchases from OCR output

**Pipeline:**

```
Upload → store → EXTRACTING job
  → if PDF: try text extract
  → if no text / image: OCR
  → parse PG patterns → N extraction items
  → EXTRACTED or FAILED
```

**Financial rule:** Parsed values are **candidates** until user confirms; use existing `gold-math.ts` on confirm.

---

## 11. Image Handling

| Topic | Recommendation |
|-------|----------------|
| MIME allowlist | `image/jpeg`, `image/png`, `image/webp`, `image/heic` (if RN sends) |
| Max size | **20 MB** for gold docs (multi-page PDFs); keep avatar at 10 MB |
| Validation | Magic-byte sniff for images (first bytes) — **add** (ProfileMedia lacks this) |
| Multi-page | N/A for pure images |
| RN picker | `launchImageLibrary` + `launchCamera` for screenshots |
| Display | Reuse auth-header pattern from `useAvatarImageSource.ts` for private GET |

---

## 12. PDF Handling

| Question | Answer |
|----------|--------|
| Existing stack accepts PDF? | **No** — avatar MIME whitelist excludes PDF |
| PDF parser installed? | **No** |
| Text vs scanned? | Try text extraction first; fall back to OCR per page |
| Multi-page | Process all pages; merge rows; set `page_count` |
| Size limit | 20 MB initial; monitor Railway memory (multer in-memory!) |
| Staged pipeline | 1) Upload 2) Detect MIME 3) Text extract 4) OCR fallback 5) Parse rows |

**Memory risk:** Current multer loads full file into RAM. For 20 MB PDFs on Railway, consider **streaming upload to S3** (multipart upload) in a later hardening phase — not blocking 2A if limit stays 10–15 MB initially.

---

## 13. Security Design

| Risk | Mitigation |
|------|------------|
| Unauthorized access | JWT on all upload/get/confirm; `user_id` scoping on every query |
| Cross-user document access | Service layer `requireOwnedDocument(userId, id)` — mirror gold purchase ownership |
| Public URLs | **Private bucket** + `GET /gold/documents/:id/file` with JWT (no permanent public links) |
| MIME spoofing | Magic-byte check + allowlist; reject mismatched extension/MIME |
| Malicious PDF | Size limits; no server-side PDF script execution; parse text only; virus scan optional later |
| Path traversal | Storage keys server-generated; never use raw `originalname` in key |
| Log redaction | Do not log file bytes, JWT, or full OCR text in production logs |
| Extracted data exposure | GraphQL returns only owning user's documents/items |
| Auth module | **Do not modify** JWT issuance/refresh; only **use** existing guards |

---

## 14. Backend API Design

Follow repo convention: **REST for bytes, GraphQL for finance metadata**.

### REST (new `gold-media` or `gold-documents` controller)

| Method | Path | Purpose |
|--------|------|---------|
| `POST` | `/gold/documents` | Multipart upload (`file` field); returns document id + duplicate flag |
| `GET` | `/gold/documents/:id/file` | Stream original (JWT, owner only) |

Optional later: `DELETE /gold/documents/:id` (soft-delete metadata; retain or purge S3 per policy)

### GraphQL (extend `GoldResolver` or new resolver)

| Operation | Type | Purpose |
|-----------|------|---------|
| `myGoldDocuments` | Query | History list (status, counts, dates) |
| `goldDocumentById` | Query | Document + extraction items |
| `confirmGoldExtractionItem` | Mutation | User-reviewed values → create `GoldPurchase` |
| `rejectGoldExtractionItem` | Mutation | Mark skipped |
| `retryGoldDocumentExtraction` | Mutation | Re-run extract on FAILED |

Naming follows existing snake_case GraphQL fields (`myGoldPurchases`, `createGoldPurchase`).

### Extraction execution

**Phase 2A–B:** Synchronous stub or queue placeholder  
**Phase 2C+:** `@nestjs/schedule` already installed — or inline async after upload with status polling (simpler for MVP)

---

## 15. Confirmation / Import Workflow

```
1. User picks image/PDF (RN)
2. POST /gold/documents (REST)
3. Backend: SHA-256 → duplicate? → return existing OR store S3 + insert GoldDocument (UPLOADED)
4. Set EXTRACTING → run pipeline → create GoldExtractionItem rows → EXTRACTED | FAILED
5. GraphQL: goldDocumentById → preview items + warnings
6. User edits row fields (RN local state)
7. User selects rows to import
8. For each selected row: confirmGoldExtractionItem(input)
   a. Validate 4dp grams, cents, dates (reuse gold-math + DTO validators)
   b. Check logical duplicate warnings
   c. BEGIN TRANSACTION
   d. Create GoldPurchase (source=OCR, link item id)
   e. Mark item CONFIRMED, set gold_purchase_id
   f. COMMIT
9. Refresh goldDashboard / GoldHome on success
10. Document history shows confirmed count
```

**Never** create `GoldPurchase` in upload or extraction steps.

**Idempotency:** Confirm mutation keyed by `extraction_item_id` + idempotency check on `gold_purchase_id IS NOT NULL`.

---

## 16. Frontend UX / Screens

Minimum screen set (reuse Gold module layout):

| Screen | Purpose |
|--------|---------|
| `GoldDocumentUploadScreen` | Pick image/PDF, upload progress, duplicate alert |
| `GoldDocumentReviewScreen` | Preview doc metadata + list of extraction cards (edit/select) |
| `GoldDocumentHistoryScreen` | All uploads, status, retry, link to purchases |
| Extend `GoldHomeScreen` | CTA: "Upload purchase document" + link to history |
| Extend `GoldDetailsScreen` | If purchase linked: "View source document" |

**Components (new under `src/modules/gold/components/`):**

- `GoldDocumentUploadPicker`
- `GoldExtractionItemCard` (editable fields, warnings, checkbox)
- `GoldDocumentStatusBadge`
- `GoldDuplicateBanner`

**Reuse:** `GoldPurchaseForm` field validators from `goldHelpers.ts`, `ScreenWrapper`, `AppCard`, `PrimaryButton`, `ErrorView`, `LoadingView`.

**Do not implement Phase 3:** price screenshot extraction on `GoldPriceEdit`.

---

## 17. Document History Design

"History of Purchase" in Gold should show **both**:

- Manual/imported **`GoldPurchase`** rows (existing list on `GoldHome`)
- **`GoldDocument`** uploads (new section or tab)

**Document history row:**

- Original filename
- Upload date
- Status badge (`EXTRACTING`, `EXTRACTED`, `FAILED`, etc.)
- Extracted count / confirmed count (e.g. `3 detected · 2 imported`)
- Tap → review screen or file preview
- Retry extraction if `FAILED`
- Duplicate indicator if `sha256` match

**Linking:** From purchase detail → source document; from document → list of confirmed purchases.

---

## 18. Error / Retry Design

| Failure | Backend | Frontend |
|---------|---------|----------|
| Unsupported MIME | 400 Bad Request | "Use JPG, PNG, or PDF" |
| File too large | 400 | Show max size |
| Exact duplicate | 200 + `duplicate: true` | Banner + link to existing doc |
| Upload interrupted | No document row (or FAILED) | Retry upload |
| Extraction failed | `FAILED` + `extraction_error` | Retry button → `retryGoldDocumentExtraction` |
| No rows detected | `EXTRACTED` + 0 items | "No purchases found — enter manually" |
| Grams > 4 dp | Item warning flag | Highlight field; block confirm until fixed |
| Invalid amount | Validation error on confirm | Inline error |
| Missing reference | Warning only | User can still confirm |
| Already confirmed | 409 or idempotent return | Disable confirm button |
| Backend timeout | FAILED or EXTRACTING stuck | Poll status + retry |
| Network | ApiError network | Standard `ErrorView` + retry |

---

## 19. Backend File Change Plan

### Files to create

| Path | Purpose |
|------|---------|
| `nest/src/gold/entities/gold-document.entity.ts` | `GoldDocument` |
| `nest/src/gold/entities/gold-extraction-item.entity.ts` | Candidates |
| `nest/src/gold/gold-document.controller.ts` | REST upload/stream |
| `nest/src/gold/gold-document.service.ts` | CRUD, hash, lifecycle |
| `nest/src/gold/gold-extraction.service.ts` | Parse/OCR orchestration |
| `nest/src/gold/gold-document.resolver.ts` | GraphQL queries/mutations |
| `nest/src/gold/dto/confirm-gold-extraction-item.input.ts` | Confirm/reject inputs |
| `nest/src/gold/models/gold-document.model.ts` | GraphQL types |
| `nest/src/gold/gold-document-parser.ts` | PG-specific text parser |
| `nest/src/storage/object-storage.service.ts` | Shared S3 ops (extracted from profile-media) |
| `nest/src/gold/migrations/003_gold_documents.sql` | Schema |
| `nest/src/gold/gold-document.service.spec.ts` | Tests |
| `nest/src/gold/gold-extraction.service.spec.ts` | Tests |

### Files to modify

| Path | Reason |
|------|--------|
| `nest/src/gold/gold.module.ts` | Register new entities/services/controller |
| `nest/src/gold/gold.service.ts` | `createFromExtractionItem()`, allow `source` OCR/IMPORT |
| `nest/src/gold/dto/create-gold-purchase.input.ts` | Optional `source` (or separate confirm DTO only) |
| `nest/src/gold/models/gold.model.ts` | Optional `gold_document_id` on purchase |
| `nest/src/gold/gold-purchase.entity.ts` | FK columns for traceability |
| `nest/src/entities/entities.ts` | Register entities |
| `nest/src/app.module.ts` | If new module split |
| `nest/src/profile-media/profile-media.service.ts` | Refactor to use shared `ObjectStorageService` (optional 2A+) |

### Files not to modify

- `nest/src/auth/**` (except using existing guards)
- `nest/src/gold/gold-math.ts` formulas (only **use** on confirm)
- Pawn-loan, income, expense modules
- PG price screenshot / Phase 3 paths

---

## 20. Frontend File Change Plan

### Create

| Path | Purpose |
|------|---------|
| `react-native/src/modules/gold/api/goldDocumentApi.ts` | REST upload + helpers |
| `react-native/src/modules/gold/api/goldDocument.graphql.ts` | Queries/mutations |
| `react-native/src/modules/gold/api/goldDocument.types.ts` | Types |
| `react-native/src/modules/gold/hooks/useGoldDocumentUpload.ts` | Upload state |
| `react-native/src/modules/gold/hooks/useGoldDocumentReview.ts` | Poll + items |
| `react-native/src/modules/gold/hooks/useGoldDocumentHistory.ts` | List |
| `react-native/src/modules/gold/screens/GoldDocumentUploadScreen.tsx` | |
| `react-native/src/modules/gold/screens/GoldDocumentReviewScreen.tsx` | |
| `react-native/src/modules/gold/screens/GoldDocumentHistoryScreen.tsx` | |
| `react-native/src/modules/gold/components/GoldExtractionItemCard.tsx` | |
| `react-native/src/modules/gold/components/GoldDocumentUploadPicker.tsx` | |
| `react-native/src/modules/gold/components/GoldDuplicateBanner.tsx` | |
| `react-native/src/modules/gold/utils/goldExtractionHelpers.ts` | Map OCR → form, warnings |
| `react-native/src/modules/gold/__tests__/goldExtractionHelpers.test.ts` | |

### Modify

| Path | Reason |
|------|--------|
| `react-native/src/navigation/types.ts` | New routes |
| `react-native/src/navigation/stacks/ProfileStack.tsx` | Register screens |
| `react-native/src/modules/gold/screens/GoldHomeScreen.tsx` | Upload + history CTAs |
| `react-native/src/modules/gold/screens/GoldDetailsScreen.tsx` | Link to source doc |
| `react-native/package.json` | Add `react-native-document-picker` (PDF) |

### Do not modify

- Auth/session/Apollo middleware
- Unrelated dashboard/income modules

---

## 21. Automated Test Strategy

### Backend

| Test | Focus |
|------|-------|
| SHA-256 duplicate | Same bytes → same document, no second S3 put |
| Cross-user isolation | User B cannot access User A document |
| MIME rejection | `application/zip` rejected |
| Size rejection | > max bytes |
| 4dp grams on confirm | `1.1686` ok; `1.16861` rejected |
| Confirm creates purchase | `source=OCR`, links item |
| Confirm idempotency | Double confirm → one purchase |
| Multi-row PDF fixture | 3 items extracted |
| Logical duplicate warning | Same ref → warning, confirm still allowed |
| Transaction rollback | Confirm fails mid-batch → no orphan purchase |
| Extraction failure | Status `FAILED`, no purchases |
| Ownership | confirm/reject forbidden for other user |

### Frontend

| Test | Focus |
|------|-------|
| `goldExtractionHelpers` | Parse API item → form values, warnings |
| Upload state machine | idle → uploading → success/error |
| Duplicate banner | Renders when API says duplicate |
| Item selection | Toggle rows before confirm |
| Manual correction | Edited grams preserved on confirm payload |
| Navigation | Upload → review → home refresh |
| Document history | Lists statuses |

---

## 22. Phase 2 Sub-Phases

| Sub-phase | Deliverable | Portfolio impact |
|-----------|-------------|------------------|
| **2A** | `GoldDocument` entity, REST upload, S3 storage, SHA-256 dedup, private GET stream, GraphQL list/detail | **None** |
| **2B** | `GoldExtractionItem` entity, lifecycle statuses, stub extractor (manual seed/fixture) | **None** |
| **2C** | Real PDF text + OCR pipeline + PG parser → items | **None** |
| **2D** | `confirmGoldExtractionItem` mutation, link `GoldPurchase`, idempotency, refresh dashboard | **Only on confirm** |
| **2E** | RN upload picker (image+PDF), review UI, history screen, integration tests | User-facing flow |

**Optional 2F:** Streaming upload, virus scan, cloud OCR upgrade.

---

## 23. Risks / Decisions Needed

| # | Decision | Options | Recommendation |
|---|----------|---------|----------------|
| 1 | Multi-row model | 1:1 vs 1:N items | **1:N `GoldExtractionItem`** (required for history PDFs) |
| 2 | Storage | Railway disk vs S3 | **Existing S3-compatible `STORAGE_*`** |
| 3 | OCR engine | Tesseract vs cloud vs LLM | **Tesseract + pdf-parse first**; cloud optional later |
| 4 | Multer memory | In-memory vs stream to S3 | In-memory OK for ≤15 MB MVP; stream later |
| 5 | Logical duplicate | Block vs warn | **Warn only** |
| 6 | Max file size | 10 vs 20 MB | **20 MB** for gold PDFs |
| 7 | Extraction async | Sync vs background job | **Async status polling** (avoid HTTP timeout) |
| 8 | Purchase `source` | OCR vs IMPORT | **`OCR`** for scanned/docs; **`IMPORT`** for structured file imports |
| 9 | Delete document | Hard delete S3? | Soft-delete metadata; S3 lifecycle policy later |
| 10 | Deploy 4dp backend | Railway migration | **Prerequisite** — Phase 2 confirm uses 4dp validation |

**Risks:**

- OCR accuracy on Malay/English PG layouts — mitigated by user review
- Railway memory on large PDF + OCR — limit size, process pages incrementally
- `JwtAuthGuard` GraphQL-centric — consider REST-specific guard for clarity
- No document picker in RN — must add dependency

---

## 24. Phase 2 Definition of Done

Phase 2 is complete when:

1. User can upload JPG/PNG/PDF from Gold module (Android).
2. Original file persists in S3-compatible storage (survives deploy).
3. Exact duplicate file (same SHA-256) returns existing document for same user.
4. Extraction produces zero or more **reviewable** items (including multi-row history docs).
5. **No** `GoldPurchase` created until user confirms selected rows.
6. User can edit date, grams (4dp), amount, price/g, reference before confirm.
7. Confirm creates `GoldPurchase` with `source = OCR` (or `IMPORT`), links to document/item.
8. Logical duplicate warnings shown; user can override.
9. Document history shows uploads, status, and import counts.
10. Confirmed purchases appear on GoldHome; dashboard totals update.
11. User isolation and JWT-protected file access enforced.
12. Automated tests cover hash dedup, confirm, 4dp, and multi-row parsing fixtures.
13. PG BUY/SELL rules and Phase 1 manual flows unchanged.

**Explicitly out of scope:** Phase 3 price screenshot OCR, notifications, targets, AI recommendations.

---

## Recommended First Implementation Task

**Phase 2A — Gold document upload foundation (backend-first slice)**

Implement only:

1. **`gold_documents` table** + TypeORM entity (`GoldDocument`) with `sha256_hash`, `storage_key`, `extraction_status = UPLOADED`, user scoping.
2. **Shared `ObjectStorageService`** extracted from `ProfileMediaService` patterns (Put/Get/Delete).
3. **REST `POST /gold/documents`** — JWT, multipart `file`, allow `image/jpeg|png|webp|application/pdf`, compute **SHA-256 on backend**, enforce `UNIQUE (user_id, sha256_hash)`, store to `gold/{userId}/…`, return `{ document, duplicate: boolean }`.
4. **REST `GET /gold/documents/:id/file`** — owner-only stream (private bucket).
5. **GraphQL `myGoldDocuments` + `goldDocumentById`** — metadata only, no extraction items yet.
6. **Tests:** hash dedup, MIME reject, size reject, cross-user isolation.

**Do not implement:** OCR, extraction items, confirm mutation, or React Native UI in this first slice.

This establishes persistent storage and duplicate protection without touching portfolio calculations — the safest, reviewable foundation for Phase 2B onward.

---

## Appendix A — Reference file paths

### Backend (existing)

- `nest/src/profile-media/profile-media.controller.ts`
- `nest/src/profile-media/profile-media.service.ts`
- `nest/src/gold/gold.service.ts`
- `nest/src/gold/gold-purchase.entity.ts`
- `nest/src/gold/gold-math.ts`
- `nest/docs/gold/PHASE1_GOLD_IMPLEMENTATION_PLAN.md`
- `nest/docs/architecture/CODING_STANDARD.md`

### Frontend (existing)

- `react-native/src/api/profileApi.ts`
- `react-native/src/modules/gold/`
- `react-native/docs/gold/PHASE1_FRONTEND_IMPLEMENTATION_REPORT.md`
