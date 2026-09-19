# Compact workspace prototype

Open [workspace.html](workspace.html), or serve this directory locally:

```sh
python3 -m http.server 23442 --bind 127.0.0.1 --directory docs/product/prototypes
```

Preview: `http://127.0.0.1:23442/workspace.html`.

## Accepted design direction

One ordinary conversation, one subscription capacity surface, on-demand team and
evidence details. The expanded dashboard, duplicate capacity strip and verbose
product explanations were removed following user feedback. Desktop places capacity
in the sidebar; narrow screens expose the same detail surface through a toolbar
button. There is no second quota summary in the conversation or composer.

The artifact uses BB's canvas/ink-derived surfaces, small/base text scale and font
stack. Codex and Claude symbols are embedded copies of the actual native SVGs in
`plugins/provider-codex/icons/codex.svg` and
`plugins/provider-claude-code/icons/claude-code.svg`. Devin uses a neutral initial,
not an invented provider logo. All readings and task states are examples. Controls
never launch work or persist data.

## Native integration plan

1. **Keep the real model picker untouched.**
   `apps/app/src/components/promptbox/ExecutionControls.tsx` already renders
   `apps/app/src/components/pickers/ModelReasoningPicker.tsx`. Reuse it in place;
   do not add a plugin-owned lead/model/reasoning select. Its provider options,
   `useSystemExecutionOptions` from `apps/app/src/hooks/queries/system-queries.ts`,
   verified preview catalog handling, load errors, availability, reasoning and
   service-tier controls remain native. Provider icons arrive through registered
   provider metadata and `apps/app/src/components/plugin/ProviderIcon.tsx`, via
   `apps/app/src/lib/provider-icon.ts`. The prototype's Astra button is only a
   location marker and opens an explicit boundary note: it has no discovered
   model catalog. A real picker is deliverable only inside the app runtime.

2. **One capacity surface, owned by Provider Usage.**
   `plugins/provider-usage/app.tsx` already registers the `usage` disclosure with
   `app.experimental_sidebarFooter.register`, plus the `usage` settings section.
   Extend/reuse that existing disclosure instead of registering a second factory
   capacity widget. It fetches `provider-usage/rpc/getUsage`, validates with
   `usageRpcSuccessSchema`, and consumes the aggregate resources supplied through
   `provider-usage.v1.listResources` implementations. Reuse its store and freshness
   handling; do not introduce a second polling loop, auth store or quota total.
   Retain provider-unit windows, selected machine/pool, observation/reset times,
   deduplication and unknown/auth/error states. Full subscription settings remain
   in `plugins/provider-usage/settings.tsx`. Exact narrow-screen placement must
   follow the native footer/disclosure shell rather than duplicate data.

3. **Only team and execution are additional composer controls.**
   Use `app.composer.customize({ actions: [...] })`, with `useComposerView` for
   scope/run state, as demonstrated in
   `examples/plugins/composer-customization/app.tsx`. Keep the native picker in
   its current position. Team and Auto/Direct/Delegate modify the next task's
   policy; they must not rewrite historical assignments or change the lead when
   a worker changes. Eligibility is server-owned. If the accepted placement
   needs a host layout adjustment, document that small core change explicitly.

4. **Native task activity, with evidence on demand.**
   `plugins/workflows/src/app.tsx` demonstrates `app.slots.messageDirective`,
   `app.slots.threadPanelAction({ layout: "flush" })`, and a bare composer banner
   through `app.composer.customize`. Reuse those extension patterns and native
   shared activity/workflow controls; do not infer task acceptance from a
   workflow completing. A trusted task directive displays the compact record;
   its panel opens task requirements, attempts, review and evidence. Native
   navigation opens actual worker threads and workspace diffs.

   The prospective bbfactory contract source is
   `plugins/factory/tasks/shared.ts` (`factoryRpcContract`), with `app.tsx` and
   `server.ts` in that directory. These are concurrent implementation work in
   the `factory-slice` worktree, **not accepted APIs or files present on this
   prototype branch**. Bind to the reviewed task/attempt/evidence records after
   correctness acceptance; do not freeze the design around provisional RPC
   names. Required checks must identify immutable final content, spec/check
   versions, environment, exit status and logs. Review findings and worker
   completion remain separate from acceptance. SDK/CLI parity belongs to that
   integration, not this standalone HTML.

5. **Use the real responsive details component.**
   `packages/shared-ui/src/components/ui/popover.tsx` and `drawer.tsx` provide the
   app's compact interaction behavior. Use the shared persistent responsive
   drawer and its deferred/retained realization. The HTML slide-out illustrates
   content and focus return only. Keep BB browser, desktop, plugin and workspace
   capabilities; no demo target app or simulated preview is added.

## Rendered checks

Chromium at 1440×960 and 390×844: inspected conversation, single capacity surface,
mobile subscription drawer and fixed composer. Checked execution selection, team
preferences, pending/verified/stale evidence, local example-message entry, no
substitute model catalog, Escape and trigger-focus restoration. No horizontal
page overflow at 390px, browser errors or warnings. The real provider catalog,
native drawer, Electron and iOS Safari remain untested integration boundaries.

See [deviations](../../tmp/2026.09.19_ui-prototypes_deviations.md).
