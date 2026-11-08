# Game rules (the engine)

This is the rules engine exactly as `js/game/` and `js/data/` implement it. It is pure: no DOM, no storage, no timers, no clock, no `Math.random` (the only randomness is a function you pass in). It produces ids, roles, booleans and **error codes, never text to show**. It is not wired into the app yet (step 3 adds the screens that use it).

One human, the moderator (**راوی**), holds the phone and runs the game for the players. The engine does the bookkeeping the moderator would otherwise do in their head: who is alive, what happened in the night, what a vote decides, who has won, and how to take a mistake back.

## Terms

| English | Persian | Meaning |
| :--- | :--- | :--- |
| mafia | مافیا | the hidden minority; also the plain mafia role |
| godfather | پدرخوانده | a mafia-team role that the detective reads as innocent |
| doctor | دکتر | saves one player each night |
| detective | کارآگاه | checks one player each night |
| citizen | شهروند | a town player with no special power |
| moderator | راوی | the person who runs the game |
| night | شب | the phase in which the mafia, doctor and detective act |
| day | روز | the phase of discussion that ends in the vote |
| vote | رأی‌گیری | the day's ballot that can eliminate one player |
| eliminated | حذف‌شده | out of the game, by the night kill or by the vote |

(`js/i18n/en.js` carries the same glossary in Latin letters, because `tests/unit/i18n-en.test.mjs` allows no Persian character in that file.)

## Roles and teams

Five roles, in `js/data/roles.js`: `mafia`, `godfather`, `doctor`, `detective`, `citizen`.

- **Mafia team:** `mafia` and `godfather`. **Town:** `doctor`, `detective`, `citizen`.
- The mafia team wins with the mafia; everyone else is on the town's side.
- The detective reads **only `mafia`** as mafia. The godfather reads as innocent (`isMafia: false`) although he counts as mafia everywhere else (the kill, the win rule, `mafiaTeamIds`).

## How many of each (the role table)

For `n` players (3 to 20): mafia team = `max(1, floor(n / 3))`; doctor = 1 if `n >= 4`, else 0; detective = 1; citizens = the rest.

| n | mafia team | doctor | detective | citizens | | n | mafia team | doctor | detective | citizens |
| ---: | ---: | ---: | ---: | ---: | :-: | ---: | ---: | ---: | ---: | ---: |
| 3 | 1 | 0 | 1 | 1 | | 12 | 4 | 1 | 1 | 6 |
| 4 | 1 | 1 | 1 | 1 | | 13 | 4 | 1 | 1 | 7 |
| 5 | 1 | 1 | 1 | 2 | | 14 | 4 | 1 | 1 | 8 |
| 6 | 2 | 1 | 1 | 2 | | 15 | 5 | 1 | 1 | 8 |
| 7 | 2 | 1 | 1 | 3 | | 16 | 5 | 1 | 1 | 9 |
| 8 | 2 | 1 | 1 | 4 | | 17 | 5 | 1 | 1 | 10 |
| 9 | 3 | 1 | 1 | 4 | | 18 | 6 | 1 | 1 | 10 |
| 10 | 3 | 1 | 1 | 5 | | 19 | 6 | 1 | 1 | 11 |
| 11 | 3 | 1 | 1 | 6 | | 20 | 6 | 1 | 1 | 12 |

With the godfather option the team keeps its size: one of its slots is the godfather, so `mafia = team - 1` and `godfather = 1`. That needs at least 2 mafia on the team, i.e. **6 or more players**.

`roleCounts(n, rules)` returns an object with all five keys (`mafia`, `godfather`, `doctor`, `detective`, `citizen`), or `null` when the game is unsupported: `n` is not a whole number from 3 to 20, or the godfather is on with fewer than 2 mafia.

## Options (`rules`)

`DEFAULT_RULES` and `normalizeRules(input)` are in `js/game/rules.js`. `normalizeRules` accepts anything: unknown keys are ignored, an invalid or missing value becomes the default, only own properties are read, and the result is always a fresh object with exactly these three keys.

