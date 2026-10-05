#!/usr/bin/env node
/**
 * Generates the 175-question evaluation dataset. Questions are written against
 * the documented first corpus document (Ethiopian Startup Proclamation
 * No. 1396/2025) plus broader legal areas. Questions whose expected source is
 * not indexed yet are counted as "uncovered" by the evaluator, so corpus gaps
 * are never mistaken for retrieval failures.
 */
import { writeFile } from "fs/promises";

const PROC = "1396/2025";

let id = 0;
const q = (language, question, extra = {}) => ({
  id: `${language}-${++id}`,
  question,
  language,
  expectedLanguage: language,
  expected: {},
  ...extra,
});

// ── 25 exact lookups (article + proclamation) ───────────────────────────────
const exact = [];
for (let a = 1; a <= 20; a++) {
  exact.push(
    q("en", a % 2 ? `What does Article ${a} of Proclamation ${PROC} say?` : `Show me Article ${a} of the Startup Proclamation (${PROC}).`, {
      expected: { proclamationNumber: PROC, article: String(a) },
      kind: "ARTICLE_LOOKUP",
    }),
  );
}
exact.push(
  q("en", `What is Proclamation ${PROC}?`, { expected: { proclamationNumber: PROC }, kind: "PROCLAMATION_LOOKUP" }),
  q("en", `Tell me about proclamation number ${PROC}.`, { expected: { proclamationNumber: PROC }, kind: "PROCLAMATION_LOOKUP" }),
  q("am", `አዋጅ ቁጥር ${PROC} ምንድነው?`, { expected: { proclamationNumber: PROC }, kind: "PROCLAMATION_LOOKUP" }),
  q("am", `የአዋጅ ${PROC} አንቀጽ 1 ምን ይላል?`, { expected: { proclamationNumber: PROC, article: "1" }, kind: "ARTICLE_LOOKUP" }),
  q("am", `አንቀጽ 2 በአዋጅ ${PROC} ስዕረት ምን ይዟል?`, { expected: { proclamationNumber: PROC, article: "2" }, kind: "ARTICLE_LOOKUP" }),
);

