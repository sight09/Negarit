# ⚖️ Understanding the Ethiopian Legal Framework

> This document provides jurisdictional and constitutional context for judges, legal researchers, and evaluators reviewing the **Negarit (ነጋሪት)** project.

---

## 1. The Federal Negarit Gazette (*የፌዴራል ነጋሪት ጋዜጣ*)

Established in 1942, the **Negarit Gazette** is the official legislative gazette of the Ethiopian government. 
- Under Ethiopian constitutional law, **no proclamation, regulation, or decree has legal force until it is published in the Negarit Gazette**.
- It is named after the traditional drum (*ነጋሪት*) historically sounded to herald royal proclamations and public decrees to the people.

---

## 2. The Constitutional Bilingual Requirement

Article 106 of the **Constitution of the Federal Democratic Republic of Ethiopia (FDRE)** states:
> *"The Federal Negarit Gazeta shall be published in both the Amharic and English languages. In case of divergence between the two versions, the **Amharic version shall prevail**."*

### The AI Challenge
Because Amharic has legal supremacy in disputes, an English-only AI model or an AI that cannot cite the authentic Amharic provision is legally unsafe for commercial disputes or courtroom practice. 
**Negarit solves this by:**
1. Extracting and indexing both Amharic and English versions.
2. Structurally pairing corresponding articles.
3. Allowing researchers to view the binding Amharic text alongside English translations at a single click.

---

## 3. Hierarchy of Ethiopian Legislation

Ethiopian jurisprudence follows a strict hierarchical order of legal authority:

```
┌────────────────────────────────────────────────────────┐
│               1. The FDRE Constitution                 │
│              (Supreme Law of the Land)                 │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│           2. Proclamations (አዋጅ - Awaj)                │
│    (Enacted by House of Peoples' Representatives)      │
│  e.g., Ethiopian Startup Proclamation No. 1396/2025   │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             3. Regulations (ደንብ - Denb)                │
│             (Issued by Council of Ministers)           │
└──────────────────────────┬─────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────┐
│             4. Directives (መመሪያ - Memeriya)           │
│     (Issued by individual Ministries & Regulators)     │
└────────────────────────────────────────────────────────┘
```

Negarit's data architecture models this legislative taxonomy natively, tracking Proclamations, Regulations, Directives, and their enactment status (`IN_FORCE`, `AMENDED`, `REPEALED`, `SUPERSEDED`, `HISTORICAL`).

---

## 4. Dual Federal & Regional Jurisdictions

Ethiopia is a federal state comprising **12 regional states and 2 chartered cities** (Addis Ababa and Dire Dawa). While federal proclamations govern matters such as national commerce, banking, taxation, and intellectual property, regional states publish their own regional gazettes for regional legislation.

Negarit's query engine supports **15 jurisdiction scopes**:
- `federal`
- `addis_ababa`
- `dire_dawa`
- `oromia`
- `amhara`
- `tigray`
- `somali`
- `afar`
- `sidama`
- `benishangul_gumuz`
- `gambela`
- `harari`
- `snnpr`
- `south_west`
- `central_ethiopia`

---

## 5. Societal & Economic Impact of Negarit

1. **Access to Justice:** Democratizes access to legal texts for everyday citizens who cannot afford expensive commercial legal databases or law firm retainers.
2. **Startup & Investment Growth:** Facilitates foreign and domestic investment by allowing founders and investors to instantly clarify compliance obligations under the new *Startup Proclamation No. 1396/2025* and *Commercial Code No. 1243/2021*.
3. **Judicial Efficiency:** Equips judges, prosecutors, and public defenders with instant article-level and page-level citations, eliminating hours of manual leafing through paper gazette archives.
4. **Anti-Corruption & Transparency:** Reduces reliance on second-hand interpretations by grounding every answer strictly in authentic, verifiable gazette texts.
