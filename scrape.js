// bdgovt.info থেকে নতুন চাকরির বিজ্ঞপ্তি স্ক্র্যাপ করে Gemini API দিয়ে ছবি বানিয়ে Telegram এ পাঠায়
// প্রতি ৪ ঘন্টায় একবার GitHub Actions cron দিয়ে চলে

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const { GoogleGenAI } = require("@google/genai");

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
  const m = text.match(/[A-Z][a-z]+ \d{1,2},\s*\d{4}/);
  return m ? m[0] : "তথ্য নেই";
}

// ---------- ইংরেজি থেকে বাংলায় কনভার্ট করার ইউটিলিটি ----------

function convertToBanglaDigitsAndMonths(text) {
  if (!text) return text;

  const digits = {
    '0': '০', '1': '১', '2': '২', '3': '৩', '4': '৪',
    '5': '৫', '6': '৬', '7': '৭', '8': '৮', '9': '৯'
  };

  const months = {
    'January': 'জানুয়ারি', 'February': 'ফেব্রুয়ারি', 'March': 'মার্চ',
    'April': 'এপ্রিল', 'May': 'মে', 'June': 'জুন',
    'July': 'জুলাই', 'August': 'আগস্ট', 'September': 'সেপ্টেম্বর',
    'October': 'অক্টোবর', 'November': 'নভেম্বর', 'December': 'ডিসেম্বর'
  };

  let str = text;
  
  // মাস রূপান্তর
  Object.keys(months).forEach(enMonth => {
    const reg = new RegExp(enMonth, 'gi');
    str = str.replace(reg, months[enMonth]);
  });

  // সংখ্যা রূপান্তর
  str = str.replace(/[0-9]/g, w => digits[w]);

  return str;
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

  $("article").each((_, el) => {
    const $el = $(el);
    const titleLink = $el.find("h2 a, h1 a").first();
    const title = normalizeText(titleLink.text());
    const url = titleLink.attr("href");

    if (!title || !url) return;
    let fullText = normalizeText($el.text());
    if (!fullText.includes("মোট পদ")) return;

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
      salary: extractField(fullText, "বেতন", LABELS),
      deadline: extractField(fullText, "শেষ আবেদন", LABELS),
    };
    jobs.push(job);
  });

  return jobs;
}

// ---------- Gemini API দিয়ে ছবি তৈরি ----------

