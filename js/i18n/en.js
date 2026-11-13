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
 * Terms of the rules engine (js/game/, docs/game-rules.md). The role names and the words of the setup, reveal and
 * moderator screens use them (the keys are in the brackets). The Persian term to use is written in Latin letters
 * (as "rawi" above), because tests/unit/i18n-en.test.mjs allows no Persian character in this file;
 * docs/game-rules.md has the same terms in Persian script. They stay the same everywhere.
 *
 *   mafia ............ the hidden minority; also the plain mafia role              (Persian: mafia)       (role.mafia.name)
 *   godfather ........ a mafia-team role the detective reads as innocent          (Persian: pedarkhande) (role.godfather.name)
 *   doctor ........... the town role that saves one player each night             (Persian: doktor)      (role.doctor.name)
 *   detective ........ the town role that checks one player each night            (Persian: kargah)      (role.detective.name)
 *   citizen .......... a town player with no special power                        (Persian: shahrvand)   (role.citizen.name)
 *   moderator ........ the person who runs the game, as above                     (Persian: rawi)        (moderator.title)
 *   eliminated ....... out of the game, by the night kill or by the vote          (Persian: hazf-shode)  (setup.revealDeath.label)
 *   deal ............. hand every player a secret role, face down                 (Persian: pakhsh)      (setup.deal)
 *
 * Terms the night and day screens will use (step 3B adds their keys): night (shab), day (rooz), vote (ray-giri).
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
    'welcome.resume': 'Resume game',

    // ---- Setup screen
    'setup.title': 'Game settings',
    'setup.players.label': 'Number of players:',
    'setup.back': 'Back',
    'setup.error.players': 'You need {min} to {max} players!',
    'setup.limit.players': '{min} to {max} players',
    'setup.names.label': 'Player names:',
    'setup.limit.names': 'Up to {max} characters per name',
    'setup.player.default': 'Player {n}',
    'setup.player.placeholder': 'Player {n} name',
    'setup.player.aria': 'Name of player number {n}',
    'setup.doctorSave.label': 'The doctor may save themselves:',
    'setup.doctorSave.never': 'Never',
    'setup.doctorSave.once': 'Once',
    'setup.doctorSave.always': 'Always',
    'setup.godfather.label': 'Godfather',
    'setup.hint.godfatherMin': 'The godfather needs at least {min} players.',
    'setup.revealDeath.label': 'Reveal roles of eliminated players',
    'setup.deal': 'Deal roles 🎭',
    'setup.error.nameEmpty': 'Player {n} needs a name!',
    'setup.error.nameTooLong': 'Player {n}’s name is longer than {max} characters!',
    'setup.error.nameDuplicate': 'Player {n}’s name is already taken. Each name can be used only once!',
    'setup.error.godfather': 'The godfather needs at least {min} players!',
    'setup.error.generic': 'Couldn’t deal the game. Check the settings and try again.',

    // ---- Modals: generic confirm
    'confirm.title': 'Confirm',
    'confirm.text': 'Are you sure?',
    'confirm.yes': 'Yes',
    'confirm.no': 'Cancel',
    'confirm.discard.title': 'Start a new game',
    'confirm.discard.text': 'Delete the unfinished game for good and start a new one?',

    // ---- Modals: help button and help modal
    'modal.info.close': 'Got it',
    'a11y.infoButton': 'About this option',

    // ---- Reveal screen: the roles are handed out one player at a time
    'reveal.progress': 'Player {n} of {total}',
    'reveal.gate.title': 'Hand the phone to {name}',
    'reveal.gate.show': 'I am {name}',
    'reveal.gate.hint': 'Tap only when the phone is in your own hands. No one else should see your role.',
    'reveal.back': 'Back',
    'reveal.live.gate': 'Player {n} of {total}: hand the phone to {name}',
    'reveal.live.card': 'Your role is showing.',
    'reveal.card.for': '{name}’s card',
    'reveal.card.team': 'Your team: {names}',
    'reveal.card.alone': 'You’re the only one on the mafia team.',
    'reveal.card.note': 'Once you’ve seen your role, hide it and pass the phone on.',
    'reveal.card.hide': 'Hide and pass on',
    'reveal.card.hideLast': 'Hide and hand back to the moderator',

    // ---- Roles: name and what each does
    'role.mafia.name': '🔪 Mafia',
    'role.mafia.does': 'Each night your team picks one player to eliminate. By day, act like a citizen.',
    'role.godfather.name': '🎩 Godfather',
    'role.godfather.does': 'You lead the mafia and pick a victim with your team each night. If the detective checks you, you look innocent.',
    'role.doctor.name': '🩺 Doctor',
    'role.doctor.does': 'Each night you can save one player from being eliminated.',
    'role.detective.name': '🔍 Detective',
    'role.detective.does': 'Each night you check one player, and the moderator tells you whether they’re mafia.',
    'role.citizen.name': '🙂 Citizen',
    'role.citizen.does': 'You have no special power. Find the mafia through discussion and votes.',

    // ---- Moderator’s screen
    'moderator.title': 'Moderator’s list',
    'moderator.hint': 'This list is for the moderator only. Roles stay hidden until you show them.',
    'moderator.roles.show': 'Show roles',
    'moderator.roles.hide': 'Hide roles',
    'moderator.rules.title': 'Rules for this game',
    'moderator.rule.selfSave.never': 'The doctor can never save themselves.',
    'moderator.rule.selfSave.once': 'The doctor can save themselves once.',
    'moderator.rule.selfSave.always': 'The doctor can save themselves any night.',
    'moderator.rule.godfather.on': 'The godfather is in the game and looks innocent to the detective.',
    'moderator.rule.godfather.off': 'There is no godfather.',
    'moderator.rule.revealRole.on': 'The role of an eliminated player is announced.',
    'moderator.rule.revealRole.off': 'The role of an eliminated player stays secret.',
    'moderator.next': 'The night and day screens come in the next version.',
    'moderator.newGame': 'New game',

    // ---- Help texts of the setup options
    'info.doctorSelfSave.title': '🩺 The doctor saving themselves',
    'info.doctorSelfSave.text': 'Decides whether the doctor can pick themselves during the night. “Never”: not at all. “Once”: one time in the whole game (the default). “Always”: any night.',
    'info.godfather.title': '🎩 Godfather',
    'info.godfather.text': 'A mafia role that the detective sees as innocent. The option stays off while there are too few players.',
    'info.revealRoleOnDeath.title': '🪪 Reveal the role of eliminated players',
    'info.revealRoleOnDeath.text': 'When on, a player who is eliminated (at night or by the vote) has their role announced to everyone. When off, only the elimination is announced and the role stays secret.'
};
