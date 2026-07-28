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

// কালার থিম কালেকশন (ভ্যারিয়েশনের জন্য)
const COLOR_THEMES = [
  {
    primary: "#0a3c22",      // Deep Forest Green
    accent: "#125a33"
  },
  {
    primary: "#0f2b48",      // Deep Navy Blue
    accent: "#1e3a8a"
  },
  {
    primary: "#4c1d95",      // Deep Purple / Violet
    accent: "#6d28d9"
  }
];

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

// ---------- পারফেক্ট লেআউটের এইচডি ব্যানার ইমেজ তৈরি ----------

async function generateJobImage(job) {
  const outputPath = path.join(__dirname, "temp_job_banner.jpg");

  const titleBn = convertToBanglaDigitsAndMonths(job.title);
  const totalPostBn = convertToBanglaDigitsAndMonths(job.totalPost);
  const qualificationBn = convertToBanglaDigitsAndMonths(job.qualification);
  const ageLimitBn = convertToBanglaDigitsAndMonths(job.ageLimit);
  const salaryBn = convertToBanglaDigitsAndMonths(job.salary);
  const publishedBn = convertToBanglaDigitsAndMonths(job.published);
  const deadlineBn = convertToBanglaDigitsAndMonths(job.deadline);

  // র্যান্ডম থিম বাছাই
  const theme = COLOR_THEMES[Math.floor(Math.random() * COLOR_THEMES.length)];

  const htmlContent = `
  <!DOCTYPE html>
  <html lang="bn">
  <head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Anek+Bangla:wght@600;700;800;900&family=Hind+Siliguri:wght@600;700;800&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css">
    <style>
      * {
        box-sizing: border-box;
      }
      body {
        width: 800px;
        height: 800px;
        margin: 0;
        padding: 0;
        font-family: 'Anek Bangla', 'Hind Siliguri', sans-serif;
        background: #f8fafc;
        display: flex;
        flex-direction: column;
        overflow: hidden;
      }
      
      /* হেডার সেকশন */
      .header-box {
        background-color: ${theme.primary};
        color: #ffffff;
        text-align: center;
        padding: 16px 20px;
        min-height: 100px;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .header-title {
        font-size: 32px;
        font-weight: 800;
        margin: 0;
        line-height: 1.25;
      }

      /* বডি কনটেন্ট */
      .content-body {
        padding: 15px 35px;
        flex: 1;
        display: flex;
        flex-direction: column;
        justify-content: center;
      }

      .info-list {
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .info-item {
        display: flex;
        align-items: flex-start;
        font-size: 21px;
        color: #0f172a;
        font-weight: 700;
        line-height: 1.3;
      }

      .info-icon {
        font-size: 24px;
        width: 36px;
        text-align: center;
        margin-right: 8px;
        flex-shrink: 0;
      }

      .info-label {
        color: #0f172a;
        margin-right: 6px;
        white-space: nowrap;
        flex-shrink: 0;
      }

      .info-val {
        color: #0f172a;
        font-weight: 800;
        word-break: break-word;
      }

      /* নিখুঁত ও কাটিং-প্রুফ ফুটার সেকশন */
      .footer-container {
        padding: 0 25px 20px 25px;
        margin-top: auto;
      }

      .footer-card {
        border: 2px solid ${theme.primary};
        border-radius: 12px;
        overflow: hidden;
        background: #ffffff;
      }

      .footer-top-banner {
        background-color: #ffffff;
        color: ${theme.primary};
        font-size: 20px;
        font-weight: 800;
        padding: 6px 10px;
        text-align: center;
        border-bottom: 2px solid ${theme.primary};
      }

      .footer-main-body {
        background-color: ${theme.primary};
        color: #ffffff;
        padding: 12px 15px 14px 15px;
        text-align: center;
      }

      .brand-title {
        font-size: 31px;
        font-weight: 900;
        margin-bottom: 6px;
        letter-spacing: -0.2px;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .footer-bottom-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0 10px;
      }

      .brand-address {
        display: flex;
        align-items: center;
        gap: 6px;
        font-size: 25px;
        font-weight: 800;
      }

      .phone-section {
        display: flex;
        align-items: center;
        gap: 8px;
        font-size: 30px;
        font-weight: 800;
      }

      .social-icons {
        display: flex;
        gap: 6px;
        font-size: 26px;
      }

      .fa-whatsapp {
        color: #25D366;
      }

      .fa-telegram {
        color: #24A1DE;
      }
    </style>
  </head>
  <body>

    <!-- হেডার -->
    <div class="header-box">
      <div class="header-title">${titleBn}</div>
    </div>

    <!-- তথ্যসমূহ -->
    <div class="content-body">
      <div class="info-list">
        <div class="info-item">
          <span class="info-icon">🗂️</span>
          <span class="info-label">মোট পদ/ক্যাটাগরি:</span>
          <span class="info-val">${totalPostBn}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">🎓</span>
          <span class="info-label">শিক্ষাগত যোগ্যতা:</span>
          <span class="info-val">${qualificationBn}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">🎂</span>
          <span class="info-label">বয়সসীমা:</span>
          <span class="info-val">${ageLimitBn}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">💰</span>
          <span class="info-label">বেতন গ্রেড:</span>
          <span class="info-val">${salaryBn}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">📅</span>
          <span class="info-label">বিজ্ঞপ্তি প্রকাশ:</span>
          <span class="info-val">${publishedBn}</span>
        </div>
        <div class="info-item">
          <span class="info-icon">⏰</span>
          <span class="info-label">আবেদনের শেষ তারিখ:</span>
          <span class="info-val">${deadlineBn}</span>
        </div>
      </div>
    </div>

    <!-- ১ লাইনে বড় নাম ও ফিট হওয়া সলিড ফুটার বক্স -->
    <div class="footer-container">
      <div class="footer-card">
        <div class="footer-top-banner">যেকোন চাকুরির অনলাইনে আবেদন করতে যোগাযোগ করুন</div>
        <div class="footer-main-body">
          <div class="brand-title">এফ. এন. এফ কম্পিউটার & অনলাইন সার্ভিসেস</div>
          <div class="footer-bottom-row">
            <div class="brand-address">📍 বাংলাবাজার রোড, বরিশাল।</div>
            <div class="phone-section">
              <div class="social-icons">
                <i class="fa-brands fa-whatsapp"></i>
                <i class="fa-brands fa-telegram"></i>
              </div>
              <span>01533199800</span>
            </div>
          </div>
        </div>
      </div>
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
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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
