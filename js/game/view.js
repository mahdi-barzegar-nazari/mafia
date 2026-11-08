/**
 * What the moderator may choose at this moment, derived from a state. Pure; ids and flags only, no text.
 */
import { NIGHT_STEPS } from '../data/roles.js';
import { PHASES } from './constants.js';

/**
 * `{ phase, round, step, steps, vote, canContinue }` for a state from `getState`, or null for null.
 *  - `step`: the night step to play now, or null.
 *  - `steps` (night only, else []): per step { step, alive, required, skippable, done, current, actorIds, targetIds }.
 *    `actorIds` are the living players who wake for the step; `targetIds` are who they may choose
 *    (empty for a step nobody is alive for: it accepts no action).
 *  - `vote` (day only, else null): { candidateIds, maxTotal }, the living players and how many votes in total.
 *  - `canContinue`: whether CONTINUE is legal.
 */
export function getModeratorView(state) {
    if (state === null || typeof state !== 'object') return null;
    const aliveIds = state.players.filter((p) => p.alive).map((p) => p.id);
    const night = state.phase === PHASES.NIGHT;

    const steps = night
        ? NIGHT_STEPS.map((def) => {
              const entry = state.steps.find((s) => s.step === def.step);
              const actorIds = state.players.filter((p) => p.alive && def.roles.includes(p.role)).map((p) => p.id);
              let targetIds = entry.alive ? aliveIds : [];
              if (def.step === 'doctor' && actorIds.length > 0) {
                  const mode = state.rules.doctorSelfSave;
                  if (mode === 'never' || (mode === 'once' && state.doctorSelfSaveUsed)) {
                      targetIds = targetIds.filter((id) => id !== actorIds[0]);
                  }
              }
              if (def.step === 'detective') targetIds = targetIds.filter((id) => !actorIds.includes(id));
              return {
                  step: def.step,
                  alive: entry.alive,
                  required: entry.required,
                  skippable: entry.skippable,
                  done: entry.done,
                  current: state.step === def.step,
                  actorIds,
                  targetIds
              };
          })
        : [];

    return {
        phase: state.phase,
        round: state.round,
        step: night ? state.step : null,
        steps,
        vote: state.phase === PHASES.DAY ? { candidateIds: aliveIds, maxTotal: aliveIds.length } : null,
        canContinue: state.phase === PHASES.MORNING || state.phase === PHASES.DUSK
    };
}
