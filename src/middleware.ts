import { defineMiddleware } from "astro:middleware";
import { applicationScopeForHost } from "./config/applications";
export const onRequest = defineMiddleware(async (context, next) => {
  // Keep application trials on Pages/local hosts out of the production queue,
  // even when a preview happens to share the existing SESSION binding.
  context.locals.applicationScope = applicationScopeForHost(
    context.url.hostname,
  );
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
