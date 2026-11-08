/**
 * The rules engine of Mafia: a pure, event-sourced state machine. No DOM, no storage, no timers, no clock
 * and no Math.random (the only randomness is the `random` function `createGame` is given).
 *
 * A game is plain JSON: `{ version, setup: { players: [{ id, name, role }], rules }, actions: [...] }`. The
 * state is never stored; `getState(game)` derives it by replaying the actions from the setup, so undo is
 * exact (drop the last action and derive again). Every function returns a NEW game and never changes its
 * input. No text a player can read is produced here: results are ids, roles, booleans and error codes.
 */
import { RULES } from '../core/config.js';
import { NIGHT_STEPS, ROLES } from '../data/roles.js';
import { normalizeWord } from '../utils/text.js';
import { ACTION_TYPES, ERRORS, GAME_SAVE_VERSION, PHASES, WINNERS } from './constants.js';
import { clone, isPlainObject } from './json.js';
import { NAME_LIMITS, normalizeRules } from './rules.js';
import { isMafiaTeam, matchesCounts, roleCounts, roleList, shuffleWith } from './roles.js';

const fail = (error) => ({ ok: false, error });

/** Zero-width and direction marks: invisible, so a name made only of them is empty for a person. */
const INVISIBLE_ONLY = /^[\u200B-\u200F\u202A-\u202E\u2060-\u2069\uFEFF]*$/;

// ---------------------------------------------------------------------------------------------------
// The win rule
// ---------------------------------------------------------------------------------------------------

/**
 * Who has won, from the number of living mafia-team members and living others. The town is checked first:
 * no mafia left means the town wins. The mafia wins when it is at least as numerous as everyone else.
 * Returns 'town', 'mafia' or null (the game goes on).
 */
export function winnerFromCounts(mafiaAlive, othersAlive) {
    if (mafiaAlive === 0) return WINNERS.TOWN;
    if (mafiaAlive >= othersAlive) return WINNERS.MAFIA;
    return null;
}

function winnerOf(players) {
    const mafiaAlive = players.filter((p) => p.alive && isMafiaTeam(p.role)).length;
    const othersAlive = players.filter((p) => p.alive && !isMafiaTeam(p.role)).length;
    return winnerFromCounts(mafiaAlive, othersAlive);
}

// ---------------------------------------------------------------------------------------------------
// createGame
// ---------------------------------------------------------------------------------------------------

/** The name as it is stored (trimmed), or null when it is not a legal name. */
function cleanName(raw) {
    if (typeof raw !== 'string') return null;
    const name = raw.trim();
    const length = [...name].length;
    if (length < NAME_LIMITS.min || length > NAME_LIMITS.max || INVISIBLE_ONLY.test(name)) return null;
    return name;
}

/** Two names are the same player when this key is equal: trimmed, case-folded, digits and letter variants unified. */
function nameKey(name) {
    return normalizeWord(name) || name.toLowerCase();
}

function build(input) {
    if (!isPlainObject(input)) return fail(ERRORS.INVALID_INPUT);
    const { names: rawNames, roles: rawRoles, random } = input;
    if (!Array.isArray(rawNames)) return fail(ERRORS.INVALID_NAMES);
    const count = rawNames.length;
    if (count < RULES.players.min || count > RULES.players.max) return fail(ERRORS.INVALID_PLAYER_COUNT);

    const names = [];
    for (let i = 0; i < count; i++) {
        const name = cleanName(rawNames[i]);
        if (name === null) return fail(ERRORS.INVALID_NAME);
        names.push(name);
    }
    if (new Set(names.map(nameKey)).size !== count) return fail(ERRORS.DUPLICATE_NAME);

    const rules = normalizeRules(input.rules);
    const counts = roleCounts(count, rules);
    if (counts === null) return fail(ERRORS.GODFATHER_NOT_ALLOWED);

    let roles;
    if (rawRoles === undefined || rawRoles === null) {
        try {
            roles = shuffleWith(random, roleList(counts));
        } catch {
            return fail(ERRORS.INVALID_RANDOM);
        }
    } else if (Array.isArray(rawRoles) && rawRoles.length === count && matchesCounts(rawRoles, counts)) {
        roles = [...rawRoles];
    } else {
        return fail(ERRORS.INVALID_ROLES);
    }

    return {
        ok: true,
        game: {
            version: GAME_SAVE_VERSION,
            setup: { players: names.map((name, i) => ({ id: `p${i + 1}`, name, role: roles[i] })), rules },
            actions: []
        }
    };
}

