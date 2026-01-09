import { execa } from "execa";

export interface VaultInfo {
  id: string;
  name: string;
}

export interface LoginItem {
  id: string;
  title: string;
  username: string;
  vault: string;
}

export interface Credentials {
  username: string;
  password: string;
}

/**
 * Wrapper for the 1Password CLI (`op` command)
 */
export class OnePasswordCLI {
  /**
   * Check if the 1Password CLI is installed and the vault is unlocked
   */
  async getStatus(): Promise<{ unlocked: boolean; accounts: string[] }> {
    try {
      const { stdout } = await execa("op", ["account", "list", "--format=json"]);
      const accounts = JSON.parse(stdout) as Array<{ email: string }>;

      // Try to list vaults to verify we're authenticated
      await execa("op", ["vault", "list", "--format=json"]);

      return {
        unlocked: true,
        accounts: accounts.map((a) => a.email),
      };
    } catch (error) {
      // If the command fails, vault is likely locked or CLI not installed
      return {
        unlocked: false,
        accounts: [],
      };
    }
  }

  /**
   * List all vaults
   */
  async listVaults(): Promise<VaultInfo[]> {
    const { stdout } = await execa("op", ["vault", "list", "--format=json"]);
    const vaults = JSON.parse(stdout) as Array<{ id: string; name: string }>;
    return vaults.map((v) => ({ id: v.id, name: v.name }));
  }

  /**
   * List login items for a specific domain
   */
  async listLoginsForDomain(domain: string): Promise<LoginItem[]> {
    try {
      // Search for items with the domain in the URL
      const { stdout } = await execa("op", [
        "item",
        "list",
        "--categories=Login",
        "--format=json",
      ]);

      const items = JSON.parse(stdout) as Array<{
        id: string;
        title: string;
        vault: { name: string };
        urls?: Array<{ href: string }>;
      }>;

      // Filter items that match the domain
      const matchingItems = items.filter((item) => {
        if (!item.urls) return false;
        return item.urls.some((url) => {
          try {
            // Handle URLs that may or may not have a protocol
            let href = url.href;
            if (!href.includes("://")) {
              href = "https://" + href;
            }
            const hostname = new URL(href).hostname;
            return hostname.includes(domain) || domain.includes(hostname);
          } catch {
            // Fallback: simple string matching if URL parsing fails
            return url.href.toLowerCase().includes(domain.toLowerCase());
          }
        });
      });

      // Get username for each matching item
      const loginsWithUsernames = await Promise.all(
        matchingItems.map(async (item) => {
          const username = await this.getItemField(item.id, "username");
          return {
            id: item.id,
            title: item.title,
            username: username || "Unknown",
            vault: item.vault.name,
          };
        })
      );

      return loginsWithUsernames;
    } catch (error) {
      console.error("Error listing logins:", error);
      return [];
    }
  }

  /**
   * Get a specific field from an item (without exposing password to logs)
   */
  private async getItemField(
    itemId: string,
    field: string
  ): Promise<string | null> {
    try {
      const { stdout } = await execa("op", [
        "item",
        "get",
        itemId,
        `--fields=${field}`,
        "--format=json",
      ]);
      const result = JSON.parse(stdout);
      return result.value || null;
    } catch {
      return null;
    }
  }

  /**
   * Get credentials for a specific item
   * WARNING: This returns sensitive data - handle with care!
   */
  async getCredentials(itemId: string): Promise<Credentials | null> {
    try {
      const { stdout } = await execa("op", [
        "item",
        "get",
        itemId,
        "--fields=username,password",
        "--format=json",
      ]);

      const fields = JSON.parse(stdout) as Array<{
        id: string;
        value: string;
      }>;

      const username = fields.find((f) => f.id === "username")?.value || "";
      const password = fields.find((f) => f.id === "password")?.value || "";

      return { username, password };
    } catch (error) {
      console.error("Error getting credentials:", error);
      return null;
    }
  }

  /**
   * Get item info (title, username, vault) for access control
   * Does NOT return password
   */
  async getItemInfo(itemId: string): Promise<{ title: string; username: string; vault: string } | null> {
    try {
      const { stdout } = await execa("op", [
        "item",
        "get",
        itemId,
        "--format=json",
      ]);

      const item = JSON.parse(stdout) as {
        title: string;
        vault: { name: string };
        fields?: Array<{ id: string; value: string }>;
      };

      const username = item.fields?.find((f) => f.id === "username")?.value || "Unknown";

      return {
        title: item.title,
        username,
        vault: item.vault.name,
      };
    } catch (error) {
      console.error("Error getting item info:", error);
      return null;
    }
  }

  /**
   * Get TOTP code for a specific item
   * TOTP codes are short-lived (30 seconds) so exposure risk is lower
   */
  async getTOTP(itemId: string): Promise<string | null> {
    try {
      const { stdout } = await execa("op", [
        "item",
        "get",
        itemId,
        "--otp",
      ]);
      return stdout.trim();
    } catch (error) {
      console.error("Error getting TOTP:", error);
      return null;
    }
  }
}

// Singleton instance
export const onePasswordCLI = new OnePasswordCLI();
