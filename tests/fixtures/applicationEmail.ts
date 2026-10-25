// Documented Cloudflare REST API outcomes, with synthetic account/recipient data.
export const emailTestAccount = "a".repeat(32);
export const cloudflareEmailPath = `/client/v4/accounts/${emailTestAccount}/email/sending/send`;
export const cloudflareQueued = {
  success: true,
  errors: [],
  messages: [],
  result: {
    delivered: [],
    permanent_bounces: [],
    queued: ["support@hulettcraft.com"],
  },
};
export const cloudflareDelivered = {
  ...cloudflareQueued,
  result: {
    delivered: ["support@hulettcraft.com"],
    permanent_bounces: [],
    queued: [],
  },
};
