/**
 * dsh-deepseek-splash — host half.
 *
 * The opening animation itself is a Web client contribution
 * (see ./client.js, loaded through exports["./client"] + dsh.client.platform),
 * so the host half stays deliberately empty: no services, no tools, no files.
 */

export const name = "deepseek-splash";

export function apply() {
  /* nothing to do on the host side */
}
