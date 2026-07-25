// bdgovt.info থেকে নতুন চাকরির বিজ্ঞপ্তি স্ক্র্যাপ করে Telegram ও WhatsApp এ পাঠায়
// প্রতি ৪ ঘন্টায় একবার GitHub Actions cron দিয়ে চলে (দেখুন .github/workflows/scrape.yml)

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");

const SITE_URL = "https://bdgovt.info/";
const SENT_FILE = path.join(__dirname, "sent.json");

const LABELS = ["মোট পদ", "যোগ্যতা", "বয়সসীমা", "বেতন", "শেষ আবেদন"];

// ---------- ইউটিলিটি ----------

function loadSentUrls() {
  try {
    const raw = fs.readFileSync(SENT_FILE, "utf-8");
    return new Set(JSON.parse(raw));
  } catch (e) {
    return new Set();
  }
}

function saveSentUrls(set) {
  // সব পুরনো ডাটা বেড়ে না যাওয়ার জন্য সর্বশেষ ৫০০টা রাখি
  const arr = Array.from(set).slice(-500);
  fs.writeFileSync(SENT_FILE, JSON.stringify(arr, null, 2), "utf-8");
}

function normalizeText(t) {
  return t.replace(/\s+/g, " ").trim();
}

// text এর মধ্যে labelName এর পরের মান বের করে, পরবর্তী লেবেলের আগ পর্যন্ত
function extractField(text, label, allLabels) {
  const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const others = allLabels.filter((l) => l !== label).map(escape);
  const re = new RegExp(
    escape(label) + "\\s*:?\\s*([\\s\\S]*?)(?:" + others.join("|") + "|$)",
    "u"
  );
  const m = text.match(re);
  return m ? normalizeText(m[1]).replace(/:$/, "").trim() : "তথ্য নেই";
}

function extractPublishedDate(text) {
  // "July 25, 2026" প্যাটার্ন খোঁজে
  const m = text.match(/[A-Z][a-z]+ \d{1,2},\s*\d{4}/);
  return m ? m[0] : "তথ্য নেই";
}

// ---------- স্ক্র্যাপিং ----------

async function fetchJobs() {
  const { data: html } = await axios.get(SITE_URL, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
      "Accept-Language": "bn-BD,bn;q=0.9,en;q=0.8",
    },
    timeout: 20000,
  });

  const $ = cheerio.load(html);
  const jobs = [];

  // WordPress এর সাধারণ post loop <article> ট্যাগে থাকে
  $("article").each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find("h2 a, h1 a").first();
    const title = normalizeText(titleLink.text());
    const url = titleLink.attr("href");

    if (!title || !url) return;
    // "মোট পদ" লেবেল না থাকলে এটা জব-পোস্ট না (হতে পারে অন্য কোনো ব্লক)
    let fullText = normalizeText($el.text());
    if (!fullText.includes("মোট পদ")) return;

    // "বিস্তারিত পড়ুন", "Categories" ইত্যাদি — এগুলোর পর থেকে সব বাদ দেওয়া হচ্ছে,
    // নাহলে শেষ ফিল্ড (শেষ আবেদন) এর সাথে এই জাঙ্ক টেক্সট জুড়ে যায়
    fullText = fullText
      .split(/বিস্তারিত পড়ুন/u)[0]
      .split(/\bCategories\b/u)[0]
      .trim();

    const job = {
      title,
      url,
      published: extractPublishedDate(fullText),
      totalPost: extractField(fullText, "মোট পদ", LABELS),
      qualification: extractField(fullText, "যোগ্যতা", LABELS),
      ageLimit: extractField(fullText, "বয়সসীমা", LABELS),
      salary: extractField(fullText, "বেতন", LABELS), // গ্রেড উল্লেখ থাকলে এখানেই থাকবে
      deadline: extractField(fullText, "শেষ আবেদন", LABELS),
    };
    jobs.push(job);
  });

  return jobs;
}

// ---------- মেসেজ ফরম্যাট ----------

function formatMessage(job) {
  return [
    `📢 *${job.title}*`,
    ``,
    `🗂️ মোট পদ/ক্যাটাগরি: ${job.totalPost}`,
    `🎓 শিক্ষাগত যোগ্যতা: ${job.qualification}`,
    `🎂 বয়সসীমা: ${job.ageLimit}`,
    `💰 বেতন গ্রেড: ${job.salary}`,
    `📅 বিজ্ঞপ্তি প্রকাশ: ${job.published}`,
    `⏰ আবেদনের শেষ তারিখ: ${job.deadline}`,
    ``,
    `বিস্তারিত জানতে ও অনলাইনে আবেদন করতে যোগাযোগ করুন:`,
    ``,
    `এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস`,
    `বাংলাবাজার রোড, বরিশাল।`,
    `📱 01533199800`,
  ].join("\n");
}

// ---------- Telegram ----------

async function sendTelegram(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("Telegram env var নেই, Telegram স্কিপ করা হলো");
    return;
  }
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    });
    console.log("Telegram এ পাঠানো হলো ✅");
  } catch (e) {
    console.error("Telegram পাঠাতে সমস্যা:", e.response?.data || e.message);
  }
}

// ---------- WhatsApp (CallMeBot ফ্রি API) ----------

async function sendWhatsApp(text) {
  const phone = process.env.CALLMEBOT_PHONE; // যেমন: 8801XXXXXXXXX
  const apikey = process.env.CALLMEBOT_APIKEY;
  if (!phone || !apikey) {
    console.log("WhatsApp env var নেই, WhatsApp স্কিপ করা হলো");
    return;
  }
  // CallMeBot এ মার্কডাউন সাইন (* _) সাপোর্ট করে না বললেই চলে, প্লেইন টেক্সট রাখা ভালো
  const plain = text.replace(/\*/g, "");
  const url = `https://api.callmebot.com/whatsapp.php?phone=${encodeURIComponent(
    phone
  )}&text=${encodeURIComponent(plain)}&apikey=${encodeURIComponent(apikey)}`;
  try {
    await axios.get(url, { timeout: 20000 });
    console.log("WhatsApp এ পাঠানো হলো ✅");
  } catch (e) {
    console.error("WhatsApp পাঠাতে সমস্যা:", e.response?.data || e.message);
  }
}

// ---------- মেইন ----------

async function main() {
  console.log("bdgovt.info স্ক্র্যাপ শুরু...", new Date().toISOString());

  const jobs = await fetchJobs();
  console.log(`মোট ${jobs.length}টি পোস্ট পাওয়া গেছে`);

  const sent = loadSentUrls();
  const newJobs = jobs.filter((j) => !sent.has(j.url));

  if (newJobs.length === 0) {
    console.log("নতুন কোনো বিজ্ঞপ্তি নেই, কিছু পাঠানো হচ্ছে না।");
    return;
  }

  console.log(`${newJobs.length}টি নতুন বিজ্ঞপ্তি পাঠানো হচ্ছে...`);

  for (const job of newJobs) {
    const message = formatMessage(job);
    await sendTelegram(message);
    await sendWhatsApp(message);
    sent.add(job.url);
    // দুই মেসেজের মাঝে সামান্য বিরতি (rate-limit এড়াতে)
    await new Promise((r) => setTimeout(r, 1500));
  }

  saveSentUrls(sent);
  console.log("সম্পন্ন ✅");
}

main().catch((err) => {
  console.error("স্ক্রিপ্ট ফেইল করেছে:", err);
  process.exit(1);
});
