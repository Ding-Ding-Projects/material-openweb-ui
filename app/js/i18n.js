// Three language modes and a funny level per language, for the application.
//
// Same rule as the documentation site: the funny level styles the VOICE and
// never the FACTS. A model name, a byte count, a host address, a keyboard
// shortcut and "the daemon is not answering" read identically at level 1 and
// level 5. What changes is the wrapping.
//
// A value is either one honest phrasing (labels, and anything that is purely a
// fact) or an array of exactly five indexed by level.

import * as state from './state.js';

export const LANGUAGES = ['English', '粵語', 'Bilingual'];

const S = {
	// ---- destinations ----
	'nav.chat': { en: 'Chat', zh: '對話' },
	'nav.ollama': { en: 'Ollama', zh: 'Ollama 管理' },
	'nav.converter': { en: 'File converter', zh: '檔案轉換' },
	'nav.authenticator': { en: 'Authenticator', zh: '驗證器' },
	'nav.workspace': { en: 'Workspace', zh: '工作區' },
	'nav.admin': { en: 'Admin', zh: '管理' },
	'nav.settings': { en: 'Settings', zh: '設定' },
	'nav.status': { en: 'Status', zh: '狀態' },
	'nav.changelog': { en: 'Changelog', zh: '更新紀錄' },

	'rail.local': { en: 'Everything stays on this machine', zh: '所有嘢留喺呢部機' },
	'rail.browser': { en: 'Browser preview — no shell', zh: '瀏覽器預覽 — 冇外殼' },

	// ---- ollama ----
	'ollama.sub': {
		en: [
			'The daemon, installed models, and the published catalogue. Every value is read from the local API or from this machine.',
			'The daemon, what is installed, and the published catalogue. Every figure comes from the local API or from this machine.',
			'The daemon, what is installed, and the published catalogue. Every figure here comes from the local API or from this machine — nothing on this page is a placeholder.',
			'The daemon, your models, and the whole published catalogue. Every number here was asked for rather than made up, which is a lower bar than it sounds and a surprisingly common one to miss.',
			'The daemon, your models, and every model anyone has published. Not one number on this page was invented, guessed, rounded up for effect, or quietly borrowed from a nicer machine.'
		],
		zh: [
			'守護程序、已安裝模型，以及已發佈目錄。所有數值均讀自本機 API 或本機硬件。',
			'守護程序、裝咗啲乜、同已發佈目錄。每個數字都係由本機 API 或者呢部機攞返嚟。',
			'守護程序、裝咗啲乜、同已發佈目錄。呢版每個數字都係嚟自本機 API 或者呢部機 — 冇一樣係擺喺度佔位嘅。',
			'守護程序、你嘅模型、同成個已發佈目錄。呢版每個數字都係問返嚟嘅，唔係作出嚟 — 聽落好低要求，但好多人偏偏做唔到。',
			'守護程序、你嘅模型，同埋全世界有人發佈過嘅模型。呢版冇一個數字係作、係估、係為咗好睇而入位、或者靜靜雞借咗部靚機嘅。'
		]
	},
	'ollama.running': { en: 'Ollama is running', zh: 'Ollama 行緊' },
	'ollama.notAnswering': { en: 'Ollama is not answering', zh: 'Ollama 冇回應' },
	'ollama.installed': { en: 'Installed', zh: '已安裝' },
	'ollama.catalogue': { en: 'Catalogue', zh: '目錄' },
	'ollama.thisMachine': { en: 'This machine', zh: '呢部機' },
	'ollama.noModels': { en: 'No models are installed', zh: '一個模型都未裝' },
	'ollama.noModelsWhy': {
		en: 'The daemon answered and reported an empty list. Pull one from the catalogue below and it will appear here.',
		zh: '守護程序有回應，但話冇嘢。喺下面個目錄拉一個返嚟，佢就會出現喺呢度。'
	},

	// ---- converter ----
	'conv.sub': {
		en: [
			'File type is determined from byte signatures rather than the filename extension. Adapters without bundled dependencies are listed as unavailable with the exact requirement.',
			'Type is read from the bytes, not the name. Adapters that are not bundled stay listed with the dependency they need.',
			'Type is detected from the bytes, not the name. Adapters that are not bundled stay listed with the exact dependency they need, because a catalogue that hides its gaps is not a catalogue.',
			'It reads the bytes, not the name, because the name is whatever somebody last felt like typing. Adapters that cannot run stay on the list with the exact thing they are missing.',
			'It reads the bytes and ignores the name entirely, on the grounds that the name is a rumour. Adapters that cannot run stay right where they are, wearing a label explaining precisely what they are missing, like a very honest vending machine.'
		],
		zh: [
			'檔案類型由位元組簽名判定，並非依副檔名。未內附相依項目嘅轉換器會列為不可用，並註明確切需求。',
			'睇 bytes 認類型，唔係睇個名。冇內附嘅轉換器照列出嚟，寫明佢爭咩。',
			'睇 bytes 認類型，唔係睇個名。冇內附嘅轉換器照樣列出嚟，寫明佢爭咩 — 一個匿埋自己缺口嘅目錄，唔算目錄。',
			'佢睇 bytes，唔理個名，因為個名係人哋最後一刻順手打嘅。行唔到嘅轉換器照留喺張單度，寫明爭緊乜。',
			'佢淨係睇 bytes，個名完全當冇到 — 因為個名只係傳聞。行唔到嘅轉換器照企喺原位，掛住個牌講清楚自己爭乜，好似一部非常老實嘅販賣機。'
		]
	},
	'conv.drop': { en: 'Drop a file here, or choose one', zh: '拌個檔案入嚟，或者揀一個' },
	'conv.adapters': { en: 'Adapters', zh: '轉換器' },
	'conv.results': { en: 'Results', zh: '結果' },

	// ---- authenticator ----
	'auth.sub': {
		en: [
			'One-time codes for arbitrary accounts, computed locally. No account, no synchronisation, and no network request.',
			'One-time codes for whatever accounts you like, computed here. No account, no sync, no network.',
			'One-time codes for whatever accounts you like, computed on this machine. No account, no sync, and no request leaves this window.',
			'One-time codes for whatever you like, worked out right here. Nobody signs up, nothing syncs, and not one packet leaves the building.',
			'Codes for whatever you fancy, done on the spot. No account, no sync, no cloud, no telemetry, and no packet has ever made it past the front door.'
		],
		zh: [
			'為任意帳戶產生一次性驗證碼，於本機計算。毋須帳戶，不作同步，亦無網絡請求。',
			'想加邊個戶口就加，喺呢度計。冇戶口、冇同步、冇網絡。',
			'鍾意加邊個戶口就加，全部喺呢部機計。冇戶口、冇同步，亦冇一個請求離開過呢個視窗。',
			'想加乜就加，即場計掂。冇人要開戶口，冇嘢要同步，亦冇一個封包出過度門。',
			'你鍾意加咩就加，即場搞掂。冇戶口、冇同步、冇雲、冇遙測，亦從來冇一個封包行得出大門口。'
		]
	},
	'auth.add': { en: 'Add entry', zh: '加一個' },
	'auth.none': { en: 'No entries yet', zh: '暫時一個都冇' },

	// ---- settings ----
	'set.title': { en: 'Settings', zh: '設定' },
	'set.sub': {
		en: [
			'These settings apply to this installation on this machine. No value is transmitted.',
			'Everything here applies to this installation on this machine, and nothing is sent anywhere.',
			'Everything here applies to this installation on this machine, and nothing is sent anywhere.',
			'Everything here is yours to move, it only touches this copy on this machine, and none of it goes anywhere at all.',
			'Twist whatever you like. It only affects this copy on this machine, and absolutely none of it phones home — there is nothing to phone home to.'
		],
		zh: [
			'本設定僅適用於此機器上的此安裝。所有數值不會傳送。',
			'呢度所有嘢淨係影響呢部機呢個安裝，冇嘢會傳出去。',
			'呢度所有嘢淨係影響呢部機上面呢個安裝，冇嘢會傳去邊。',
			'想郁邊個就郁邊個，淨係影響呢部機呢一份，一啲都唔會走出去。',
			'想點扭就點扭。淨係影響呢部機呢一份，亦絕對冇嘢會通水返屋企 — 因為根本冇個屋企畀佢通。'
		]
	},
	'set.language': { en: 'Language mode', zh: '語言模式' },
	'set.languageWhy': {
		en: 'Which language this application renders in. Bilingual keeps English as the prominent primary and places Cantonese underneath as a compact secondary, so neither reads as a caption of the other.',
		zh: '呢個程式用邊種語言顯示。雙語模式會將英文放喺主位，粵語用細啲嘅字擺喺下面做次要，噉樣兩邊都唔會變成對方嘅註腳。'
	},
	'set.funnyEn': { en: 'Funny level — English', zh: '搞笑程度 — 英文' },
	'set.funnyZh': { en: 'Funny level — Cantonese', zh: '搞笑程度 — 粵語' },
	'set.funnyWhy': {
		en: 'Styles every message in this application, including warnings and errors. It changes the voice only: what happened, what is affected, and what your options are stay exact at every level.',
		zh: '會影響呢個程式入面每一句說話，包括警告同錯誤。佢淨係改語氣：發生咗乜、影響到咩、你有咩選擇，喺每一級都一模一樣。'
	},
	'set.theme': { en: 'Theme', zh: '主題' },
	'set.themeWhy': {
		en: 'Light, dark, or whatever this device currently prefers. Both are complete palettes rather than one being a washed-out pass over the other.',
		zh: '淺色、深色，或者跟住部機而家想要嘅。兩種都係完整嘅色板，唔會有一邊係另一邊嘅褪色版。'
	},
	'set.emoji': { en: 'Show emoji in dialogs', zh: '對話框顯示 emoji' },
	'set.emojiWhy': {
		en: 'Adds one relevant decoration to dialog and message-box titles. Emoji never appear in buttons, action labels, field labels or accessible names, because a control has to be readable by its words alone.',
		zh: '喺對話框同訊息框標題加一個相關嘅裝飾。Emoji 唔會出現喺按鈕、動作標籤、欄位標籤或者無障礙名稱度，因為一個控制項淨係靠文字都要睇得明。'
	},
	'set.host': { en: 'Ollama host', zh: 'Ollama 位址' },
	'set.hostWhy': {
		en: 'Where the local daemon is listening. This application never scans for it: if the address is wrong, the Ollama page says so rather than searching your network.',
		zh: '本機守護程序喺邊度聽住。呢個程式唔會周圍掃：地址錯咗，Ollama 嗰版會照直講，而唔係去掃你個網絡。'
	},
	'set.provUser': { en: 'set by you', zh: '你設定嘅' },
	'set.provDefault': { en: 'shipped default: ', zh: '出廠預設：' },

	// ---- shared ----
	'empty.noMatch': { en: 'No matches.', zh: '搵唔到。' },
	'action.cancel': { en: 'Cancel', zh: '取消' },
	'action.copy': { en: 'Copy', zh: '複製' },
	'action.delete': { en: 'Delete', zh: '刪除' },
	'action.refresh': { en: 'Refresh', zh: '重新整理' },
	'action.export': { en: 'Export', zh: '匯出' }
};

