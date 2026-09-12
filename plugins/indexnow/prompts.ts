/**
 * `indexnow.get-indexed` — tier 4's other half (P4, docs/10 §4.2).
 *
 * A prompt is not a tool: it returns the opening turn of a conversation, which the agent then carries out
 * with the tools it already has. This one exists because "why is my site not in Bing yet" is the question
 * this plugin gets asked, and the answer is a five-step order of operations that is easy to get wrong in
 * exactly one way — pinging before the key file is live, which spends the ping on a 403.
 *
 * It names the steps and the calls rather than doing them, because every one of them is a call the agent
 * can already make and two of them need a human: the real origin, and the push.
 */
import type { PluginPromptsModule } from "@snypd/core";

interface Options { key: string; endpoint?: string }

export default {
  prompts: [
    { name: "get-indexed",
      description: "Get this site into the search engines that speak IndexNow — Bing, Yandex, Seznam and Naver. Walks the order that works: the real origin, the key file live, then the ping.",
      arguments: [{ name: "urls", description: "Only these pages, comma-separated, instead of the whole site", required: false }],
      render(args, ctx) {
        const o = ctx.options as unknown as Options;
        const site = ctx.site.url.replace(/\/+$/, "");
        const placeholder = /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/.test(site);
        const only = typeof args.urls === "string" && args.urls.trim()
          ? args.urls.split(",").map((u) => u.trim()).filter(Boolean)
          : undefined;
        return [
          `Get **${ctx.site.name}** indexed over IndexNow. Do these in order and stop at the first one that cannot be done.`,
          "",
          `**1. The origin has to be real.** This site's \`site.url\` is \`${ctx.site.url}\`.${placeholder
            ? " That is a placeholder, and no search engine can fetch a key file from it — this is the step that needs a person. Ask them for the domain the site is served from, set it with `site` › set_config `site.url`, and say that nothing after this works until it is set."
            : " That is a real origin, so carry on."}`,
          "",
          `**2. The key file has to be live.** This plugin emits \`indexnow/${o.key}.txt\` into \`dist/\` on every build, and IndexNow verifies it by fetching \`${site}/indexnow/${o.key}.txt\` before it accepts a single URL. Run \`site\` › build and confirm the file is in \`dist/\`. If the host builds this site from git, it is live only after a push that the host has finished building — check \`snypd://indexnow/last\` for what the last attempt said.`,
          "",
          "**3. Push, if anything is unpushed.** `site` › push asks a human to put the site live; the push fires this plugin's `push` event, which pings whatever the sent commits changed. If that ping succeeded, you are done — say which URLs went and stop.",
          "",
          `**4. Ping, if step 3 did not.** \`indexnow\` › ping${only ? ` with \`urls: ${JSON.stringify(only)}\`` : " with no arguments, which submits every page this site publishes"}. Find it with \`find_tools\` if it is not in your list yet.`,
          "",
          "**5. Read the answer, and do not repeat it.** A `403` or `422` means the key file is not fetchable yet — go back to step 2 rather than pinging again. A `429` means wait. A `200` means accepted, which is not the same as indexed: crawling is the engine's decision and its timing, and there is nothing further to do here. Tell them which of those happened in one sentence.",
        ].join("\n");
      } },
  ],
} satisfies PluginPromptsModule;
