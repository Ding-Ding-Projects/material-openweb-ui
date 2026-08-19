// The download surface.
//
// The rule this page exists to honour is short and easy to get wrong by being
// polite: the operating system's warning about an unsigned installer is
// ACCURATE, and it is stated here, above every link, before anyone reaches one.
//
// The tempting alternatives are all worse. Putting the warning below the button
// means it is read after the download. Phrasing it as "your system may show a
// warning — this is normal" tells someone to ignore a security prompt, which is
// advice nobody should take from a stranger's website. Explaining how to click
// past SmartScreen is teaching a habit that will one day be used against them.
//
// So: what the warning will say, why it says it, what it would cost to make it
// go away, and how to check the file yourself instead.

import { h, add, clear, icon } from './dom.js';
import * as i18n from './i18n.js';

const REPO = 'https://github.com/Ding-Ding-Projects/material-openweb-ui';

/**
 * Published builds.
 *
 * Empty until one exists. An empty list renders as "nothing has been released",
 * because a download page listing a release that does not exist is worse than
 * one listing none: it sends people to a 404 and makes them doubt the page
 * rather than the link.
 */
export const RELEASES = [];

export function render(root) {
  const wrap = h('div', { class: 'wrap section' });

  // ---------- the warning, first ----------

  const warning = h('div', { class: 'dl__warning' },
    icon('warn', 'icon'),
    h('div', {},
      h('h2', { class: 'dl__warntitle' }, 'These builds are unsigned, permanently'),
      h('p', { class: 'dl__warntext' },
        'Windows will show a blue SmartScreen panel saying it protected your PC and that the publisher is unknown. macOS will refuse to open the application and say it cannot be checked for malicious software. Both are correct. Neither is a false alarm, and neither is something to click past on our say-so.'),
      h('p', { class: 'dl__warntext' },
        'The reason is money rather than principle: a code-signing certificate is an annual fee, and an Apple developer account is another one. This is a personal project and neither is being paid for. Saying "it is safe, ignore the warning" would be asking you to practise exactly the habit that gets people compromised, so we are not going to.'),
      h('p', { class: 'dl__warntext' },
        'What you can do instead: build it yourself from source, which takes one command and needs nothing installed beforehand; or check the published checksum against the file you downloaded. Both are described below.'),
      h('p', { class: 'dl__warntext dl__warntext--zh cjk' },
        '呢啲檔案冇簽名，以後都唔會有。Windows 同 macOS 都會出警告，兩個警告都係啱嘅，唔係誤報。原因好簡單：簽名證書要年年畀錢，呢個係個人項目，冇畀。我哋唔會叫你「唔使理，撳過去就得」—— 嗰個習慣正正就係出事嘅原因。你可以自己由原始碼砌，一句指令就得；或者對一對下面個 checksum。')));

  // ---------- what there is ----------

  const list = h('div', { class: 'dl__list' });
  if (!RELEASES.length) {
    add(list, h('div', { class: 'pending' },
      icon('download', 'icon icon--lg'),
      h('strong', {}, 'Nothing has been released yet'),
      h('span', { class: 'muted', style: { fontSize: '.86rem', maxWidth: '60ch' } },
        'There is no installer to download. Listing one that does not exist would send you to a missing file and leave you doubting the page rather than the link. Building from source works today.')));
  } else {
    for (const r of RELEASES) {
      add(list, h('div', { class: 'card dl__release' },
        h('div', { class: 'dl__relhead' },
          h('span', { class: 'dl__relversion' }, r.version),
          h('span', { class: 'mono muted', style: { fontSize: '.74rem' } }, r.date)),
        ...r.files.map((f) => h('div', { class: 'dl__file' },
          h('a', { href: f.url, class: 'btn btn--filled', rel: 'noreferrer noopener' },
            icon('download', 'icon icon--sm'), f.label),
          h('div', { class: 'dl__meta' },
            h('span', {}, f.platform),
            h('span', { class: 'mono' }, f.size),
            h('span', { class: 'mono dl__sha' }, 'SHA-256 ' + f.sha256))))));
    }
  }

  // ---------- building it yourself ----------

  const build = h('div', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Build it yourself'),
    h('p', { class: 'card__sub' },
      'This needs nothing installed first. The build script provisions its own toolchain into a folder of its own, runs every gate, and then asks whether to launch what it built.'),
    h('pre', { class: 'dl__code mono' },
      'git clone ' + REPO + '.git' + String.fromCharCode(10) +
      'cd material-openweb-ui' + String.fromCharCode(10) +
      'build.bat'),
    h('p', { class: 'dl__note' },
      'Add /s for a silent run that never asks anything and exits non-zero on the first real failure, which is what a machine wants.'));

  const verify = h('div', { class: 'card' },
    h('h2', { class: 'card__title' }, 'Check a file you downloaded'),
    h('p', { class: 'card__sub' },
      'Compare the result with the SHA-256 printed beside the file above. If they differ, do not run it — and tell us, because that is worth knowing.'),
    h('pre', { class: 'dl__code mono' },
      '# Windows' + String.fromCharCode(10) +
      'Get-FileHash .\\material-openweb-ui-setup.exe -Algorithm SHA256' + String.fromCharCode(10) +
      String.fromCharCode(10) +
      '# macOS and Linux' + String.fromCharCode(10) +
      'shasum -a 256 material-openweb-ui.dmg'),
    h('p', { class: 'dl__note' },
      'A checksum proves the file arrived intact. It does not prove where it came from — only a signature does that, and there is not one. Stated so the guarantee is not overclaimed.'));

  add(wrap,
    h('div', { class: 'section__head' },
      h('h1', {}, i18n.t('nav.download')),
      h('p', { class: 'muted' }, 'What there is to install, and what your operating system will say about it.')),
    warning,
    list,
    h('div', { class: 'grid grid--2', style: { gap: '18px', marginTop: '22px' } }, build, verify));

  root.append(wrap);
}