/**
 * Start a game. `{ names, rules?, roles?, random? }`: 3 to 20 names (trimmed, 1 to 24 characters, no
 * duplicates), `rules` normalised by `normalizeRules`, `roles` (one per name, exactly the roles of
 * `roleCounts`) when the moderator dealt the cards, otherwise a Fisher-Yates shuffle with `random`.
 * Returns `{ ok: true, game }` or `{ ok: false, error }` with a code from ERRORS. Never throws.
 */
export function createGame(input) {
    try {
        return build(input);
    } catch {
        return fail(ERRORS.INVALID_INPUT);
    }
}

// ---------------------------------------------------------------------------------------------------
// The state machine
// ---------------------------------------------------------------------------------------------------

function nextStep(state) {
    const next = state.steps.find((entry) => entry.required && !entry.done);
    return next ? next.step : null;
}

/** Enter the night of `round`: no input yet, and a step is required only if someone of its role lives. */
function beginNight(state, round) {
    state.round = round;
    state.phase = PHASES.NIGHT;
    state.announcement = null;
    state.vote = null;
    state.savedByDoctor = false;
    state.inputs = { mafia: null, doctor: null, detective: null };
    state.steps = NIGHT_STEPS.map((def) => {
        const alive = state.players.some((p) => p.alive && def.roles.includes(p.role));
        return { step: def.step, alive, required: alive, skippable: !alive, done: false };
    });
    state.step = nextStep(state);
}

function initialState(setup) {
    const state = {
        phase: PHASES.NIGHT,
        round: 1,
        players: setup.players.map((p) => ({ id: p.id, name: p.name, role: p.role, alive: true })),
        rules: clone(setup.rules),
        mafiaTeamIds: setup.players.filter((p) => isMafiaTeam(p.role)).map((p) => p.id),
        step: null,
        steps: [],
        inputs: { mafia: null, doctor: null, detective: null },
        announcement: null,
        savedByDoctor: false,
        vote: null,
        winner: null,
        doctorSelfSaveUsed: false
    };
    beginNight(state, 1);
    return state;
}

function announce(state, ids) {
    const reveal = state.rules.revealRoleOnDeath;
    return {
        deaths: ids.map((id) => (reveal ? { id, role: state.players.find((p) => p.id === id).role } : { id })),
        nobodyDied: ids.length === 0
    };
}

function kill(state, id) {
    state.players.find((p) => p.id === id).alive = false;
}

/** The last required step was recorded: the target dies unless the doctor saved that player. */
function resolveNight(state) {
    const target = state.inputs.mafia.target;
    const saved = state.inputs.doctor !== null && state.inputs.doctor.target === target;
    state.savedByDoctor = saved;
    const deaths = saved ? [] : [target];
    deaths.forEach((id) => kill(state, id));
    state.announcement = announce(state, deaths);
    state.winner = winnerOf(state.players);
    state.step = null;
    state.phase = PHASES.MORNING;
}

