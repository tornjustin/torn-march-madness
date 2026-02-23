// Ensures a stable voter UUID exists in localStorage for this browser.
// Previously used an httpOnly cookie; now uses localStorage for cross-origin compatibility.
import { getVoterId } from '../api';

let tokenEnsured = false;

export async function ensureVoterToken() {
  if (tokenEnsured) return;
  getVoterId(); // creates UUID in localStorage on first call
  tokenEnsured = true;
}
