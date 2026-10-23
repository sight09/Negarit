# Federal Negarit Gazette Corpus Directory

This directory is designated for official **Federal Negarit Gazette** (*የፌዴራል ነጋሪት ጋዜጣ*) PDF documents.

## How to Ingest Documents

You can ingest official Ethiopian gazettes using either the **Admin Web Console** or the **CLI**:

### Option 1: Via Admin Console (Recommended)
1. Navigate to `http://localhost:3000/admin`.
2. Scroll to **"Upload legal document"**.
3. Select your PDF (e.g. `Ethiopian Startup Proclamation No. 1396/2025.pdf`).
4. Fill in the metadata:
   - **Title**: `Ethiopian Startup Proclamation`
   - **Proclamation Number**: `1396/2025`
   - **Jurisdiction**: `Federal`
   - **Category**: `Startup / Business`
   - **Status**: `IN_FORCE`
   - **Language**: `Bilingual`
5. Click **"Upload & ingest"** to watch real-time extraction, chunking, and vector indexing.

### Option 2: Via CLI
Place your PDF into this directory (`corpus/federal/`) and run:

```bash
node scripts/ingest.mjs corpus/federal/startup-proclamation-1396-2025.pdf \
  --title "Ethiopian Startup Proclamation" \
  --proc 1396/2025 \
  --category startup \
  --status IN_FORCE \
  --jurisdiction federal \
  --language bilingual \
  --source "Federal Negarit Gazette" \
  --gazette "Federal Negarit Gazette"
```

## Recommended Documents for Demonstration
1. **Ethiopian Startup Proclamation No. 1396/2025** — Innovation, tax incentives, startup ecosystem.
2. **Labor Proclamation No. 1156/2019** — Employment rights, severance, working hours.
3. **Commercial Code of Ethiopia Proclamation No. 1243/2021** — Corporate structures, partnerships, bankruptcy.
4. **Federal Civil Servants Proclamation No. 1064/2017** — Public sector employment and rights.