// ── 50 English questions ────────────────────────────────────────────────────
const enStartup = [
  "What is the Ethiopian Startup Proclamation?",
  "What is the scope of application of the Startup Proclamation?",
  "What objectives does the Startup Proclamation pursue?",
  "How does the Startup Proclamation define a startup?",
  "What does the Startup Proclamation say about innovation?",
  "Which institution administers the startup framework under the Startup Proclamation?",
  "What requirements must a business meet to be recognized as a startup?",
  "What incentives does the Startup Proclamation provide for startups?",
  "How are startups registered under the Startup Proclamation?",
  "What does the Startup Proclamation say about intellectual property for startups?",
  "Does the Startup Proclamation address access to finance for startups?",
  "What role do incubators and accelerators play under the Startup Proclamation?",
  "When did the Startup Proclamation come into force?",
  "Which body issues directives under the Startup Proclamation?",
  "What does the Startup Proclamation say about startup support services?",
];
const enAreas = [
  ["labor", "What are the rights of an employee when an employment contract is terminated?"],
  ["labor", "What does Ethiopian law say about employee annual leave?"],
  ["labor", "What is the probation period for employees under Ethiopian law?"],
  ["labor", "What severance pay is an employee entitled to?"],
  ["labor", "What are the legal working hours in Ethiopia?"],
  ["data_protection", "Which law regulates personal data protection in Ethiopia?"],
  ["data_protection", "What rights do data subjects have under Ethiopian data protection law?"],
  ["data_protection", "What are the obligations of data controllers in Ethiopia?"],
  ["data_protection", "Does Ethiopian law allow cross-border transfer of personal data?"],
  ["commercial", "What does the Commercial Code say about companies?"],
  ["commercial", "What are the requirements for establishing a company in Ethiopia?"],
  ["commercial", "What are the duties of company directors under Ethiopian law?"],
  ["commercial", "How can a private limited company be dissolved in Ethiopia?"],
  ["business", "According to Ethiopian law, what are the requirements for establishing a startup business?"],
  ["business", "What licences are required to operate a business in Addis Ababa?"],
  ["tax", "What taxes apply to small businesses in Ethiopia?"],
  ["tax", "What is the VAT registration threshold in Ethiopia?"],
  ["investment", "What incentives exist for foreign investors in Ethiopia?"],
  ["investment", "Which sectors are reserved for domestic investors in Ethiopia?"],
  ["land", "What is the current law regarding rural land administration?"],
  ["land", "Can rural land be sold in Ethiopia?"],
  ["land", "What are the land use rights of farmers under Ethiopian law?"],
  ["criminal", "What are the penalties for theft under the Ethiopian Criminal Code?"],
  ["criminal", "How does Ethiopian law define criminal negligence?"],
  ["criminal_procedure", "What are the rights of an arrested person in Ethiopia?"],
  ["family", "What is the legal age of marriage in Ethiopia?"],
  ["family", "What does the Revised Family Code say about divorce?"],
  ["constitution", "What fundamental rights does the Ethiopian Constitution guarantee?"],
  ["constitution", "What does the Constitution say about freedom of expression?"],
  ["environment", "What environmental impact assessment requirements exist in Ethiopia?"],
  ["banking", "Which institution regulates banks in Ethiopia?"],
  ["customs", "What customs duties apply to imported goods in Ethiopia?"],
  ["intellectual_property", "How are trademarks protected in Ethiopia?"],
  ["telecommunications", "Which law regulates telecommunications in Ethiopia?"],
  ["immigration", "What are the visa requirements for foreign nationals in Ethiopia?"],
];
const english = [
  ...enStartup.map((question) => q("en", question, { expected: { proclamationNumber: PROC } })),
  ...enAreas.map(([category, question]) => q("en", question, { expected: { category } })),
];