| Option | Values | Default | Meaning |
| :--- | :--- | :--- | :--- |
| `doctorSelfSave` | `'never'` \| `'once'` \| `'always'` | `'once'` | May the doctor save himself? `'once'` is once per game: the first self-save sets `doctorSelfSaveUsed`, a second one is refused. |
| `godfather` | boolean | `false` | One mafia slot becomes the godfather. Only with 6 or more players. |
| `revealRoleOnDeath` | boolean | `true` | Whether an announcement names the role of the dead. Applies to night deaths and vote eliminations alike. |

## Fixed behaviour (no options)

- A tied vote eliminates nobody.
- **Night 1 is a normal night:** every night role acts, and the state lists the mafia team's ids from the start.
- The mafia team kills with **one target per night**, however many of them are alive. Who on the team chose it is not recorded.
- A mafia-team member is a legal kill target (the team may kill one of its own).
- There is no round limit. A stalemate (a save, then a tied vote, every round) is possible; the game just goes on and the moderator decides when to stop.

## The model: a game is its setup plus its actions

```js
game = {
  version: GAME_SAVE_VERSION,                           // 1
  setup: { players: [{ id, name, role }], rules },      // ids p1..pN, names trimmed, rules normalised
  actions: [ { type, ... }, ... ]                       // only actions that were accepted
}
```

All of it is plain JSON. The state is **never stored**: `getState(game)` derives it by replaying `actions` from `setup` (pure). Every function returns a **new** game and never changes its inputs; a game and its successor share no objects.

```text
createGame({ names, rules?, roles?, random? })  -> { ok: true, game } | { ok: false, error }
applyAction(game, action)                        -> { ok: true, game } | { ok: false, error }   (game unchanged on error)
undo(game)                                       -> { ok: true, game } | { ok: false, error }
getState(game)                                   -> state, or null if `game` is not a game this engine can replay
getModeratorView(state)                          -> view, or null for a null state
serializeGame(game)                              -> JSON text            (throws TypeError for a non-game)
deserializeGame(text)                            -> { ok: true, game } | { ok: false, error }   (never throws)
```

### `createGame`

- **Names:** 3 to 20 of them, each a string, trimmed, 1 to 24 characters (counted as code points, so one emoji is one character), not made only of invisible marks (zero-width and direction marks). No two names may be the same after `normalizeWord` from `utils/text.js` (trim, case folding, Arabic and Persian letter variants and digits unified, punctuation ignored); a name that is only punctuation is compared as its lower-cased text instead.
- **Roles:** `roles` is optional (the moderator dealt physical cards). If given it must hold exactly the roles of `roleCounts`, one per name, in any order. If omitted (or `null`) the roles are dealt by a Fisher-Yates shuffle of the canonical list with `random`, a function returning a number in `[0, 1)`. `random` is not called when `roles` is given.
- Bad input never throws.

### The state (`getState`)

