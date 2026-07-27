// bdgovt.info থেকে নতুন চাকরির বিজ্ঞপ্তি স্ক্র্যাপ করে HD ব্যানার ইমেজ তৈরি করে Telegram এ পাঠায়

const axios = require("axios");
const cheerio = require("cheerio");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const nodeHtmlToImage = require("node-html-to-image");

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
  Object.keys(months).forEach(enMonth => {
    const reg = new RegExp(enMonth, 'gi');
    str = str.replace(reg, months[enMonth]);
  });

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

// ---------- সুন্দর এইচডি ব্যানার তৈরি (HTML -> JPG) ----------

async function generateJobImage(job) {
  const outputPath = path.join(__dirname, "temp_job_banner.jpg");

  const titleBn = convertToBanglaDigitsAndMonths(job.title);
  const totalPostBn = convertToBanglaDigitsAndMonths(job.totalPost);
  const qualificationBn = convertToBanglaDigitsAndMonths(job.qualification);
  const ageLimitBn = convertToBanglaDigitsAndMonths(job.ageLimit);
  const salaryBn = convertToBanglaDigitsAndMonths(job.salary);
  const publishedBn = convertToBanglaDigitsAndMonths(job.published);
  const deadlineBn = convertToBanglaDigitsAndMonths(job.deadline);

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="bn">
  <head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Hind+Siliguri:wght@500;600;700&display=swap" rel="stylesheet">
    <style>
      body {
        width: 800px;
        height: 800px;
        margin: 0;
        padding: 40px;
        box-sizing: border-box;
        font-family: 'Hind Siliguri', sans-serif;
        background: #ffffff;
        color: #1a202c;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .header {
        text-align: center;
        border-bottom: 3px solid #0d9488;
        padding-bottom: 20px;
      }
      .title {
        font-size: 32px;
        font-weight: 700;
        color: #0f766e;
        margin: 0;
        line-height: 1.3;
      }
      .subtitle {
        font-size: 20px;
        color: #475569;
        margin-top: 8px;
        font-weight: 600;
      }
      .info-grid {
        margin: 25px 0;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }
      .info-row {
        display: flex;
        align-items: center;
        font-size: 20px;
        background: #f8fafc;
        padding: 10px 18px;
        border-radius: 8px;
        border-left: 5px solid #0d9488;
      }
      .info-label {
        font-weight: 700;
        color: #334155;
        min-width: 190px;
      }
      .info-val {
        color: #0f172a;
        font-weight: 500;
        flex: 1;
      }
      .footer {
        background: #0f766e;
        color: #ffffff;
        padding: 20px;
        border-radius: 12px;
        text-align: center;
      }
      .footer-top {
        font-size: 18px;
        margin-bottom: 6px;
      }
      .brand-name {
        font-size: 26px;
        font-weight: 700;
        color: #fef08a;
      }
      .address {
        font-size: 18px;
        margin-top: 4px;
      }
      .phone {
        font-size: 28px;
        font-weight: 700;
        margin-top: 8px;
        letter-spacing: 1px;
      }
    </style>
  </head>
  <body>
    <div class="header">
      <h1 class="title">${titleBn}</h1>
      <div class="subtitle">নিয়োগ বিজ্ঞপ্তি</div>
    </div>

    <div class="info-grid">
      <div class="info-row"><span class="info-label">🗂️ মোট পদ/ক্যাটাগরি:</span><span class="info-val">${totalPostBn}</span></div>
      <div class="info-row"><span class="info-label">🎓 শিক্ষাগত যোগ্যতা:</span><span class="info-val">${qualificationBn}</span></div>
      <div class="info-row"><span class="info-label">🎂 বয়সসীমা:</span><span class="info-val">${ageLimitBn}</span></div>
      <div class="info-row"><span class="info-label">💰 বেতন গ্রেড:</span><span class="info-val">${salaryBn}</span></div>
      <div class="info-row"><span class="info-label">📅 বিজ্ঞপ্তি প্রকাশ:</span><span class="info-val">${publishedBn}</span></div>
      <div class="info-row"><span class="info-label">⏰ আবেদনের শেষ তারিখ:</span><span class="info-val">${deadlineBn}</span></div>
    </div>

    <div class="footer">
      <div class="footer-top">যেকোন চাকুরির অনলাইনে আবেদন করতে যোগাযোগ করুন</div>
      <div class="brand-name">এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস</div>
      <div class="address">📍 বাংলাবাজার রোড, বরিশাল।</div>
      <div class="phone">📞 01533199800</div>
    </div>
  </body>
  </html>
  `;

  try {
    console.log("এইচডি ব্যানার ইমেজ তৈরি করা হচ্ছে...");
    await nodeHtmlToImage({
      output: outputPath,
      html: htmlContent,
      type: 'jpeg',
      quality: 100,
      puppeteerArgs: {
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      }
    });
    console.log("ব্যানার ফটো সফলভাবে তৈরি হয়েছে ✅");
    return outputPath;
  } catch (error) {
    console.error("ইমেজ তৈরিতে সমস্যা:", error.message || error);
    return null;
  }
}

// ---------- টেলিগ্রাম টেক্সট/ক্যাপশন ফরম্যাট ----------

function formatMessage(job) {
  return [
    `📣 *${job.title}*`,
    ``,
    `🗂️ *মোট পদ/ক্যাটাগরি:* ${job.totalPost}`,
    `🎓 *শিক্ষাগত যোগ্যতা:* ${job.qualification}`,
    `🎂 *বয়সসীমা:* ${job.ageLimit}`,
    `💰 *বেতন গ্রেড:* ${job.salary}`,
    `📅 *বিজ্ঞপ্তি প্রকাশ:* ${job.published}`,
    `⏰ *আবেদনের শেষ তারিখ:* ${job.deadline}`,
    ``,
    ` বিস্তারিত জানতে ও অনলাইনে আবেদন করতে যোগাযোগ করুন:`,
    ``,
    `এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস`,
    `বাংলাবাজার রোড, বরিশাল।`,
    `01533199800`,
  ].join("\n");
}

// ---------- Telegram API ----------

async function sendTelegramPhoto(imagePath, caption) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return false;

  const url = `https://api.telegram.org/bot${token}/sendPhoto`;

  try {
    const formData = new FormData();
    formData.append("chat_id", chatId);
    formData.append("photo", fs.createReadStream(imagePath));
    formData.append("caption", caption);
    formData.append("parse_mode", "Markdown");

    await axios.post(url, formData, { headers: formData.getHeaders() });
    console.log("Telegram এ ছবিসহ বার্তা পাঠানো হলো ✅");
    return true;
  } catch (e) {
    console.error("Telegram এ ছবি পাঠাতে সমস্যা:", e.response?.data || e.message);
    return false;
  }
}

async function sendTelegramMessage(text) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return;

  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  try {
    await axios.post(url, {
      chat_id: chatId,
      text,
      parse_mode: "Markdown",
      disable_web_page_preview: false,
    });
    console.log("Telegram এ টেক্সট বার্তা পাঠানো হলো ✅");
  } catch (e) {
    console.error("Telegram এ টেক্সট পাঠাতে সমস্যা:", e.response?.data || e.message);
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
    const messageText = formatMessage(job);
    const imagePath = await generateJobImage(job);

    let sentSuccessfully = false;

    if (imagePath && fs.existsSync(imagePath)) {
      sentSuccessfully = await sendTelegramPhoto(imagePath, messageText);
      try {
        fs.unlinkSync(imagePath);
      } catch (err) {}
    }

    if (!sentSuccessfully) {
      console.log("টেক্সট ফরম্যাটে নোটিফিকেশন পাঠানো হচ্ছে...");
      await sendTelegramMessage(messageText);
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