function nightAction(state, raw) {
    if (state.phase !== PHASES.NIGHT) return fail(ERRORS.WRONG_PHASE);
    const def = NIGHT_STEPS.find((d) => d.action === raw.type);
    if (state.step !== def.step) return fail(state.inputs[def.step] !== null ? ERRORS.STEP_ALREADY_DONE : ERRORS.WRONG_STEP);

    const target = state.players.find((p) => p.id === raw.target);
    if (!target) return fail(ERRORS.UNKNOWN_PLAYER);
    if (!target.alive) return fail(ERRORS.TARGET_DEAD);

    const record = { target: target.id };
    if (def.step === 'doctor' || def.step === 'detective') {
        const actor = state.players.find((p) => p.alive && def.roles.includes(p.role));
        const self = target.id === actor.id;
        if (def.step === 'doctor' && self) {
            const mode = state.rules.doctorSelfSave;
            if (mode === 'never' || (mode === 'once' && state.doctorSelfSaveUsed)) return fail(ERRORS.SELF_SAVE_NOT_ALLOWED);
            if (mode === 'once') state.doctorSelfSaveUsed = true;
        }
        if (def.step === 'detective') {
            if (self) return fail(ERRORS.CANNOT_CHECK_SELF);
            record.isMafia = target.role === ROLES.MAFIA;
        }
    }

    state.inputs[def.step] = record;
    state.steps.find((entry) => entry.step === def.step).done = true;
    state.step = nextStep(state);
    if (state.step === null) resolveNight(state);
    return { ok: true, action: { type: raw.type, target: target.id } };
}

/** The tally with only living players, in player order, or null when it is not legal. */
function readTally(state, input) {
    if (!isPlainObject(input)) return null;
    const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
    if (!Object.keys(input).every((key) => aliveIds.includes(key))) return null;
    const tally = {};
    let total = 0;
    for (const id of aliveIds) {
        if (!Object.hasOwn(input, id)) continue;
        const count = input[id];
        if (!Number.isInteger(count) || count < 0) return null;
        tally[id] = count === 0 ? 0 : count;
        total += count;
    }
    return total <= aliveIds.length ? tally : null;
}

function castVotes(state, raw) {
    if (state.phase !== PHASES.DAY) return fail(ERRORS.WRONG_PHASE);
    const tally = readTally(state, raw.tally);
    if (tally === null) return fail(ERRORS.INVALID_TALLY);

    const top = Math.max(0, ...Object.values(tally));
    const leaders = top > 0 ? Object.keys(tally).filter((id) => tally[id] === top) : [];
    const eliminated = leaders.length === 1 ? leaders[0] : null;

    state.vote = { tally, eliminated, tie: leaders.length > 1 };
    if (eliminated !== null) kill(state, eliminated);
    state.announcement = announce(state, eliminated === null ? [] : [eliminated]);
    state.winner = winnerOf(state.players);
    state.phase = PHASES.DUSK;
    return { ok: true, action: { type: ACTION_TYPES.CAST_VOTES, tally: clone(tally) } };
}

function continueGame(state) {
    if (state.phase === PHASES.MORNING) {
        if (state.winner !== null) {
            state.phase = PHASES.ENDED;
        } else {
            state.phase = PHASES.DAY;
            state.announcement = null;
        }
    } else if (state.phase === PHASES.DUSK) {
        if (state.winner !== null) state.phase = PHASES.ENDED;
        else beginNight(state, state.round + 1);
    } else {
        return fail(ERRORS.WRONG_PHASE);
    }
    return { ok: true, action: { type: ACTION_TYPES.CONTINUE } };
}

/**
 * One step of the state machine, applied IN PLACE to `state`, a working copy that only `replayGame` owns (it
 * is built from the setup on every replay and never shared with a game). Returns `{ ok: true, action }` with
 * the action as it is stored (only its known fields), or `{ ok: false, error }`. Every check happens before
 * the first change, so a refused action leaves `state` as it was.
 */
