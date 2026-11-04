// Separate Email Routing Worker. Personal recipients exist only in its Secret.
import {
  isApplicationNotification,
  APPLICATION_FORWARDING_HEADER,
} from "../../src/lib/applicationForwarding";
export interface ForwardingEnv {
  SUPPORT_FORWARD_TO?: string;
  APPLICATION_FORWARDING_SECRET?: string;
}
export interface SupportMessage {
  readonly to: string;
  readonly headers: Headers;
  forward(address: string): Promise<unknown>;
  setReject(reason: string): void;
}
const aliases = new Set([
  "support@hulettcraft.com",
  "support-forwarding-test@hulettcraft.com",
]);

export function forwardingDestinations(value: string | undefined): string[] {
  if (!value || value.length > 2600 || /[\r\n]/.test(value))
    throw new Error("Invalid support forwarding configuration");
  const addresses = value
    .split(",")
    .map((address) => address.trim().toLowerCase());
  if (
    addresses.length > 10 ||
    !addresses.every((address) => {
      const [local, domain] = address.split("@");
      return (
        address.length <= 254 &&
        local.length <= 64 &&
        !local.startsWith(".") &&
        !local.endsWith(".") &&
        !local.includes("..") &&
        /^[a-z0-9.!#$%&'*+\/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/i.test(
          address,
        ) &&
        domain !== "hulettcraft.com" &&
        !domain.endsWith(".hulettcraft.com")
      );
    })
  )
    throw new Error("Invalid support forwarding configuration");
  return [...new Set(addresses)];
}

export default {
  async email(message: SupportMessage, env: ForwardingEnv): Promise<void> {
    if (!aliases.has(message.to.toLowerCase())) {
      message.setReject("This Worker only handles HulettCraft support mail.");
      return;
    }
    let destinations: string[];
    try {
      destinations = forwardingDestinations(env.SUPPORT_FORWARD_TO);
    } catch {
      // Never log recipient addresses, provider errors, headers or email contents.
      console.error("Support forwarding configuration is unavailable.");
      message.setReject("Support forwarding is temporarily unavailable.");
      return;
    }
    // The first inbox receives every support email. Additional inboxes receive
    // only messages bearing a valid marker created by the website's private key.
    const application = await isApplicationNotification(
      env.APPLICATION_FORWARDING_SECRET,
      message.headers.get(APPLICATION_FORWARDING_HEADER),
      message.headers.get("Subject"),
    );
    if (!application) destinations = destinations.slice(0, 1);
    // Attempt every selected destination even if one rejects. Forward the original message;
    // never turn its body, sender or headers into a new recipient list.
    const results = await Promise.allSettled(
      destinations.map(async (address) => message.forward(address)),
    );
    const failedSlots = results.flatMap((result, index) =>
      result.status === "rejected" ? [index + 1] : [],
    );
    if (failedSlots.length) {
      console.error("Support forwarding incomplete.", {
        requested: destinations.length,
        failedSlots,
      });
      // Surface failure to Cloudflare. This is not an atomic delivery or a retry
      // queue: some inboxes may already have received a copy. Check before resend.
      throw new Error(
        "Support forwarding incomplete; inspect recipient inboxes.",
      );
    }
    console.info("Support forwarding completed.", {
      forwarded: destinations.length,
    });
  },
};