async function generateJobImage(job) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("GEMINI_API_KEY পাওয়া যায়নি!");
    return null;
  }

  const ai = new GoogleGenAI({ apiKey });

  // ডাটা বাংলায় প্রস্তুত করা
  const titleBn = convertToBanglaDigitsAndMonths(job.title);
  const totalPostBn = convertToBanglaDigitsAndMonths(job.totalPost);
  const qualificationBn = convertToBanglaDigitsAndMonths(job.qualification);
  const ageLimitBn = convertToBanglaDigitsAndMonths(job.ageLimit);
  const salaryBn = convertToBanglaDigitsAndMonths(job.salary);
  const publishedBn = convertToBanglaDigitsAndMonths(job.published);
  const deadlineBn = convertToBanglaDigitsAndMonths(job.deadline);

  const prompt = `Create a clean, modern, professional square (1:1) Bengali job circular poster for Facebook and social media.

Style Requirements:
- Minimalist design.
- Use ONLY 2–3 colors (for example: dark green + white + black, or navy blue + white + dark gray).
- White or very light background.
- No gradients, no fancy effects, no decorative elements.
- No logos, no stock photos, no illustrations.
- High contrast and easy to read.
- Clean typography with proper Bengali Unicode fonts.
- Keep generous spacing and alignment.
- Suitable for social media promotion by a computer & online service center.

Layout:

1. Large bold title at the top
Use only the Bengali organization name followed by:
"নিয়োগ বিজ্ঞপ্তি"
Example:
"${titleBn} নিয়োগ বিজ্ঞপ্তি"

Do NOT write:
"নিয়োগ বিজ্ঞপ্তি" separately above the title.
Do NOT include any logo.

2. A thin horizontal divider.

3. Information section with simple monochrome icons on the left.

Each line should contain:

🗂️ মোট পদ/ক্যাটাগরি: ${totalPostBn}
🎓 শিক্ষাগত যোগ্যতা: ${qualificationBn}
🎂 বয়সসীমা: ${ageLimitBn}
💰 বেতন গ্রেড: ${salaryBn}
📅 বিজ্ঞপ্তি প্রকাশ: ${publishedBn}
⏰ আবেদনের শেষ তারিখ: ${deadlineBn}

Icons should be simple, flat, and consistent.

4. Bottom Contact Section

A bordered box with a slightly darker background.

Top line inside the box:

"যেকোন চাকুরির অনলাইনে আবেদন করতে যোগাযোগ করুন"

Below that display prominently:

এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস

Then:

📍 বাংলাবাজার রোড, বরিশাল।

Then a large, highly visible phone number:

📞 01533199800

The phone number must be one of the most noticeable elements in the poster with WhatsApp, telegram and call logo.

Typography Rules:
- Process slowly copy the Bengali Text exactly as it is from prompt
- All body text must be in Bengali.
- Convert all English dates and numbers into Bengali.
- Use Bengali numerals (০১২৩৪৫৬৭৮৯).
- Never leave English month names like July or August.
- Keep punctuation clean.
- Maintain perfect spelling and formatting.
- Make the title significantly larger than the rest.
- Ensure every line is aligned and evenly spaced.

Output Requirements:
- Square aspect ratio (1:1).
- High resolution (minimum 2000×2000 pixels).
- Print-ready quality.
- Crisp text with no spelling mistakes.
- Do not omit or invent any information.
- Follow the supplied information exactly.`;

  try {
    console.log("Gemini/Imagen দিয়ে ছবি জেনারেট করা হচ্ছে...");
    const response = await ai.models.generateImages({
      model: "imagen-3.0-generate-002",
      prompt: prompt,
      config: {
        numberOfImages: 1,
        outputMimeType: "image/jpeg",
        aspectRatio: "1:1",
      },
    });

    if (response.generatedImages && response.generatedImages.length > 0) {
      const base64ImageBytes = response.generatedImages[0].image.imageBytes;
      const buffer = Buffer.from(base64ImageBytes, "base64");
      const imagePath = path.join(__dirname, "temp_job_banner.jpg");
      fs.writeFileSync(imagePath, buffer);
      console.log("ছবি সফলভাবে জেনারেট ও সেভ হয়েছে ✅");
      return imagePath;
    } else {
      console.error("Gemini থেকে কোনো ছবি পাওয়া যায়নি।");
      return null;
    }
  } catch (error) {
    console.error("Gemini Image Generation এ সমস্যা:", error.message || error);
    return null;
  }
}

// ---------- টেলিগ্রাম ক্যাপশন ফরম্যাট ----------

function formatCaption(job) {
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
    `🔗 মূল লিংক: ${job.url}`,
    ``,
    `বিস্তারিত জানতে ও অনলাইনে আবেদন করতে যোগাযোগ করুন:`,
    `🏢 *এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস*`,
    `📍 বাংলাবাজার রোড, বরিশাল।`,
    `📱 01533199800`,
  ].join("\n");
}

// ---------- Telegram (sendPhoto API) ----------

async function sendTelegramPhoto(imagePath, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) {
    console.log("Telegram env var নেই, স্কিপ করা হলো");
    return;
  }

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", fs.createReadStream(imagePath));
    formData.append("caption", caption);
    formData.append("parse_mode", "Markdown");

    await axios.post(url, formData, {
      headers: formData.getHeaders(),
    });
    console.log("Telegram এ ছবিসহ বার্তা পাঠানো হলো ✅");
  } catch (e) {
    console.error("Telegram এ ছবি পাঠাতে সমস্যা:", e.response?.data || e.message);
  }
}

// ---------- মেইন লুপ ----------

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

  console.log(`${newJobs.length}টি নতুন বিজ্ঞপ্তি পাওয়া গেছে, প্রসেস করা হচ্ছে...`);

  for (const job of newJobs) {
    const caption = formatCaption(job);
    const imagePath = await generateJobImage(job);

    if (imagePath && fs.existsSync(imagePath)) {
      await sendTelegramPhoto(imagePath, caption);
      try {
        fs.unlinkSync(imagePath);
      } catch (err) {}
    } else {
      console.log("ছবি জেনারেট না হওয়ায় বার্তা স্কিপ করা হলো।");
    }

    sent.add(job.url);
    await new Promise((r) => setTimeout(r, 3000));
  }

  saveSentUrls(sent);
  console.log("সম্পন্ন ✅");
}

main().catch((err) => {
  console.error("স্ক্রিপ্ট ফেইল করেছে:", err);
  process.exit(1);
});
