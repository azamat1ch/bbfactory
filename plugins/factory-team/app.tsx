import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  type PluginAppBuilder,
  experimental_ProviderModelPicker as ProviderModelPicker,
  useComposer,
  useComposerView,
  useRealtime,
  useRpc,
  type ExperimentalProviderModelPickerRouting,
  type ExperimentalProviderModelPickerValue,
} from "@get-bb/plugin-sdk/app";
import { Popover, PopoverContent, PopoverTrigger } from "@bb/shared-ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import {
  preferenceSchema,
  profileSchema,
  scopeSchema,
  TEAM_CHANGED,
  type TeamPreference,
  type TeamScope,
  type TeamView,
  type teamRpcContract,
} from "./shared.js";
import "./app.css";

const EMPTY_PROFILE: ExperimentalProviderModelPickerValue = {
  providerId: "",
  model: "",
  reasoningLevel: "medium",
};
const MODES = [
  {
    value: "auto",
    label: "Auto",
    description: "Let the lead decide when and whom to delegate to.",
  },
  { value: "off", label: "Off", description: "The lead works directly." },
  {
    value: "selected",
    label: "Selected implementers",
    description: "Choose the profiles the lead can delegate to.",
  },
] as const;

function labelFor(preference: TeamPreference) {
  return preference.mode === "auto"
    ? "Auto"
    : preference.mode === "off"
      ? "Off"
      : `${preference.profiles.length} ${preference.profiles.length === 1 ? "profile" : "profiles"}`;
}

