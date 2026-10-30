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

    // ---- Setup screen
    'setup.title': 'تنظیمات بازی',
    'setup.players.label': 'تعداد بازیکنان:',
    'setup.back': 'بازگشت',
    'setup.error.players': 'تعداد بازیکنان باید بین {min} تا {max} نفر باشد!',
    'setup.limit.players': 'بین {min} تا {max} نفر',

    // ---- Modals: generic confirm
    'confirm.title': 'تایید',
    'confirm.text': 'مطمئن هستید؟',
    'confirm.yes': 'بله',
    'confirm.no': 'انصراف'
};
