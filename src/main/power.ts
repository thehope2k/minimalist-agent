import { powerSaveBlocker } from 'electron';

// The user-facing toggle is "Prevent display sleep *while the agent is running*".
// So the blocker is held only while *both* are true:
//   - the user has the preference enabled (`userPref`)
//   - at least one agent turn is in flight (`activeRuns > 0`)
let blockerId: number | null = null;
let userPref = false;
let activeRuns = 0;

function apply(): void {
  const shouldBlock = userPref && activeRuns > 0;
  if (shouldBlock && blockerId === null) {
    blockerId = powerSaveBlocker.start('prevent-display-sleep');
  } else if (!shouldBlock && blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}

export function getKeepAwake(): boolean {
  return userPref;
}

export function setKeepAwake(value: boolean): void {
  userPref = value;
  apply();
}

/** Bumped when an agent turn starts; decremented on terminal events. */
export function setAgentActive(active: boolean): void {
  if (active) activeRuns += 1;
  else activeRuns = Math.max(0, activeRuns - 1);
  apply();
}

export function cleanupPower(): void {
  activeRuns = 0;
  if (blockerId !== null) {
    powerSaveBlocker.stop(blockerId);
    blockerId = null;
  }
}
