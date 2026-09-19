# Provider usage

Shows usage from enabled usage-source plugins in the sidebar. Provider tabs
use provider names and icons, with pooled accounts stacked under each provider.
The card lists account metadata cheaply, then fetches only the selected provider’s accounts. Unopened tabs have no quota badge until measured. Shared sources such as Account Pooler are selected by default; an explicit
machine selection shows that machine’s local usage instead.

An unconfigured shared source remains selectable and shows setup guidance.
Failed refreshes retain the last available measurements with a retry notice.
Account authentication failures and plans without reported limits have separate
states; unavailable usage is never represented as zero consumption.

Each host machine also lists every registered provider visible there, even
when no usage source reports it: a provider whose plugin is disabled or whose
bridge reports it not installed on that machine is simply absent, while a
listed provider without a source resource shows **Limits unavailable** — no
usage is measured through this surface, which is not evidence of zero or
unlimited remaining quota. A covered resource that has not been fetched yet
shows **Not measured yet** instead; the two states are distinct. A listed row
reflects registry visibility only — it is not proof of installation or
authenticated execution, and it stays separate from the account-level
sign-in and expiry states a measured source can report.

Settings → Installed plugins → Provider usage contains the usage page, using its
full-size provider groups with email-labeled accounts and fetching only resources in the selected pool or machine. Both surfaces share the plugin’s aggregation and cache. Neither display is required for source
plugins to publish their usage.

Use `bb plugin rpc list --method provider-usage.v1.listResources --json` to find sources
and `bb plugin rpc inspect <plugin-id> provider-usage.v1.listResources --json`
to inspect their published contracts. The aggregate snapshot is the plugin's
`getUsage` method: `bb plugin rpc call provider-usage getUsage
--input-file request.json --json` with
`{"force":false,"machineIds":null,"providerId":null,"maxAgeMs":60000}` lists
machines and providers without fetching measurements; a `providerId` selects
the resource to measure. RPC calls accept JSON through
`--input-file`. See the Plugin Guide for the contract API.

`bb settings usage --json` and `bb.sdk.system.usageLimits()` remain the
host-local provider-maintenance view; they do not aggregate shared pool accounts.

Codex, Claude Code, and ACP provider plugins explicitly implement the usage contract
for their own providers. Account Pooler implements it for shared accounts. The
contract is owned here and copied into each source; no additional adapter plugin,
provider-kit helper, or core runtime convention is required. Other providers must
explicitly implement the contract to report usage in these displays.

Known provider-issued account identities are deduplicated within the selected
location. Unknown identities are never merged by email. Structured plan and quota
window metadata give both displays consistent labels.

Provider Usage is enabled by default for newly registered installations. Existing
explicit enable/disable choices are preserved. Right-click the footer shortcut and
choose **Hide** to move it into **More**. Settings → Appearance → Sidebar footer
controls order and visibility for every footer action. The usage settings page
remains available. These preferences belong to BB, not the plugin.

Leads can inspect all subscriptions with `bb usage limits [--force] [--json]`
or the discoverable `readLimits` RPC.
They reuse this aggregate with bounded collection across all eligible providers
and preserve source observation times, fetch times and failed-refresh markers.
See [the usage skill](skills/provider-usage/SKILL.md) for the request and freshness
contract. This does not change the sidebar's lazy selected-provider collection.
