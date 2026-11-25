// Reference tool's same-origin API client. Every WarEra request passes through the application's existing proxy,
// which keeps server API keys out of the browser and rotates them when needed. Optional visitor keys stay in this
// browser and are forwarded only to the same-origin proxy. Calls are batched up to 50 and rate-limited locally.
"use strict";

const WarEraApi = (() => {
  const BASE = "/api/warera-proxy";
  const RELAY = "/api/warera-proxy";
  const RELAYED = new Set([
    "employee.getCompanyEmployees",
    "employee.getCompanyEstimate",
    "transaction.getPaginatedTransactions",
  ]);
  const POLAND = "6813b6d446e731854c7ac7ae"; // the relay's only country (warera/relay.py POLAND)
  const MAX_BATCH = 50;
  const WINDOW = 60000;
  const ATTEMPTS = 5; // waits 1, 2, 4, 8 s between tries (the relay's Retry-After when it gives one)
  const OBJECT_ID = /^[0-9a-f]{24}$/i;
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  class ApiError extends Error {
    constructor(status, procedure, detail, relayCode) {
      const text =
        relayCode === "RELAY_NOT_POLISH"
          ? I18N.t("relay.notPolish")
          : relayCode === "RELAY_LIMIT" || relayCode === "RELAY_BUSY"
            ? I18N.t("relay.busy")
            : status === 401
              ? I18N.t("api.needsToken")
              : status === 403
                ? I18N.t("api.refused")
                : I18N.t("api.failed", procedure, detail || "HTTP " + status);
      super(text);
      this.status = status;
      this.relayCode = relayCode || null;
    }
  }
  const relayCodeOf = (body) => {
    const code = (((body || {}).error || {}).data || {}).code;
    return typeof code === "string" && code.startsWith("RELAY_") ? code : null;
  };

  class Client {
    constructor(token, perMinute) {
      this.token = token || "";
      this.perMinute = perMinute || (this.token ? 200 : 100);
      this.sent = [];
      this.requests = 0;
    }

    async slot() {
      for (;;) {
        const now = Date.now();
        this.sent = this.sent.filter((t) => now - t < WINDOW);
        if (this.sent.length < this.perMinute) {
          this.sent.push(now);
          this.requests += 1;
          return;
        }
        await sleep(WINDOW - (now - this.sent[0]) + 50);
      }
    }

    // true when this call goes to the site's relay: no token, and it needs one
    relays(procedure) {
      return !this.token && RELAYED.has(procedure);
    }

    // whether the employees of this player (a user record) can be read: with a token, or through the relay
    canReadEmployees(user) {
      // Every call is relayed through the application's server-side token pool.
      return true;
    }

    base(procedure) {
      return new URL(this.relays(procedure) ? RELAY : BASE, location.href).href + `?path=${encodeURIComponent(procedure)}`;
    }

    async get(url, procedure, batch) {
      const relayed = this.relays(procedure);
      let last = "",
        wait = null,
        relayCode = null;
      for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
        if (attempt) await sleep(wait ?? 1000 * 2 ** (attempt - 1));
        wait = null;
        await this.slot();
        let response, body;
        try {
          // the relay is this site (beta's login goes with it); the API never gets the site's cookies or login
          response = await fetch(url, {
            headers: this.token ? { "x-user-api-key": this.token } : {},
            cache: "no-store",
            credentials: relayed ? "same-origin" : "omit",
            referrerPolicy: "no-referrer",
          });
        } catch (error) {
          last = String(error);
          continue;
        }
        if (response.status === 429 || response.status >= 500) {
          last = `HTTP ${response.status}`;
          if (relayed) {
            const after = Number(response.headers.get("Retry-After"));
            if (after > 0) wait = Math.min(after, 60) * 1000;
            try {
              relayCode = relayCodeOf(await response.json()) || relayCode;
            } catch {
              /* not JSON */
            }
          }
          continue;
        }
        try {
          body = await response.json();
        } catch {
          last = "not JSON";
          continue;
        }
        // a batch whose calls all found nothing comes back 404 with each call's NOT_FOUND
        if (
          response.ok ||
          (batch && response.status === 404 && Array.isArray(body))
        )
          return body;
        const message = batch ? "" : ((body || {}).error || {}).message;
        throw new ApiError(
          response.status,
          procedure,
          message,
          relayed ? relayCodeOf(body) : null,
        );
      }
      throw new ApiError(
        0,
        procedure,
        I18N.t("api.noAnswer", ATTEMPTS, last),
        relayCode,
      );
    }

    async call(procedure, params) {
      const url = new URL(this.base(procedure));
      if (params !== undefined) url.searchParams.set("input", JSON.stringify(params));
      const body = await this.get(url, procedure, false);
      return body.result.data;
    }

    // One procedure with many inputs: each call's data, or null when it found nothing or failed.
    async callBatch(procedure, paramsList) {
      const results = [];
      for (let start = 0; start < paramsList.length; start += MAX_BATCH) {
        const chunk = paramsList.slice(start, start + MAX_BATCH);
        const inputs = Object.fromEntries(chunk.map((p, i) => [String(i), p]));
        const url = new URL(this.base(chunk.map(() => procedure).join(",")));
        url.searchParams.set("batch", "1");
        url.searchParams.set("input", JSON.stringify(inputs));
        const answers = await this.get(url, procedure, true);
        for (const answer of answers)
          results.push(((answer || {}).result || {}).data ?? null);
      }
      return results;
    }

    // [user ID, username as in the game] for a username in any case, or a user ID.
    async findUser(text) {
      const name = text.trim();
      if (OBJECT_ID.test(name)) {
        const [user] = await this.callBatch("user.getUserLite", [
          { userId: name },
        ]);
        if (user) return [name, user.username];
        throw new Error(I18N.t("api.noId", name));
      }
      const ids =
        ((await this.call("search.searchAnything", { searchText: name })) || {})
          .userIds || [];
      const users = ids.length
        ? await this.callBatch(
            "user.getUserLite",
            ids.map((userId) => ({ userId })),
          )
        : [];
      const found = ids.findIndex(
        (_, i) =>
          users[i] && users[i].username.toLowerCase() === name.toLowerCase(),
      );
      if (found < 0) throw new Error(I18N.t("api.notFound", name));
      return [ids[found], users[found].username];
    }
  }

  return { Client, ApiError, POLAND };
})();
