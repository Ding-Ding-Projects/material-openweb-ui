// Three language modes (English / Cantonese / Bilingual) and a funny-level
// slider per language, 1 = fully serious through 5 = maximum playfulness.
//
// The rule the whole file obeys: the funny level styles the VOICE, never the
// FACTS. A version number, a file size, a keyboard shortcut, a folder path and
// "no installer exists yet" read identically at level 1 and level 5. What
// changes is the wrapping around them.
//
// A value may be a plain string (one honest phrasing at every level — labels
// and pure facts are like this) or an array of exactly five, indexed by level.

import * as store from './store.js';

export const LANGUAGES = ['English', '粵語', 'Bilingual'];

const S = {
  // ---- chrome ----
  'nav.home':      { en: 'Home', zh: '主頁' },
  'nav.features':  { en: 'Features', zh: '功能' },
  'nav.docs':      { en: 'Docs', zh: '說明' },
  'nav.changelog': { en: 'Changelog', zh: '更新紀錄' },
  'nav.settings':  { en: 'Settings', zh: '設定' },
  'nav.download': { en: 'Download', zh: '下載' },
  'nav.status':    { en: 'Status', zh: '狀態' },
  'nav.history':   { en: 'History', zh: '歷史' },
  'nav.tickets':   { en: 'Support Tickets', zh: '客戶支援' },

  'search.site':   { en: 'Search every page and setting…', zh: '搵得晒每一頁同每個設定…' },
  'search.regex':  { en: 'Open the regex builder for this field', zh: '開呢個欄位嘅 regex 產生器' },
  'action.close':  { en: 'Close', zh: '閂' },
  'action.cancel': { en: 'Cancel', zh: '取消' },
  'action.apply':  { en: 'Apply', zh: '套用' },
  'action.reset':  { en: 'Reset', zh: '重設' },
  'action.copy':   { en: 'Copy', zh: '複製' },
  'action.export': { en: 'Export', zh: '匯出' },
  'action.delete': { en: 'Delete', zh: '刪除' },
  'theme.toggle':  { en: 'Switch theme', zh: '轉主題' },

  // ---- home ----
  'home.eyebrow': { en: 'Open WebUI, rebuilt in Material 3', zh: 'Open WebUI，用 Material 3 重新做過' },
  'home.h1': {
    en: 'Every model you run, wrapped in Material 3.',
    zh: '你行緊嘅每個模型，包上 Material 3。'
  },
  'home.sub': {
    en: [
      'A frameless Windows desktop application for Open WebUI. Chats, models, files and one-time codes are stored on the local machine. No server process to start, no account, and no paid tier.',
      'A frameless Windows desktop app for Open WebUI. Your chats, models, files and one-time codes stay on the machine you are using. Nothing to start, no account to make, and nothing to buy.',
      'A frameless Windows desktop app for Open WebUI. Your chats, your models, your files and your one-time codes stay on the machine you are sitting at — no server to start, no account to make, and nothing in it is ever for sale.',
      'A frameless Windows desktop app for Open WebUI. Everything you type stays on the machine you typed it on. No server to start, no account to invent, and nothing in here has ever had a price tag.',
      'A frameless Windows desktop app for Open WebUI. Your chats never leave the room, let alone the building. Nothing to start, nobody to sign up as, and not one pixel of it is for sale — we checked twice.'
    ],
    zh: [
      '一個無邊框嘅 Windows 桌面程式，執行 Open WebUI。對話、模型、檔案同一次性驗證碼儲存喺本機。毋須啟動伺服器程序，毋須帳戶，亦無付費等級。',
      '一個冇邊框嘅 Windows 桌面程式，行 Open WebUI。你嘅對話、模型、檔案同驗證碼留喺你用緊嗰部機。冇嘢要開，唔使開戶口，亦冇嘢要買。',
      '一個冇邊框嘅 Windows 桌面程式，行 Open WebUI。你嘅對話、模型、檔案同驗證碼，全部留喺你面前呢部機 — 唔使開伺服器，唔使開戶口，入面亦冇一樣嘢係賣錢嘅。',
      '一個冇邊框嘅 Windows 桌面程式，行 Open WebUI。你打咗嘅嘢，就留喺你打嗰部機度。冇嘢要開，唔使諗個帳戶名，入面亦從來冇一樣嘢標過價。',
      '一個冇邊框嘅 Windows 桌面程式，行 Open WebUI。你嘅對話連個房都出唔到，唔好講成棟樓。冇嘢要開、唔使扮個戶口出嚟、一粒 pixel 都唔賣 — 我哋數過兩次。'
    ]
  },
  'home.cta.docs': { en: 'Read the docs', zh: '睇說明' },
  'home.cta.src':  { en: 'View the source', zh: '睇原始碼' },

  'home.norelease.title': { en: 'No installer has been published yet.', zh: '暫時未有安裝檔。' },
  'home.norelease.body': {
    en: [
      'The download control is disabled until an installer is built and verified against a published release. Releases are permanently unsigned; the operating system warning is expected and accurate.',
      'The download button turns on once the first installer is built and verified against its release. Installers here are permanently unsigned, so Windows will warn you — accurately.',
      'This button turns on when the first installer is built and verified against its release. Until then it stays off rather than pointing at a guessed address. Installers here are permanently unsigned — Windows will warn you, and that warning is telling the truth.',
      'The button is off because there is nothing behind it yet, and a button that lies about that is worse than no button. Installers here are permanently unsigned, so Windows will pull a face at you. It is right to.',
      'That button is off because pointing it at a file that does not exist would be a small act of fiction, and we are trying to keep those to a minimum. Also: permanently unsigned, so Windows will act like you brought a stranger home. Fair enough, honestly.'
    ],
    zh: [
      '下載控制項會停用，直至安裝檔建置完成並對應已發佈嘅版本驗證通過。所有安裝檔永久不簽署；作業系統嘅警告屬預期並且準確。',
      '第一個安裝檔 build 好、對得住個 release，粒掣先會著。呢度啲安裝檔永遠唔簽名，所以 Windows 會警告你 — 佢講得啱。',
      '第一個安裝檔 build 好、對得住個 release，粒掣先會著。喺嗰之前佢寧願唔著，都唔會指去一個靠估嘅地址。呢度啲安裝檔永遠唔簽名 — Windows 會彈警告，個警告係講真嘢。',
      '粒掣唔著，係因為後面根本未有嘢；一粒講大話嘅掣，仲衰過冇粒掣。安裝檔永遠唔簽名，所以 Windows 會黑面畀你睇。佢黑得啱。',
      '粒掣唔著，係因為指去一個唔存在嘅檔案就變咗作故仔，而我哋盡量少作。另外：永遠唔簽名，所以 Windows 會當你帶咗個陌生人返屋企。講真，都合理嘅。'
    ]
  },
  'home.download.off': { en: 'Download for Windows — unavailable until the first release', zh: '下載 Windows 版 — 未有第一個 release 之前用唔到' },

  'home.capture.title': { en: 'Capture pending the first build', zh: '等第一次 build 完先影' },
  'home.capture.body': {
    en: 'This fills with a real screenshot of the built application, taken through the project harness at a known commit. A mockup will never sit here pretending to be one.',
    zh: '呢度會放一張真嘅程式截圖，用專案自己嘅工具、喺一個記錄咗嘅 commit 影。唔會擺一張設計圖喺度扮真。'
  },

  'home.dest.title': { en: 'Nine destinations, one tab strip', zh: '九個目的地，一條分頁列' },
  'home.dest.body': {
    en: 'Every surface is a tab you open, pin, group, rename and close — not a page you scroll to find. The command palette reaches all of them, and lands on the exact control rather than somewhere near it.',
    zh: '每個畫面都係一個分頁：開得、釘得、分得組、改得名、閂得。指令面板去得晒所有地方，而且係直接落到嗰粒控制項度，唔係落到「附近」。'
  },
  'home.why.title': { en: 'What is actually different', zh: '究竟有咩唔同' },

  'foot.built': { en: 'Built on Open WebUI', zh: '建基於 Open WebUI' },
  'foot.builtBody': {
    en: 'A fork of the Open WebUI project, which does the hard work underneath. Its name and its licence stay; this project changes the interface, not the credit.',
    zh: 'Open WebUI 嘅 fork，底層辛苦嘅嘢係佢做。個名同授權條款照留；呢個專案改嘅係介面，唔係功勞。'
  },
  'foot.free': { en: 'Free, always — nothing here is for sale', zh: '永遠免費 — 呢度冇嘢賣' },
  'foot.legal': {
    en: 'A Ding Ding Projects application. Site preferences are stored in this browser only; nothing is sent anywhere, and there is no analytics on this page.',
    zh: 'Ding Ding Projects 出品。網站設定淨係存喺你部瀏覽器度，冇嘢會傳去邊，呢一頁亦都冇任何分析工具。'
  },

  // ---- settings ----
  'set.title': { en: 'Settings', zh: '設定' },
  'set.intro': {
    en: [
      'Every control on this page applies to this site in this browser. Values are stored locally and can be reset individually or together.',
      'Everything here changes this site in this browser. Values are stored locally, and anything can be put back.',
      'Everything on this page changes this site, in this browser, for you. Nothing is sent anywhere, and every value can go back to how it shipped.',
      'Everything here is yours to move. It only affects this site in this browser, nothing leaves, and every knob has a way back to how it shipped.',
      'Twist whatever you like. It only touches this site in this browser, absolutely nothing phones home, and every single control remembers its way back to the factory.'
    ],
    zh: [
      '本頁所有控制項僅適用於此瀏覽器中的本網站。數值儲存於本機，可個別或整體重設。',
      '呢度所有嘢都淨係改呢個瀏覽器入面呢個網站。數值存喺本機，任何一樣都放得返轉頭。',
      '呢一頁上面每樣嘢都係改緊呢個網站、喺你呢個瀏覽器、為你而改。冇嘢會傳出去，每個值都可以變返出廠嗰陣個樣。',
      '想扭邊個就扭邊個。淨係影響呢個瀏覽器入面呢個網站，絕對冇嘢會通水出去，每粒掣都記得返廠嘅路。',
      '想點扭就點扭，扭爛都得。淨係郁到呢個瀏覽器入面呢個網站，一啲嘢都唔會通水，而且每一粒掣都記得返廠條路點行。'
    ]
  },
  'set.provUser': { en: 'set by you', zh: '你設定嘅' },
  'set.provDefault': { en: 'shipped default: ', zh: '出廠預設：' },
  'set.language': { en: 'Language mode', zh: '語言模式' },
  'set.languageWhy': {
    en: 'Chooses which language this site renders in. Bilingual keeps English as the prominent primary and places the Cantonese underneath as a compact secondary, so neither reads as a caption of the other.',
    zh: '揀呢個網站用邊種語言。雙語模式會將英文放喺主位，粵語用細啲嘅字擺喺下面做次要，噉樣兩邊都唔會變成對方嘅註腳。'
  },
  'set.funnyEn': { en: 'Funny level — English', zh: '搞笑程度 — 英文' },
  'set.funnyZh': { en: 'Funny level — Cantonese', zh: '搞笑程度 — 粵語' },
  'set.funnyWhy': {
    en: 'Styles every message on this site, including warnings and errors. It changes the voice only: what happened, what will be affected, and what your options are stay exact at every level.',
    zh: '會影響呢個網站上面每一句說話，包括警告同錯誤。佢淨係改語氣：發生咗乜嘢、會影響邊啲嘢、你有咩選擇，喺每一級都一模一樣。'
  },
  'set.theme': { en: 'Theme', zh: '主題' },
  'set.themeWhy': {
    en: 'Light, dark, or whatever this device currently prefers. The site defines a complete palette for both, so neither is a washed-out version of the other.',
    zh: '淺色、深色，或者跟住部機而家想要嘅。兩種主題都有完整嘅顏色定義，所以唔會有一邊係另一邊嘅褪色版。'
  },
  'set.emoji': { en: 'Show emoji in dialogs', zh: '對話框顯示 emoji' },
  'set.emojiWhy': {
    en: 'Adds one relevant decoration to dialog and message-box titles. Emoji never appear in buttons, action labels, field labels or accessible names, because a control has to be readable by its words alone.',
    zh: '喺對話框同訊息框嘅標題加一個相關嘅裝飾。Emoji 唔會出現喺按鈕、動作標籤、欄位標籤或者無障礙名稱度，因為一個控制項淨係靠文字都要睇得明。'
  },
  'set.scale': { en: 'Text size', zh: '字級' },
  'set.density': { en: 'Density', zh: '密度' },
  'set.radius': { en: 'Corner radius', zh: '圓角' },
  'set.appName': { en: 'What this site calls itself', zh: '呢個網站點稱呼自己' },
  'set.appNameWhy': {
    en: 'Changes the displayed name only. The repository, the package identity and the storage keys do not move, because a name is a label and identity is a constant — a rename that moved the data would orphan everything stored under the old one.',
    zh: '淨係改顯示嘅名。程式碼庫、套件識別同儲存鍵值都唔會郁，因為個名係標籤，身分係常數 — 一改名就搬走啲資料嘅話，之前存低嘅嘢全部會變孤兒。'
  },
  'set.school': { en: 'School mode', zh: '學校模式' },
  'set.schoolWhy': {
    en: 'While on, the playful surfaces are omitted rather than merely disabled, and the site presents in English. Turning it off needs the PIN set when it was turned on. This is a user-experience lock and not a security boundary: clearing this site\'s storage removes it, and saying so is part of the feature.',
    zh: '開咗之後，啲玩味嘅嘢會直接唔出現，唔係淨係停用，個網站亦會用英文顯示。想熄返，就要開嗰陣設嗰個 PIN。呢個係體驗上嘅鎖，唔係保安界線：清咗呢個網站嘅儲存就冇咗，而照直講呢件事本身就係功能嘅一部分。'
  },
  'set.vocab': { en: 'Personal vocabulary', zh: '個人詞彙' },
  'set.vocabWhy': {
    en: 'A local JSON file of word replacements applied to this site\'s own copy. It is validated in full before anything is shown or cached, it never reaches the network, and it is excluded from every export.',
    zh: '一個本機 JSON 檔，入面係字詞替換，會套用喺呢個網站自己嘅文字上。喺顯示或者快取之前會完整驗證，永遠唔會出網絡，亦唔會出現喺任何匯出檔入面。'
  },
  'set.reset': { en: 'Reset this site', zh: '重設呢個網站' },
  'set.resetWhy': {
    en: 'Clears every preference, lock, authenticator entry, ticket and history record this site has stored in this browser. This is also the documented recovery route if you lock yourself out.',
    zh: '清走呢個網站喺呢個瀏覽器度存低嘅所有設定、鎖、驗證器項目、支援單同歷史紀錄。如果你鎖死咗自己，呢個亦都係文件寫明嘅救返自己嘅方法。'
  },

  // ---- shared state copy ----
  'empty.noMatch': { en: 'No matches.', zh: '搵唔到。' },
  'empty.noMatchHint': {
    en: 'Nothing on this surface matches what you typed. Clear the field, or switch the pattern mode with the button beside it.',
    zh: '呢個畫面度冇嘢夾到你打嗰啲。清空個欄位，或者用隔籬粒掣轉去 pattern 模式。'
  },
  'rx.title': { en: 'Regex builder', zh: 'Regex 產生器' },
  'rx.pattern': { en: 'Pattern', zh: 'Pattern' },
  'rx.sample': { en: 'Sample text', zh: '樣本文字' },
  'rx.flagI': { en: 'i — ignore case', zh: 'i — 唔理大細階' },
  'rx.flagM': { en: 'm — multiline', zh: 'm — 多行' },
  'rx.use': { en: 'Use this pattern', zh: '用呢個 pattern' },
  'rx.plain': { en: 'Back to plain text', zh: '轉返純文字' },
  'rx.engine': { en: 'Engine: JavaScript RegExp, evaluated in this browser. Patterns and sample text are never sent anywhere.', zh: '引擎：JavaScript RegExp，喺你部瀏覽器度計。Pattern 同樣本文字唔會傳去任何地方。' },

  'palette.placeholder': { en: 'Search every page, setting and action…', zh: '搵每一頁、每個設定、每個動作…' },
  'palette.hint': { en: 'Ctrl+Shift+F', zh: 'Ctrl+Shift+F' },

  'lock.locked': { en: 'Locked', zh: '已鎖' },
  'lock.toy': {
    en: 'This is a lock you set for yourself. It is not encryption and it does not protect anything from anyone else who has this machine — clearing this site\'s storage removes it.',
    zh: '呢個係你自己畀自己上嘅鎖。佢唔係加密，亦保護唔到任何嘢，唔會擋到其他攞到呢部機嘅人 — 清咗呢個網站嘅儲存就冇咗。'
  },

  'confirm.type': { en: 'Type DELETE to arm the first key', zh: '打 DELETE 解鎖第一條匙' },
  'confirm.hold': { en: 'Hold the second key', zh: '撳住第二條匙' },
  'confirm.slide': { en: 'Slide all the way to confirm', zh: '推到盡先確認' },
  'confirm.exit': { en: 'Emergency exit', zh: '緊急離開' }
};

