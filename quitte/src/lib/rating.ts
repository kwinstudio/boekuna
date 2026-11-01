import Constants from 'expo-constants';
import * as StoreReview from 'expo-store-review';
import { getState, setProfile } from './store';

/**
 * Om een beoordeling vragen op een succesmoment (iedereen quitte, of na een flink aantal uitgaven).
 * Alleen als iemand de app al een paar dagen gebruikt, en hooguit één keer per versie. Apple bepaalt zelf of het venster verschijnt.
 */
export async function askReviewAtSuccess(delayMs = 1200) {
  const p = getState().profile;
  const version = Constants.expoConfig?.version ?? '1';
  if (!p.firstOpenAt || Date.now() - p.firstOpenAt < 3 * 24 * 3600_000) return;
  if (p.reviewedVersion === version) return;
  try {
    if (!(await StoreReview.hasAction())) return;
    setProfile({ reviewedVersion: version });
    setTimeout(() => StoreReview.requestReview().catch(() => {}), delayMs);
  } catch {}
}

/** Teller voor het tweede succesmoment: de 10e eigen uitgave. */
export function countOwnEntry() {
  const n = (getState().profile.ownEntries ?? 0) + 1;
  setProfile({ ownEntries: n });
  if (n === 10) askReviewAtSuccess(900);
}