// ── 50 Amharic questions ────────────────────────────────────────────────────
const amStartup = [
  "የኢትዮጵያ የስታርታፕ አዋጅ ምንድነው?",
  "የስታርታፕ አዋጁ የተፈፃሚነት ወሰን ምንድነው?",
  "የስታርታፕ አዋጁ ዓላማዎች ምን ምን ናቸው?",
  "ስታርታፕ ማለት ምን ማለት ነው እንደ አዋጁ?",
  "የስታርታፕ አዋጁ ስለ ፈጠራ ምን ይላል?",
  "የስታርታፕ አዋጁ የሚተዳደረው በየትኛው ተቋም ነው?",
  "አንድ ንግድ እንደ ስታርታፕ እንዲታወቅ ምን መስፈርት አለበት?",
  "የስታርታፕ አዋጁ ምን ዓይነት ማበረታቻዎች ይሰጣል?",
  "ስታርታፖች እንዴት ይመዘገባሉ?",
  "የስታርታፕ አዋጁ ስለ የአውድ ንብረት መብት ምን ይላል?",
  "የስታርታፕ አዋጁ ስለ ፋይናንስ ተደራሽነት ምን ይደንግጋል?",
  "ኢንኩቤተሮች እና አክሰሌሬተሮች በአዋጁ ስር ምን ሚና አላቸው?",
  "የስታርታፕ አዋጁ መሠረታዊ ዓላማዎች የትኞቹ ናቸው?",
  "በአዋጁ ስር መምሪያ የሚያወጣው ማን ነው?",
  "የአዋጁ አፈፃፀም በየትኛው ቀን ይጀምራል?",
];
const amAreas = [
  ["labor", "በኢትዮጵያ የሰራተኛ መብቶች ምንድን ናቸው?"],
  ["labor", "የስራ ስምሪት ውል ሲቋረጥ የሰራተኛው መብት ምንድነው?"],
  ["labor", "የሰራተኛ ዓመታዊ ዕረፍት ሕግ ምን ይላል?"],
  ["labor", "የሙከራ ጊዜ (probation) በሕግ ምን ይላል?"],
  ["labor", "የስራ ሰዓት በኢትዮጵያ ሕግ ምን ያህል ነው?"],
  ["data_protection", "የኢትዮጵያ የግል መረጃ ጥበቃ ሕግ ምን ይላል?"],
  ["data_protection", "የግል መረጃ ባለቤቶች ምን መብቶች አሏቸው?"],
  ["data_protection", "የመረጃ ተቆጣጣሪዎች ግዴታ ምንድነው?"],
  ["data_protection", "የግል መረጃን ወደ ሌላ አገር ማስተላለፍ ይፈቀዳል?"],
  ["commercial", "የንግድ ሕግ መመሪያ ስለ ኩባኒያዎች ምን ይላል?"],
  ["commercial", "በኢትዮጵያ ኩባኒያ ለመመስረት ምን መስፈርቶች አሉ?"],
  ["commercial", "የኩባኒያ ዳይሬክተሮች ተግባር ምንድነው?"],
  ["business", "በኢትዮጵያ ስራ ለመጀምር ምን ፍቃዶች ያስፈልጋሉ?"],
  ["tax", "ለትናንሽ ንግዶች ምን ዓይነት ግብሮች አሉ?"],
  ["tax", "የቫት (VAT) ምዝገባ መቶኛ ስንት ነው?"],
  ["investment", "ለውጭ ባለሃብቶች ምን ማበረታቻዎች አሉ?"],
  ["investment", "የትኞቹ ዘርፎች ለሀገር ውስጥ ባለሃብቶች ብቻ የተለዩ ናቸው?"],
  ["land", "ስለ ገጠር መሬት አስተዳደር ወቅታዊው ሕግ ምንድነው?"],
  ["land", "የገጠር መሬት መሸጥ ይቻላል?"],
  ["land", "የገበሬዎች የመሬት አጠቃቀም መብት ምንድነው?"],
  ["criminal", "ስለ ስህተት (theft) ቅጣት ሕጉ ምን ይላል?"],
  ["criminal_procedure", "የተያዘ ሰው መብቶች ምንድን ናቸው?"],
  ["family", "የጋብቻ ሕጋዊ እድሜ ስንት ነው?"],
  ["family", "የቤተሰብ ሕግ ስለ ፍቺ ምን ይላል?"],
  ["constitution", "ሕገ መንግሥቱ ስለ መሠረታዊ መብቶች ምን ይላል?"],
  ["constitution", "ስለ አስተሳሰብ ነፃነት ሕገ መንግሥቱ ምን ይላል?"],
  ["environment", "ስለ አካባቢ ጥልቀት ጥናት (EIA) ሕግ ምን ይላል?"],
  ["banking", "ባንኮችን የሚቆጣጠረው የትኛው ተቋም ነው?"],
  ["customs", "ስለ የገቢ ዕቃዎች ቀረጥ ሕግ ምን ይላል?"],
  ["intellectual_property", "የንግድ ምልክት (trademark) መብት እንዴት ይጠበቃል?"],
  ["telecommunications", "ቴሌኮሙኒኬሽንን የሚቆጣጠረው ሕግ የትኛው ነው?"],
  ["immigration", "ለውጭ ዜጎች የቪዛ መስፈርቶች ምን ናቸው?"],
  ["health", "የንጽሕና አገልግሎቶችን የሚቆጣጠረው ሕግ ምንድነው?"],
  ["education", "የትምህርት ሥርዓቱን የሚቆጣጠረው ሕግ ምንድነው?"],
  ["elections", "የምርጫ ሕግ ምን ይደንግጋል?"],
];
const amharic = [
  ...amStartup.map((question) => q("am", question, { expected: { proclamationNumber: PROC } })),
  ...amAreas.map(([category, question]) => q("am", question, { expected: { category } })),
];

