/**
 * The catalog keys of each role: its name and one or two lines on what it does. The role ids come from the engine
 * (`data/roles.js`) and the texts live in the catalogs; this table is the one place that joins the two (a test
 * checks that every role id has its keys). Keys are written out in full, never built from the id, so a search
 * for a key finds its use.
 */

import { t } from '../i18n/index.js';

export const ROLE_TEXT_KEYS = Object.freeze({
    mafia: Object.freeze({ name: 'role.mafia.name', does: 'role.mafia.does' }),
    godfather: Object.freeze({ name: 'role.godfather.name', does: 'role.godfather.does' }),
    doctor: Object.freeze({ name: 'role.doctor.name', does: 'role.doctor.does' }),
    detective: Object.freeze({ name: 'role.detective.name', does: 'role.detective.does' }),
    citizen: Object.freeze({ name: 'role.citizen.name', does: 'role.citizen.does' })
});

/** The name of `role` in the active language; '' for an id that is not a role. */
export function roleName(role) {
    const keys = Object.hasOwn(ROLE_TEXT_KEYS, role) ? ROLE_TEXT_KEYS[role] : null;
    return keys ? t(keys.name) : '';
}

/** What `role` does, in the active language; '' for an id that is not a role. */
export function roleDoes(role) {
    const keys = Object.hasOwn(ROLE_TEXT_KEYS, role) ? ROLE_TEXT_KEYS[role] : null;
    return keys ? t(keys.does) : '';
}
