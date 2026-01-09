/**
 * Access Control Prompting
 *
 * Note: MCP servers cannot do interactive stdin prompts because stdin/stdout
 * are used for the MCP protocol. Instead, we use a notification-based approach:
 *
 * 1. When an unknown credential is requested, we log a message to stderr
 * 2. The user can approve/deny via:
 *    - Editing ~/.vaultrunner/access.json directly
 *    - Using the vaultrunner CLI (future enhancement)
 *    - Using the Chrome extension UI (future enhancement)
 *
 * For now, unknown credentials are denied by default with instructions.
 */

import { logger } from "../utils/logger.js";

export interface CredentialInfo {
  itemId: string;
  title: string;
  username: string;
  vault: string;
}

/**
 * Notify the user that a credential request was denied and how to approve it
 */
export function notifyAccessDenied(credential: CredentialInfo): void {
  logger.divider();
  logger.denied(`Access denied for credential:`);
  logger.credential(credential.title, credential.username, credential.vault);
  logger.info("");
  logger.info("To allow this credential, add it to ~/.vaultrunner/access.json:");
  logger.step(`Item ID: ${credential.itemId}`);
  logger.info("");
  logger.info("Or run: vaultrunner allow " + credential.itemId);
  logger.divider();
}

/**
 * Notify the user that a credential request was approved
 */
export function notifyAccessGranted(credential: CredentialInfo, remembered: boolean): void {
  if (remembered) {
    logger.granted(`Using remembered approval for: ${credential.title}`);
  } else {
    logger.granted(`Access granted for: ${credential.title}`);
  }
}

/**
 * Notify the user that they need to configure access for a new credential
 */
export function notifyFirstTimeAccess(credential: CredentialInfo): void {
  logger.divider();
  logger.prompt(`First-time access request for credential:`);
  logger.credential(credential.title, credential.username, credential.vault);
  logger.info("");
  logger.info("This credential is not yet in your access list.");
  logger.info("To approve, add to ~/.vaultrunner/access.json or run:");
  logger.step(`vaultrunner allow ${credential.itemId}`);
  logger.info("");
  logger.info("To deny permanently, run:");
  logger.step(`vaultrunner deny ${credential.itemId}`);
  logger.divider();
}
