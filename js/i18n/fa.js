/**
 * Persian catalog: the default language and the last fallback of `t()`.
 *
 * A flat object of stable, dotted English keys grouped by screen. Values are plain text (never HTML);
 * `{name}` marks a parameter. The Persian default text inside index.html must equal the value here
 * (tests/unit/i18n-html.test.mjs checks it), so the first paint and the offline path never wait for JS.
 */

export const fa = {
    // ---- Document: <title> and meta description
    'meta.description': 'دستیار راوی برای بازی دورهمی مافیا - نسخه تحت وب، بدون نیاز به نصب',
    'meta.title': 'مافیا - دستیار راوی بازی دورهمی',

    // ---- App chrome: install button and install hint
    'install.aria': 'نصب برنامه روی گوشی',
    'install.text': '⬇️ نصب برنامه روی گوشی',
    'install.hint.ios': 'اشتراک‌گذاری، سپس «افزودن به صفحه اصلی»',
    'install.hint.firefoxAndroid': 'منو، سپس «نصب» یا «افزودن به صفحه اصلی»',
    'install.hint.iosInApp': 'برای نصب، این صفحه را در Safari باز کنید',
    'install.hint.close.aria': 'بستن راهنمای نصب',

    // ---- Header bar
    'header.theme.label': 'انتخاب پوسته',

    // ---- Theme names
    'theme.default': '🌌 نئون کهکشانی',
    'theme.noir': '🕵️ نوآر کلاسیک',
    'theme.classic': '🎞️ سینمای کلاسیک',
    'theme.emerald': '🌲 جنگل زمرد',
    'theme.crimson': '🔥 شعله سرخ',
    'theme.sunset': '🌇 میراژ غروب',
    'theme.cyber': '🤖 سایبرپانک',
    'theme.ocean': '🧊 اقیانوس یخی',

    // ---- Name lists, plural units and time
    'names.pair': '{a} و {b}',
    'names.list.separator': '{a} و {b}',
    'names.list.last': '{a} و {b}',
    'time.minutes.one': '{count} دقیقه',
    'time.minutes.other': '{count} دقیقه',
    'time.seconds.one': '{count} ثانیه',
    'time.seconds.other': '{count} ثانیه',
    'time.minutesAndSeconds': '{minutes} و {seconds}',

    // ---- Toasts
    'toast.updateReady': 'نسخه جدید برنامه آماده است. برنامه را ببندید و دوباره باز کنید.',

    // ---- Welcome screen
    'welcome.title': '🎭 مافیا',
    'welcome.tagline': 'دستیار راوی برای اداره‌ی بازی دورهمی مافیا.',
    'welcome.start.aria': 'شروع بازی',
    'welcome.start.label': 'شروع بازی',
    'welcome.start.caption': 'یک گوشی، در دست راوی',
    'welcome.lang.aria': 'زبان',
    'welcome.credit.author.aria': 'صفحه سازنده',
    'welcome.credit.author': 'ساخته شده توسط مهدی',
    'welcome.credit.support.aria': 'حمایت مالی از سازنده',
    'welcome.resume': 'ادامه‌ی بازی',

    // ---- Setup screen
    'setup.title': 'تنظیمات بازی',
    'setup.players.label': 'تعداد بازیکنان:',
    'setup.back': 'بازگشت',
    'setup.error.players': 'تعداد بازیکنان باید بین {min} تا {max} نفر باشد!',
    'setup.limit.players': 'بین {min} تا {max} نفر',
    'setup.names.label': 'نام بازیکنان:',
    'setup.limit.names': 'حداکثر {max} حرف برای هر نام',
    'setup.player.default': 'بازیکن {n}',
    'setup.player.placeholder': 'نام بازیکن {n}',
    'setup.player.aria': 'نام بازیکن شماره‌ی {n}',
    'setup.doctorSave.label': 'دکتر خودش را نجات دهد:',
    'setup.doctorSave.never': 'هرگز',
    'setup.doctorSave.once': 'یک بار',
    'setup.doctorSave.always': 'همیشه',
    'setup.godfather.label': 'پدرخوانده',
    'setup.hint.godfatherMin': 'پدرخوانده از {min} بازیکن به بالا ممکن است.',
    'setup.revealDeath.label': 'نقش حذف‌شده‌ها اعلام شود',
    'setup.deal': 'پخش نقش‌ها 🎭',
    'setup.error.nameEmpty': 'نام بازیکن شماره‌ی {n} را بنویسید!',
    'setup.error.nameTooLong': 'نام بازیکن شماره‌ی {n} بیشتر از {max} حرف است!',
    'setup.error.nameDuplicate': 'نام بازیکن شماره‌ی {n} تکراری است؛ هر نام را فقط یک بار بنویسید!',
    'setup.error.godfather': 'پدرخوانده از {min} بازیکن به بالا ممکن است!',
    'setup.error.generic': 'بازی ساخته نشد. تنظیمات را بررسی کنید و دوباره امتحان کنید.',

    // ---- Modals: generic confirm
    'confirm.title': 'تایید',
    'confirm.text': 'مطمئن هستید؟',
    'confirm.yes': 'بله',
    'confirm.no': 'انصراف',
    'confirm.discard.title': 'شروع بازی تازه',
    'confirm.discard.text': 'بازی نیمه‌کاره برای همیشه پاک شود و بازی تازه شروع شود؟',

    // ---- Modals: help button and help modal
    'modal.info.close': 'متوجه شدم',
    'a11y.infoButton': 'راهنمای این گزینه',

    // ---- Reveal screen: the roles are handed out one player at a time
    'reveal.progress': 'بازیکن {n} از {total}',
    'reveal.gate.title': 'گوشی را به {name} بدهید',
    'reveal.gate.show': 'من {name} هستم',
    'reveal.gate.hint': 'فقط وقتی گوشی دست خودتان است دکمه را بزنید؛ نباید کسی دیگر نقش شما را ببیند.',
    'reveal.back': 'بازگشت',
    'reveal.live.gate': 'بازیکن {n} از {total}: گوشی را به {name} بدهید',
    'reveal.live.card': 'نقش شما نمایش داده شد.',
    'reveal.card.for': 'کارت {name}',
    'reveal.card.team': 'هم‌تیمی‌های شما: {names}',
    'reveal.card.alone': 'شما تنها عضو تیم مافیا هستید.',
    'reveal.card.note': 'نقش را که دیدید، پنهانش کنید و گوشی را به نفر بعدی بدهید.',
    'reveal.card.hide': 'پنهان کردن و ادامه',
    'reveal.card.hideLast': 'پنهان کردن و تحویل به راوی',

    // ---- Roles: name and what each does
    'role.mafia.name': '🔪 مافیا',
    'role.mafia.does': 'هر شب همراه هم‌تیمی‌هایتان یک نفر را برای حذف انتخاب می‌کنید. روز، خودتان را شهروند نشان دهید.',
    'role.godfather.name': '🎩 پدرخوانده',
    'role.godfather.does': 'رهبر مافیا هستید و هر شب همراه تیم یک نفر را حذف می‌کنید. اگر کارآگاه شما را بررسی کند، بی‌گناه دیده می‌شوید.',
    'role.doctor.name': '🩺 دکتر',
    'role.doctor.does': 'هر شب یک نفر را از حذف نجات می‌دهید.',
    'role.detective.name': '🔍 کارآگاه',
    'role.detective.does': 'هر شب یک نفر را بررسی می‌کنید و راوی می‌گوید مافیاست یا نه.',
    'role.citizen.name': '🙂 شهروند',
    'role.citizen.does': 'قدرت ویژه‌ای ندارید. با بحث و رأی‌گیری مافیا را پیدا کنید.',

    // ---- Moderator's screen
    'moderator.title': 'فهرست راوی',
    'moderator.hint': 'این فهرست فقط برای راوی است. نقش‌ها تا وقتی نخواهید پنهان می‌مانند.',
    'moderator.roles.show': 'نمایش نقش‌ها',
    'moderator.roles.hide': 'پنهان کردن نقش‌ها',
    'moderator.rules.title': 'قوانین این بازی',
    'moderator.rule.selfSave.never': 'دکتر نمی‌تواند خودش را نجات دهد.',
    'moderator.rule.selfSave.once': 'دکتر فقط یک بار می‌تواند خودش را نجات دهد.',
    'moderator.rule.selfSave.always': 'دکتر هر شب می‌تواند خودش را نجات دهد.',
    'moderator.rule.godfather.on': 'پدرخوانده در بازی هست؛ کارآگاه او را بی‌گناه می‌بیند.',
    'moderator.rule.godfather.off': 'پدرخوانده در بازی نیست.',
    'moderator.rule.revealRole.on': 'نقش بازیکن حذف‌شده اعلام می‌شود.',
    'moderator.rule.revealRole.off': 'نقش بازیکن حذف‌شده اعلام نمی‌شود.',
    'moderator.next': 'صفحه‌های شب و روز در نسخه‌ی بعدی می‌آیند.',
    'moderator.newGame': 'بازی جدید',

    // ---- Help texts of the setup options
    'info.doctorSelfSave.title': '🩺 نجات خود دکتر',
    'info.doctorSelfSave.text': 'تعیین می‌کند دکتر در شب‌ها بتواند خودش را نجات دهد یا نه. «هرگز»: هیچ‌وقت. «یک بار»: در کل بازی فقط یک بار (پیش‌فرض). «همیشه»: هر شب.',
    'info.godfather.title': '🎩 پدرخوانده',
    'info.godfather.text': 'یک نقش مافیایی که کارآگاه او را بی‌گناه می‌بیند. اگر بازیکنان کم باشند، این گزینه غیرفعال می‌ماند.',
    'info.revealRoleOnDeath.title': '🪪 اعلام نقش حذف‌شده‌ها',
    'info.revealRoleOnDeath.text': 'وقتی روشن است، با حذف یک بازیکن (در شب یا با رأی‌گیری) نقش او برای همه اعلام می‌شود. وقتی خاموش است، فقط حذف شدنش اعلام می‌شود و نقشش پنهان می‌ماند.'
};