function TeamEditor({ scope }: { scope: TeamScope }) {
  const rpc = useRpc<typeof teamRpcContract>();
  const composer = useComposer();
  const composerView = useComposerView();
  const [view, setView] = useState<TeamView | null>(null);
  const [draft, setDraft] = useState<TeamPreference | null>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [changed, setChanged] = useState(false);
  const [remember, setRemember] = useState(true);
  const [routing, setRouting] =
    useState<ExperimentalProviderModelPickerRouting>();
  const [seed, setSeed] = useState(EMPTY_PROFILE);
  const [candidate, setCandidate] =
    useState<ExperimentalProviderModelPickerValue | null>(null);
  const active = useRef(true);
  const opening = useRef(false);
  const loadVersion = useRef(0);

  const load = useCallback(async () => {
    const version = ++loadVersion.current;
    try {
      const next = await rpc.call("get", { scope });
      if (!active.current || version !== loadVersion.current) return;
      setView(next);
      setDraft(next.preference);
      if (scope.kind === "thread")
        setRouting(
          next.environmentId
            ? { kind: "environment", environmentId: next.environmentId }
            : undefined,
        );
      setError(null);
      setChanged(false);
    } catch (cause) {
      if (active.current && version === loadVersion.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [rpc, scope]);

  useEffect(() => {
    active.current = true;
    void load();
    return () => {
      active.current = false;
      loadVersion.current++;
    };
  }, [load]);
  useRealtime(TEAM_CHANGED, (payload) => {
    const signal = scopeSchema.safeParse(payload);
    if (
      !signal.success ||
      (signal.data.kind !== "user" &&
        (signal.data.kind !== scope.kind || signal.data.id !== scope.id))
    )
      return;
    if (open || busy) setChanged(true);
    else void load();
  });

  async function changeOpen(nextOpen: boolean) {
    if (busy || opening.current) return;
    if (!nextOpen) {
      setOpen(false);
      return;
    }
    if (view) setDraft(view.preference);
    setCandidate(null);
    setError(null);
    setChanged(false);
    if (scope.kind === "project") {
      setRouting(undefined);
      setSeed(EMPTY_PROFILE);
      opening.current = true;
      setBusy(true);
      try {
        const selection = await composer.experimental_setSelection({});
        if (!active.current) return;
        const environment = selection.environment;
        if (environment?.type === "reuse")
          setRouting({
            kind: "environment",
            environmentId: environment.environmentId,
          });
        else if (environment?.type === "host" && environment.hostId)
          setRouting({ kind: "host", hostId: environment.hostId });
        else if (
          environment?.type === "provider" &&
          environment.machine?.type === "existing"
        )
          setRouting({ kind: "host", hostId: environment.machine.hostId });
        else
          throw new Error(
            "Choose an existing machine or environment before selecting implementers.",
          );
        setSeed(
          selection.providerId && selection.model
            ? {
                providerId: selection.providerId,
                model: selection.model,
                reasoningLevel: selection.reasoningLevel ?? "medium",
                ...(selection.serviceTier
                  ? { serviceTier: selection.serviceTier }
                  : {}),
              }
            : EMPTY_PROFILE,
        );
      } catch (cause) {
        if (active.current)
          setError(cause instanceof Error ? cause.message : String(cause));
      } finally {
        opening.current = false;
        if (active.current) setBusy(false);
      }
    }
    if (active.current) setOpen(true);
  }

  async function save() {
    if (!draft || !view || busy) return;
    const parsed = preferenceSchema.safeParse(draft);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Choose a valid team.");
      return;
    }
    setBusy(true);
    composer.setInputLock(true);
    ++loadVersion.current;
    try {
      const saved = await rpc.call("set", {
        scope,
        preference: parsed.data,
        expectedRevision: view.revision,
        remember,
      });
      if (!active.current) return;
      setView({ ...view, ...saved });
      setDraft(saved.preference);
      setChanged(false);
      setError(null);
      setOpen(false);
    } catch (cause) {
      if (active.current)
        setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      composer.setInputLock(false);
      if (active.current) setBusy(false);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(value) => {
        void changeOpen(value);
      }}
    >
      <PopoverTrigger asChild>
        <button
          type="button"
          className="factory-team-trigger"
          disabled={busy || composerView.run.isSubmitting}
          aria-label={`Team: ${view ? labelFor(view.preference) : error ? "unavailable" : "loading"}`}
        >
          <Icon name="Workflow" className="size-3.5" />
          Team: {view ? labelFor(view.preference) : error ? "unavailable" : "…"}
          <Icon name="ChevronDown" className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="factory-team-menu w-80 p-3"
        aria-label="Team preferences"
      >
        <label className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <input type="checkbox" checked={remember} disabled={busy} onChange={(event) => setRemember(event.target.checked)} />
          Remember for new chats
        </label>
        <div className="mb-3 text-xs text-muted-foreground">
          {scope.kind === "thread"
            ? "Team for this conversation; remembered choices apply to new chats"
            : "Default team for new conversations in this project"}
        </div>
        {draft ? (
          <>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full justify-between"
                  disabled={busy}
                  aria-label="Team mode"
                >
                  {MODES.find((mode) => mode.value === draft.mode)?.label}
                  <Icon name="ChevronDown" className="size-3.5" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="factory-team-modes w-72"
              >
                {MODES.map((mode) => (
                  <DropdownMenuItem
                    key={mode.value}
                    onSelect={() => {
                      setDraft({ ...draft, mode: mode.value });
                      setCandidate(null);
                      setError(null);
                    }}
                  >
                    <span className="flex-1">
                      <span className="block text-sm font-medium">
                        {mode.label}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {mode.description}
                      </span>
                    </span>
                    {draft.mode === mode.value ? (
                      <Icon name="Check" className="size-3.5" />
                    ) : null}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {draft.mode === "selected" ? (
              <div className="mt-3 space-y-2 border-t pt-3">
                {draft.profiles.map((profile, index) => (
                  <div className="flex min-w-0 items-center gap-1" key={index}>
                    <ProviderModelPicker
                      value={profile}
                      routing={routing}
                      disabled={busy || !routing}
                      onChange={(value) => {
                        setError(null);
                        setDraft((current) =>
                          current
                            ? {
                                ...current,
                                profiles: current.profiles
                                  .map((item, i) =>
                                    i === index ? value : item,
                                  )
                                  .filter(
                                    (item, i) =>
                                      i === index ||
                                      item.providerId !== value.providerId ||
                                      item.model !== value.model,
                                  ),
                              }
                            : current,
                        );
                      }}
                      className="min-w-0 flex-1"
                    />
                    <button
                      type="button"
                      className="factory-team-remove"
                      aria-label={`Remove implementer ${index + 1}`}
                      disabled={busy}
                      onClick={() =>
                        setDraft({
                          ...draft,
                          profiles: draft.profiles.filter(
                            (_, i) => i !== index,
                          ),
                        })
                      }
                    >
                      <Icon name="X" className="size-3.5" />
                    </button>
                  </div>
                ))}
                {candidate ? (
                  <div className="factory-team-candidate space-y-2 rounded-md border p-2">
                    <ProviderModelPicker
                      value={candidate}
                      routing={routing}
                      disabled={busy || !routing}
                      onChange={setCandidate}
                      className="w-full"
                    />
                    {draft.profiles.some(
                      (profile) =>
                        profile.providerId === candidate.providerId &&
                        profile.model === candidate.model,
                    ) ? (
                      <p
                        role="status"
                        className="text-xs text-muted-foreground"
                      >
                        Already selected. Choose another model.
                      </p>
                    ) : null}
                    <div className="flex justify-end gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setCandidate(null)}
                      >
                        Dismiss
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={
                          busy ||
                          !routing ||
                          !profileSchema.safeParse(candidate).success ||
                          draft.profiles.some(
                            (profile) =>
                              profile.providerId === candidate.providerId &&
                              profile.model === candidate.model,
                          )
                        }
                        onClick={() => {
                          setDraft({
                            ...draft,
                            profiles: [...draft.profiles, candidate],
                          });
                          setCandidate(null);
                          setError(null);
                        }}
                      >
                        Add to team
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={busy || !routing || draft.profiles.length >= 32}
                    onClick={() => setCandidate(seed)}
                  >
                    <Icon name="Plus" className="size-3.5" /> Add implementer
                  </Button>
                )}
                {!routing ? (
                  <p className="text-xs text-muted-foreground">
                    An existing machine or environment is needed to load its
                    models.
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 text-xs text-muted-foreground">
              Your message can override this for a task. Saving doesn’t start
              workers or change the lead.
            </p>
          </>
        ) : null}
        {error ? (
          <p role="alert" className="mt-3 text-xs text-destructive">
            {error}
          </p>
        ) : null}
        {changed ? (
          <p role="status" className="mt-3 text-xs text-muted-foreground">
            Team preferences changed. Reload before saving.
          </p>
        ) : null}
        <div className="mt-3 flex justify-end gap-2">
          {error || changed || !view ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy}
              onClick={() => {
                void load();
              }}
            >
              Reload
            </Button>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={busy}
            onClick={() => setOpen(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={
              !view ||
              !draft ||
              busy ||
              changed ||
              candidate !== null ||
              (draft.mode === "selected" && !routing) ||
              !preferenceSchema.safeParse(draft).success
            }
            onClick={() => {
              void save();
            }}
          >
            {busy ? "Saving…" : "Save"}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function TeamAction() {
  const { scope } = useComposerView();
  const kind = scope.kind;
  const id =
    scope.kind === "thread"
      ? scope.threadId
      : scope.kind === "new-thread"
        ? scope.projectId
        : null;
  const target = useMemo<TeamScope | null>(
    () => (id ? { kind: kind === "thread" ? "thread" : "project", id } : null),
    [kind, id],
  );
  return target ? (
    <TeamEditor key={`${target.kind}:${target.id}`} scope={target} />
  ) : null;
}

export function registerFactoryTeamUi(app: PluginAppBuilder) {
  app.composer.customize({
    id: "team",
    scopes: ["thread", "new-thread"],
    actions: [{ id: "team", component: TeamAction }],
  });
}

export default definePluginApp(registerFactoryTeamUi);
