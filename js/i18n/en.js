/**
 * English catalog. It has exactly the keys and placeholders of `fa.js` (tests/unit/i18n-html.test.mjs and
 * tests/unit/i18n-en.test.mjs check that). Values are plain text, never HTML; `{name}` marks a parameter.
 *
 * This is a party game, so the text is short, casual and second person, in the voice of the Persian text.
 * It is written for English, not translated word for word: placeholders move where English needs them,
 * and emoji stay exactly as they are in `fa.js`.
 *
 * Glossary: one English term per game idea, used everywhere. The brackets name the `fa.js` key that shows
 * the Persian original, so the two catalogs can be compared. Step 2 and later add their own terms here.
 *
 *   moderator ........ the person who runs the game and holds the phone (the narrator, "rawi" in Persian) (welcome.tagline, welcome.start.caption)
 *   game ............. one play of Mafia, from the first night to the last vote   (welcome.start.label)
 *   players .......... everyone who takes part, the moderator not counted          (setup.players.label)
 *
 * Terms of the rules engine (js/game/, docs/game-rules.md). No catalog key uses them yet: step 3 adds the
 * screens and their keys. The Persian term to use then is written in Latin letters (as "rawi" above),
 * because tests/unit/i18n-en.test.mjs allows no Persian character in this file; docs/game-rules.md has
 * the same terms in Persian script. They stay the same everywhere.
 *
 *   mafia ............ the hidden minority; also the plain mafia role              (Persian: mafia)
 *   godfather ........ a mafia-team role the detective reads as innocent          (Persian: pedarkhande)
 *   doctor ........... the town role that saves one player each night            (Persian: doktor)
 *   detective ........ the town role that checks one player each night           (Persian: kargah)
 *   citizen .......... a town player with no special power                        (Persian: shahrvand)
 *   moderator ........ the person who runs the game, as above                     (Persian: rawi)
 *   night ............ the phase in which the mafia, doctor and detective act     (Persian: shab)
 *   day .............. the phase of discussion that ends in the vote               (Persian: rooz)
 *   vote ............. the day's ballot that can eliminate one player             (Persian: ray-giri)
 *   eliminated ....... out of the game, by the night kill or by the vote          (Persian: hazf-shode)
 *
 * Typography: ’ for apostrophes, “ ” for the quotes around a name in a list of names.
 */

export const en = {
    // ---- Document: <title> and meta description
    'meta.description': 'A moderator’s assistant for the Mafia party game: a web app, no install needed',
    'meta.title': 'Mafia - Party Game Moderator',

    // ---- App chrome: install button and install hint
    'install.aria': 'Install the app on your phone',
    'install.text': '⬇️ Install on your phone',
    'install.hint.ios': 'Share, then Add to Home Screen',
    'install.hint.firefoxAndroid': 'Menu, then Install / Add to Home screen',
    'install.hint.iosInApp': 'To install, open this page in Safari',
    'install.hint.close.aria': 'Dismiss install tip',

    // ---- Header bar
    'header.theme.label': 'Choose theme',

    // ---- Theme names
    'theme.default': '🌌 Galactic Neon',
    'theme.noir': '🕵️ Classic Noir',
    'theme.classic': '🎞️ Classic Cinema',
    'theme.emerald': '🌲 Emerald Forest',
    'theme.crimson': '🔥 Crimson Flame',
    'theme.sunset': '🌇 Sunset Mirage',
    'theme.cyber': '🤖 Cyberpunk',
    'theme.ocean': '🧊 Frozen Ocean',

    // ---- Name lists, plural units and time
    'names.pair': '{a} and {b}',
    'names.list.separator': '{a}, {b}',
    'names.list.last': '{a} and {b}',
    'time.minutes.one': '{count} minute',
    'time.minutes.other': '{count} minutes',
    'time.seconds.one': '{count} second',
    'time.seconds.other': '{count} seconds',
    'time.minutesAndSeconds': '{minutes} and {seconds}',

    // ---- Toasts
    'toast.updateReady': 'A new version is ready. Close the app and open it again.',

    // ---- Welcome screen
    'welcome.title': '🎭 Mafia',
    'welcome.tagline': 'A moderator’s assistant for the Mafia party game.',
    'welcome.start.aria': 'Start game',
    'welcome.start.label': 'Start game',
    'welcome.start.caption': 'One phone, in the moderator’s hands',
    'welcome.lang.aria': 'Language',
    'welcome.credit.author.aria': 'Creator’s page',
    'welcome.credit.author': 'Made by Mahdi',
    'welcome.credit.support.aria': 'Support the creator',

    // ---- Setup screen
    'setup.title': 'Game settings',
    'setup.players.label': 'Number of players:',
    'setup.back': 'Back',
    'setup.error.players': 'You need {min} to {max} players!',
    'setup.limit.players': '{min} to {max} players',

    // ---- Modals: generic confirm
    'confirm.title': 'Confirm',
    'confirm.text': 'Are you sure?',
    'confirm.yes': 'Yes',
    'confirm.no': 'Cancel'
};