function mode() {
  const s = store.get('settings');
  if (s.school && s.school.on) return 'English';
  return s.language || 'English';
}

function level(lang) {
  const s = store.get('settings');
  const raw = lang === 'zh' ? s.funnyZh : s.funnyEn;
  const n = Number(raw);
  return Math.min(5, Math.max(1, Number.isFinite(n) ? n : 3));
}

function pick(value, lang) {
  if (Array.isArray(value)) return value[level(lang) - 1] ?? value[2];
  return value;
}

/** The primary string for the current mode. */
export function t(key) {
  const entry = S[key];
  if (!entry) return key;
  const m = mode();
  if (m === '粵語') return applyVocab(pick(entry.zh, 'zh'));
  return applyVocab(pick(entry.en, 'en'));
}

/** The compact secondary string, or '' when the mode has no secondary. */
export function t2(key) {
  const entry = S[key];
  if (!entry) return '';
  if (mode() !== 'Bilingual') return '';
  return applyVocab(pick(entry.zh, 'zh'));
}

export function isBilingual() {
  return mode() === 'Bilingual';
}

export function isCantonese() {
  return mode() === '粵語';
}

export function currentLevels() {
  return { en: level('en'), zh: level('zh') };
}

export function has(key) {
  return key in S;
}

export function keys() {
  return Object.keys(S);
}

// ---- personal vocabulary ----
//
// Replacements are applied at the user-facing text boundary only. Commands,
// URLs, identifiers, code and file paths are never rewritten, which is why this
// runs on rendered copy rather than on the string table.

function applyVocab(text) {
  const v = store.get('settings').vocab;
  if (!v || !Array.isArray(v.terms) || typeof text !== 'string') return text;
  let out = text;
  for (const term of v.terms) {
    const from = term.alias ?? term.term;
    const to = term.replacement ?? term.value;
    if (typeof from !== 'string' || typeof to !== 'string' || !from) continue;
    out = out.split(from).join(to);
  }
  return out;
}

export const FUNNY_DISCLOSURE = {
  en: 'The funny level styles every message on this site, warnings and errors included. It changes how something is said, never what is said: the facts stay exact at every level.',
  zh: '搞笑程度會影響呢個網站上面每一句說話，警告同錯誤都計。佢改嘅係點講，唔係講乜：事實喺每一級都一模一樣。'
};