function schoolOn() {
	const s = state.get('settings');
	return !!(s.school && s.school.on);
}

function mode() {
	// School mode forces English and omits the playful capabilities entirely.
	if (schoolOn()) return 'English';
	return state.get('settings').language || 'English';
}

function level(lang) {
	if (schoolOn()) return 1;
	const s = state.get('settings');
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
	return mode() === '粵語' ? pick(entry.zh, 'zh') : pick(entry.en, 'en');
}

/** The compact secondary string, empty unless bilingual. */
export function t2(key) {
	const entry = S[key];
	if (!entry || mode() !== 'Bilingual') return '';
	return pick(entry.zh, 'zh');
}

export function isBilingual() {
	return mode() === 'Bilingual';
}

export function isCantonese() {
	return mode() === '粵語';
}

export function levels() {
	return { en: level('en'), zh: level('zh') };
}

export function levelLabel(n) {
	return (
		['1 — fully serious', '2 — dry', '3 — warm', '4 — playful', '5 — maximum'][n - 1] || String(n)
	);
}

export const FUNNY_DISCLOSURE = {
	en: 'The funny level styles every message in this application, warnings and errors included. It changes how something is said, never what is said: the facts stay exact at every level.',
	zh: '搞笑程度會影響呢個程式入面每一句說話，警告同錯誤都計。佢改嘅係點講，唔係講乜：事實喺每一級都一模一樣。'
};

/** Which settings are omitted entirely while School mode is on. */
export const PLAYFUL_SETTINGS = ['language', 'funnyEn', 'funnyZh', 'emojiDialogs', 'vocab'];

export function isPlayfulHidden(key) {
	return schoolOn() && PLAYFUL_SETTINGS.includes(key);
}