// ── 25 cross-language questions ─────────────────────────────────────────────
const cross = [];
for (let i = 0; i < 12; i++) {
  cross.push(
    q("am", `${amStartup[i]}`, {
      expected: { proclamationNumber: PROC },
      kind: "CROSS_LANGUAGE",
      note: "Amharic question; should retrieve English + Amharic chunks of the same document.",
    }),
  );
}
for (let i = 0; i < 13; i++) {
  cross.push(
    q("en", `${enStartup[i]}`, {
      expected: { proclamationNumber: PROC },
      kind: "CROSS_LANGUAGE",
      note: "English question; Amharic chunk of the same article is a valid cross-lingual hit.",
    }),
  );
}

// ── 25 historical / current-law probes ──────────────────────────────────────
const historical_templates = [
  ["startup", "current", "What is the current law governing startups in Ethiopia?"],
  ["startup", "current", "Which proclamation currently regulates startups?"],
  ["land", "current", "What is the current law regarding rural land administration?"],
  ["labor", "current", "Which labour proclamation is currently in force?"],
  ["data_protection", "current", "Which law currently regulates personal data protection?"],
  ["commercial", "current", "What commercial code currently applies in Ethiopia?"],
  ["land", "historical", "What did the rural land proclamation say before it was amended?"],
  ["labor", "historical", "What did labour law say about annual leave in 2010?"],
  ["commercial", "historical", "What did the repealed commercial code say about companies?"],
  ["tax", "historical", "What was the previous VAT proclamation in Ethiopia?"],
  ["startup", "current", "Is the Startup Proclamation 1396/2025 currently in force or amended?", PROC],
  ["data_protection", "historical", "Was there a personal data protection law in Ethiopia before 2024?"],
  ["business", "historical", "Which law did the current business registration rules replace?"],
  ["labor", "current", "What is the currently applicable severance pay rule?"],
  ["investment", "current", "What investment law is currently in force in Ethiopia?"],
  ["investment", "historical", "What did the old investment proclamation say about incentives?"],
  ["land", "historical", "Compare the current rural land law with the previous proclamation."],
  ["commercial", "comparison", "Compare the current commercial code with the 1960 commercial code."],
  ["labor", "comparison", "Compare the current labour proclamation with the previous one."],
  ["startup", "comparison", "Compare the startup proclamation with general investment law.", PROC],
  ["data_protection", "comparison", "Compare data protection rules with cybersecurity rules in Ethiopia."],
  ["tax", "current", "What tax laws currently apply to startups?"],
  ["constitution", "current", "Is the FDRE Constitution currently in force?"],
  ["criminal", "current", "Is the 2004 Criminal Code currently in force?"],
  ["customs", "historical", "What did the customs proclamation say before amendment?"],
];
const historical = historical_templates.map(([category, timeframe, question, proc]) =>
  q(/[ሀ-፞]/.test(question) ? "am" : "en", question, {
    expected: proc ? { proclamationNumber: proc } : { category },
    kind: timeframe === "comparison" ? "COMPARISON" : timeframe === "historical" ? "HISTORICAL_LAW" : "CURRENT_LAW",
    timeframe,
  }),
);

const write = (name, arr) =>
  writeFile(new URL(`./${name}.json`, import.meta.url), JSON.stringify(arr, null, 2));
await write("exact_lookup_questions", exact);
await write("english_questions", english);
await write("amharic_questions", amharic);
await write("cross_language_questions", cross);
await write("historical_questions", historical);
console.log(
  `Wrote ${exact.length} exact, ${english.length} English, ${amharic.length} Amharic, ${cross.length} cross-language, ${historical.length} historical (total ${exact.length + english.length + amharic.length + cross.length + historical.length}).`,
);