| Field | Meaning |
| :--- | :--- |
| `phase` | `'night'`, `'morning'`, `'day'`, `'dusk'` or `'ended'` |
| `round` | 1-based; goes up when a new night begins |
| `players` | `[{ id, name, role, alive }]` |
| `rules` | the normalised rules |
| `mafiaTeamIds` | ids of every mafia-team member, alive or dead, from the start |
| `step` | the night step to play now (`'mafia'`, `'doctor'`, `'detective'`), else `null` |
| `steps` | for the night of `round`: `[{ step, alive, required, skippable, done }]`, always three entries |
| `inputs` | `{ mafia, doctor, detective }` of that night: `null` or `{ target }` (the detective's also has `isMafia`) |
| `announcement` | `{ deaths: [{ id, role? }], nobodyDied }` in `morning`, `dusk` and `ended`; otherwise `null`. `role` is present only with `revealRoleOnDeath`. |
| `savedByDoctor` | **moderator only**: true when the doctor's save cancelled that night's kill. Never part of `announcement`. |
| `vote` | `{ tally, eliminated, tie }` in `dusk` (and in `ended` when the game ended after a vote), else `null` |
| `winner` | `'mafia'`, `'town'` or `null`; set as soon as the win condition holds (in `morning` or `dusk`) |
| `doctorSelfSaveUsed` | the once-only self-save has been used |

`steps`, `inputs` and `savedByDoctor` describe the night of `round` and stay until the next night begins.

## Phases

```text
night -> morning -> day -> dusk -> night (round + 1)
            |                |
            +---> ended <----+      (CONTINUE when `winner` is set)
```

`morning` shows what the night did; `dusk` shows what the vote did. In both, if `winner` is already set, `CONTINUE` ends the game instead of going on (so a night that decides the game has a morning, but no day).

## Actions

| Action | Phase | Effect |
| :--- | :--- | :--- |
| `{ type: 'MAFIA_KILL', target }` | night | the mafia team's one target: any alive player, a mafia member included |
| `{ type: 'DOCTOR_SAVE', target }` | night | alive doctor only; alive target; himself only as `doctorSelfSave` allows |
| `{ type: 'DETECTIVE_CHECK', target }` | night | alive detective only; alive target other than himself; records `isMafia` (true only for the role `mafia`) |
| `{ type: 'CONTINUE' }` | morning, dusk | morning to day (or ended); dusk to the next night (or ended) |
| `{ type: 'CAST_VOTES', tally }` | day | see "The vote" |

An action is stored in its normal form (only its known fields), so an extra field in a call is dropped.

## The night

The steps run in order: **mafia team (one step), doctor, detective.**

- A step is **required** while someone of its role is alive. The mafia step is required while any mafia-team member lives. A step whose role is all dead is **not required**: it is still listed, with `alive: false`, `required: false`, `skippable: true` (so the UI can fake the call and keep the night the same length), and it accepts no action. `step` moves past it.
- When the last required step is recorded the night **resolves in the derived state**, with no extra action: the kill target dies unless it is the player the doctor saved. The phase becomes `morning`.
- The announcement is `{ deaths, nobodyDied }`. A saved night announces `{ deaths: [], nobodyDied: true }`, the same as a night with no kill, so the table cannot tell a save from nothing. `savedByDoctor` is the moderator's separate field.
- The detective's result is `isMafia: true` only for `mafia`; the godfather and everyone else read `false`.
- The doctor's self-save: `'never'` refuses it, `'once'` accepts the first (it sets `doctorSelfSaveUsed`; `undo` frees it again because the state is replayed), `'always'` accepts every night and never marks it.

## The vote

`CAST_VOTES { tally }` in `day`. `tally` is a plain object `{ playerId: count }`:

- only **alive** players as keys, each count a non-negative whole number, and the **total at most the number of alive players**; anything else is `INVALID_TALLY` (a dead or unknown id, a negative or fractional count, a string or `NaN`, an array, `null`, a total that is too big, a non-plain object);
- the player with the **unique highest count** is eliminated;
- a shared highest count above zero is a **tie** (`tie: true`), and an empty or all-zero tally is not a tie; both eliminate nobody;
- the phase becomes `dusk`; the announcement has the same shape as the night's (`{ deaths: [one or none], nobodyDied }`), and `vote` holds `{ tally, eliminated, tie }`. The stored tally is in player order, with plain zeros.

## Winning

Checked after the night resolves and after the vote:

1. **The town wins if no mafia-team member is alive.** This is checked first.
2. **The mafia wins if the alive mafia team is at least as many as the alive others** (equal counts are a mafia win).
3. Otherwise the game goes on.

`winnerFromCounts(mafiaAlive, othersAlive)` in `js/game/engine.js` is this rule on its own. After `ended` only `undo` works: every other action is `GAME_ENDED`.

## Undo

`undo(game)` removes the last action: `NOTHING_TO_UNDO` if there is none. It works in every phase, `ended` included. It is exact because the state is derived by replay: dropping an action and deriving again gives the very state that existed before it (a self-save is un-marked, a death is un-done, a vote is un-cast). Undoing every action gives a game deep-equal to the one `createGame` returned. A refused action is never recorded, so there is nothing to undo for it.

## Saving

`serializeGame(game)` is `JSON.stringify` of `{ version, setup, actions }`, in that key order. `deserializeGame(text)` treats the text as untrusted and accepts it only if all of these hold, otherwise it rejects the whole save:

1. it is valid JSON that is a plain object (`INVALID_JSON`, `INVALID_SAVE`);
2. `version` equals `GAME_SAVE_VERSION` (`UNSUPPORTED_VERSION`; checked first, so a later format is named as such);
3. it has exactly the keys `version`, `setup`, `actions`, and `actions` is an array (`INVALID_SAVE`);
4. `setup` is exactly what `createGame` builds from its own names, roles and rules: legal, trimmed names, ids `p1..pN`, a role list that fits the table, rules in normal form (`INVALID_SETUP`);
5. every action replays successfully, in order, and is stored in its normal form (`REPLAY_FAILED`).

Key order inside the text does not matter. `GAME_SAVE_VERSION` is `1`; bump it when the shape of a game changes.

## Moderator view

`getModeratorView(state)` (`js/game/view.js`) says what may be chosen now, as ids and flags:

- `phase`, `round`, `step`;
- `steps` (night only, else `[]`): per step `{ step, alive, required, skippable, done, current, actorIds, targetIds }`. `actorIds` are the living players who wake for the step; `targetIds` are who they may choose (the doctor without himself when self-save is not allowed, the detective without himself, and `[]` for a step nobody is alive for);
- `vote` (day only, else `null`): `{ candidateIds, maxTotal }`;
- `canContinue`: whether `CONTINUE` is legal (morning and dusk).

## Error codes

Stable upper-case strings; the UI maps them to text.

| Code | From | Meaning |
| :--- | :--- | :--- |
| `INVALID_INPUT` | createGame | the argument is not a plain object (also the net for anything unforeseen) |
| `INVALID_NAMES` | createGame | `names` is not an array |
| `INVALID_PLAYER_COUNT` | createGame | fewer than 3 or more than 20 names |
| `INVALID_NAME` | createGame | a name is not a string, is empty after trimming, is longer than 24 characters or is only invisible marks |
| `DUPLICATE_NAME` | createGame | two names are the same after trimming and case folding |
| `GODFATHER_NOT_ALLOWED` | createGame | the godfather is on with fewer than 6 players |
| `INVALID_ROLES` | createGame | `roles` does not match `roleCounts` |
| `INVALID_RANDOM` | createGame | `random` is missing, not a function, throws, or returns a value outside `[0, 1)` |
| `INVALID_GAME` | applyAction, undo | `game` is not a game this engine can replay |
| `INVALID_ACTION` | applyAction | the action is not a plain object with a known `type` |
| `GAME_ENDED` | applyAction | the game has ended; only `undo` works |
| `WRONG_PHASE` | applyAction | the action does not belong to the current phase |
| `WRONG_STEP` | applyAction | a night action out of order, or for a step nobody is alive for |
| `STEP_ALREADY_DONE` | applyAction | that night step is already recorded (correct it through `undo`) |
| `UNKNOWN_PLAYER` | applyAction | `target` is not a player id |
| `TARGET_DEAD` | applyAction | the target is not alive |
| `SELF_SAVE_NOT_ALLOWED` | applyAction | the doctor saving himself against `doctorSelfSave` |
| `CANNOT_CHECK_SELF` | applyAction | the detective checking himself |
| `INVALID_TALLY` | applyAction | the tally is not legal (see "The vote") |
| `NOTHING_TO_UNDO` | undo | the game has no actions |
| `INVALID_JSON` | deserializeGame | the text is not JSON |
| `INVALID_SAVE` | deserializeGame | not a string, not an object, wrong keys or `actions` not an array |
| `UNSUPPORTED_VERSION` | deserializeGame | the version is not `GAME_SAVE_VERSION` |
| `INVALID_SETUP` | deserializeGame | the setup is not one `createGame` would build |
| `REPLAY_FAILED` | deserializeGame | an action does not replay, or is not in its normal form |

**The order of the checks in `applyAction`:** `INVALID_GAME`, `INVALID_ACTION`, `GAME_ENDED`, `WRONG_PHASE`; then for a night action the step (`STEP_ALREADY_DONE` or `WRONG_STEP`), `UNKNOWN_PLAYER`, `TARGET_DEAD`, and the self rules (`SELF_SAVE_NOT_ALLOWED`, `CANNOT_CHECK_SELF`); for a vote `INVALID_TALLY`. **In `createGame`:** `INVALID_INPUT`, `INVALID_NAMES`, `INVALID_PLAYER_COUNT`, `INVALID_NAME` (every name before any duplicate), `DUPLICATE_NAME`, `GODFATHER_NOT_ALLOWED`, then `INVALID_ROLES` or `INVALID_RANDOM`.
