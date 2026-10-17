import { defineMiddleware } from "astro:middleware";
export const onRequest = defineMiddleware(async (context, next) => {
  const response = await next();
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  if (!response.headers.has("Content-Security-Policy"))
    response.headers.set(
      "Content-Security-Policy",
      "frame-ancestors 'none'; base-uri 'self'; object-src 'none'",
    );
  if (
    context.url.pathname.startsWith("/admin") ||
    context.url.pathname.startsWith("/api/admin")
  ) {
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.append("Vary", "Cookie");
  } else if (response.status >= 400)
    response.headers.set("Cache-Control", "no-store");
  return response;
});
