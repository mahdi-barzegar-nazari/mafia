/**
 * What the morning, the dusk and the end of the game say, without the DOM and without any text: plain outcome
 * objects derived from a state of the rules engine. `ui/outcomeTexts.js` turns them into sentences.
 *
 * One rule runs through all of it: a dead player's ROLE is shown only when the engine put it in the announcement
 * (`announcement.deaths[].role`, which exists only with the rule "reveal the role of eliminated players"). Nothing
 * here ever looks a role up in the list of players to add it: what the engine did not announce stays secret.
 */

/** The player of `state` with this id, or null. */
function playerOf(state, id) {
    return state.players.find((player) => player.id === id) ?? null;
}

/** The one death of an announcement as `{ id, name, role }` (role null when it is not announced), or null when nobody died. */
function deathOf(state) {
    const announcement = state.announcement;
    if (!announcement || announcement.deaths.length === 0) return null;
    const death = announcement.deaths[0];
    const player = playerOf(state, death.id);
    return { id: death.id, name: player ? player.name : '', role: Object.hasOwn(death, 'role') ? death.role : null };
}

/**
 * The morning's public announcement, or null outside the morning:
 * `{ kind: 'death', id, name, role }` (`role` is null unless the rules announce it) or `{ kind: 'nobody' }`
 * (the same for a night with no kill and for a night the doctor saved: the table cannot tell the two apart).
 */
export function morningOutcome(state) {
    if (!state || state.phase !== 'morning') return null;
    const death = deathOf(state);
    return death ? { kind: 'death', ...death } : { kind: 'nobody' };
}

/**
 * The result of the vote, or null outside the dusk:
 * `{ kind: 'eliminated', id, name, role }`, `{ kind: 'tie' }` (a shared top count: nobody is eliminated) or
 * `{ kind: 'none' }` (no votes at all, or none that counted: nobody is eliminated).
 */
export function duskOutcome(state) {
    if (!state || state.phase !== 'dusk' || !state.vote) return null;
    if (state.vote.tie) return { kind: 'tie' };
    const death = deathOf(state);
    return death ? { kind: 'eliminated', ...death } : { kind: 'none' };
}

/** 'town', 'mafia' or null. Only the ended phase has a winner to announce. */
export function winnerOutcome(state) {
    if (!state || state.phase !== 'ended') return null;
    return state.winner === 'town' || state.winner === 'mafia' ? state.winner : null;
}

/**
 * What the moderator may want to know after the night, or [] outside the morning:
 *   `{ kind: 'check', id, name, isMafia }`  the detective checked this player (the godfather reads as not mafia)
 *   `{ kind: 'saved', id, name }`           the doctor saved the player the mafia chose, so nobody died
 * No role of anyone is in it, only what the detective was told.
 */
export function moderatorNotes(state) {
    if (!state || state.phase !== 'morning') return [];
    const notes = [];
    const check = state.inputs.detective;
    if (check) {
        const target = playerOf(state, check.target);
        notes.push({ kind: 'check', id: check.target, name: target ? target.name : '', isMafia: check.isMafia === true });
    }
    if (state.savedByDoctor && state.inputs.mafia) {
        const target = playerOf(state, state.inputs.mafia.target);
        notes.push({ kind: 'saved', id: state.inputs.mafia.target, name: target ? target.name : '' });
    }
    return notes;
}

/**
 * The rows of the players panel, in the order the players were dealt. `role` is the player's role id only when
 * `showRoles` is true, and null otherwise, so a hidden role is not even in the data the screen draws from.
 */
export function playerRows(state, showRoles) {
    if (!state) return [];
    return state.players.map((player) => ({ id: player.id, name: player.name, alive: player.alive, role: showRoles ? player.role : null }));
}