function reduce(state, raw) {
    if (!isPlainObject(raw) || typeof raw.type !== 'string' || !Object.hasOwn(ACTION_TYPES, raw.type)) {
        return fail(ERRORS.INVALID_ACTION);
    }
    if (state.phase === PHASES.ENDED) return fail(ERRORS.GAME_ENDED);
    switch (raw.type) {
        case ACTION_TYPES.CAST_VOTES:
            return castVotes(state, raw);
        case ACTION_TYPES.CONTINUE:
            return continueGame(state);
        default:
            return nightAction(state, raw);
    }
}

// ---------------------------------------------------------------------------------------------------
// Public API on a game
// ---------------------------------------------------------------------------------------------------

/** A loose structural check, enough to replay without crashing. `validateGame` (persistence.js) is the strict one. */
export function hasGameShape(game) {
    return (
        isPlainObject(game) &&
        game.version === GAME_SAVE_VERSION &&
        isPlainObject(game.setup) &&
        Array.isArray(game.setup.players) &&
        isPlainObject(game.setup.rules) &&
        Array.isArray(game.actions)
    );
}

/**
 * Replay every action of `game` from its setup. `{ ok: true, state, actions }` where `actions` are the stored
 * (normalised) forms, or `{ ok: false, error, index }` for the first action that does not replay.
 */
export function replayGame(game) {
    if (!hasGameShape(game)) return { ok: false, error: ERRORS.INVALID_GAME, index: -1 };
    let state;
    try {
        state = initialState(game.setup); // a fresh object: nothing in it is shared with `game`
    } catch {
        return { ok: false, error: ERRORS.INVALID_GAME, index: -1 };
    }
    const actions = [];
    for (let i = 0; i < game.actions.length; i++) {
        let result;
        try {
            result = reduce(state, game.actions[i]);
        } catch {
            return { ok: false, error: ERRORS.INVALID_ACTION, index: i };
        }
        if (!result.ok) return { ok: false, error: result.error, index: i };
        actions.push(result.action);
    }
    return { ok: true, state, actions };
}

/**
 * The state of a game, derived by replay (pure). A fresh object on every call, or null when `game` is not a
 * game this engine can replay. Fields: phase, round, players [{ id, name, role, alive }], rules, mafiaTeamIds,
 * step (the night step to play now, else null), steps [{ step, alive, required, skippable, done }] and inputs
 * ({ mafia, doctor, detective }, each null or { target } with isMafia for the detective) of the night of
 * `round`, announcement ({ deaths: [{ id, role? }], nobodyDied } in morning, dusk and ended), savedByDoctor
 * (moderator only), vote ({ tally, eliminated, tie } in dusk, and in ended after a vote), winner ('mafia',
 * 'town' or null) and doctorSelfSaveUsed.
 */
export function getState(game) {
    try {
        const result = replayGame(game);
        return result.ok ? result.state : null;
    } catch {
        return null;
    }
}

/** Apply one action. `{ ok: true, game }` (a new game) or `{ ok: false, error }` (the game is unchanged). */
export function applyAction(game, action) {
    let replayed;
    try {
        replayed = replayGame(game);
    } catch {
        return fail(ERRORS.INVALID_GAME);
    }
    if (!replayed.ok) return fail(ERRORS.INVALID_GAME);
    let result;
    try {
        result = reduce(replayed.state, action); // the replayed state is a private copy, discarded afterwards
    } catch {
        return fail(ERRORS.INVALID_ACTION);
    }
    if (!result.ok) return fail(result.error);
    return {
        ok: true,
        game: { version: game.version, setup: clone(game.setup), actions: [...clone(game.actions), result.action] }
    };
}

/** Remove the last action, in any phase (the ended game included). A new game, or NOTHING_TO_UNDO. */
export function undo(game) {
    if (!hasGameShape(game)) return fail(ERRORS.INVALID_GAME);
    if (game.actions.length === 0) return fail(ERRORS.NOTHING_TO_UNDO);
    return {
        ok: true,
        game: { version: game.version, setup: clone(game.setup), actions: clone(game.actions.slice(0, -1)) }
    };
}
