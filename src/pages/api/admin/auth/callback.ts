import type { APIRoute } from "astro";
import { ADMIN_USERS } from "../../../../lib/adminAllowlist";
import {
  createSession,
  cookieAttributes,
  readCookie,
  SESSION_SECONDS,
} from "../../../../lib/adminSession";
import { api, isRecord } from "../../../../lib/http";
export const GET: APIRoute = ({ request, url, locals }) =>
  api(async () => {
    const { GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET, ADMIN_SESSION_SECRET } =
      locals.runtime.env;
    const state = url.searchParams.get("state"),
      cookie = readCookie(request, "admin_oauth_state");
    const headers = new Headers({ "Cache-Control": "no-store" });
    headers.append(
      "Set-Cookie",
      "admin_oauth_state=; " + cookieAttributes + "; Max-Age=0",
    );
    if (!state || !cookie || state !== cookie)
      return new Response("Invalid login state. Start login again.", {
        status: 400,
        headers,
      });
    const code = url.searchParams.get("code");
    if (!code)
      return new Response("Login cancelled or code missing", {
        status: 400,
        headers,
      });
    if (!GITHUB_CLIENT_ID || !GITHUB_CLIENT_SECRET || !ADMIN_SESSION_SECRET)
      return new Response("Login unavailable", { status: 503, headers });
    try {
      const tokenRes = await fetch(
        "https://github.com/login/oauth/access_token",
        {
          method: "POST",
          signal: AbortSignal.timeout(10_000),
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "User-Agent": "HulettCraft-Admin",
          },
          body: JSON.stringify({
            client_id: GITHUB_CLIENT_ID,
            client_secret: GITHUB_CLIENT_SECRET,
            code,
          }),
        },
      );
      const token: unknown = await tokenRes.json();
      if (
        !tokenRes.ok ||
        !isRecord(token) ||
        typeof token.access_token !== "string"
      )
        return new Response("GitHub login failed", { status: 502, headers });
      const userRes = await fetch("https://api.github.com/user", {
        signal: AbortSignal.timeout(10_000),
        headers: {
          Authorization: "Bearer " + token.access_token,
          Accept: "application/json",
          "User-Agent": "HulettCraft-Admin",
        },
      });
      const user: unknown = await userRes.json();
      if (!userRes.ok || !isRecord(user) || typeof user.login !== "string")
        return new Response("GitHub user lookup failed", {
          status: 502,
          headers,
        });
      const login = user.login.toLowerCase();
      if (!ADMIN_USERS.has(login))
        return new Response("Access denied", { status: 403, headers });
      const session = await createSession(login, ADMIN_SESSION_SECRET);
      headers.append(
        "Set-Cookie",
        "admin_session=" +
          encodeURIComponent(session) +
          "; " +
          cookieAttributes +
          "; Max-Age=" +
          SESSION_SECONDS,
      );
      headers.set("Location", "/admin/pending");
      return new Response(null, { status: 302, headers });
    } catch {
      return new Response("GitHub login temporarily unavailable", {
        status: 502,
        headers,
      });
    }
  });
