"use client";

import React, { FormEvent, useEffect, useState } from "react";
import { apiBaseUrl, apiRequest, ApiRequestError, createTenant, hasApiBaseUrl, setUnauthorizedHandler } from "./api-client";

type RouteName = "login" | "dashboard" | "tenants" | "tenant-new" | "tenant-detail" | "tenant-secrets" | "tenant-tests";
type ApiStatus = "checking" | "online" | "offline";
type AuthStatus = "checking" | "authenticated" | "unauthenticated";
type RequestState = { status: "idle" | "loading" | "success" | "error"; message: string };

interface HealthResponse {
  ok: boolean;
  service: string;
  environment: string;
  encryptionConfigured?: boolean;
  adminAuthConfigured?: boolean;
  dattoExecutionGloballyEnabled?: boolean;
}

interface TenantSummary {
  id: string;
  name: string;
  slug: string;
  status: "active" | "disabled";
  webhookUrl: string;
  configuration: {
    bmsConfigured: boolean;
    bmsWebhookConfigured: boolean;
    dattoConfigured: boolean;
  };
  executionMode: "dry_run" | "live";
  lastTestStatus: string | null;
}

interface TenantSettings {
  executionMode: "dry_run" | "live";
  dattoExecutionEnabled: boolean;
  serverAutomationEnabled: boolean;
  maxRunsPerDevicePerDay: number;
  bmsDefaultQueue: string | null;
  bmsAutomationReviewQueue: string | null;
  bmsHumanReviewQueue: string | null;
  bmsSecurityQueue: string | null;
}

interface TenantSecretStatus {
  secretName: string;
  configured: boolean;
  lastFour: string | null;
  updatedAt: string | null;
}

interface IntegrationTestRun {
  id: string;
  testType: string;
  status: string;
  message: string;
  durationMs: number;
  createdAt: string;
}

interface TenantWebhookEvent {
  id: string;
  eventType: string;
  status: string;
  reason: string | null;
  createdAt: string;
}

interface TicketEvaluation {
  id: string;
  externalTicketId: string | null;
  title: string;
  detectedIntent: string;
  confidence: number;
  outcome: string;
  createdAt: string;
}

interface DryRunCandidate {
  id: string;
  ticketEvaluationId: string;
  componentId: string;
  status: string;
  createdAt: string;
}

const navItems: Array<{ route: RouteName; href: string; label: string }> = [
  { route: "dashboard", href: "/admin", label: "Dashboard" },
  { route: "tenants", href: "/admin/tenants", label: "Tenants" },
  { route: "tenant-new", href: "/admin/tenants/new", label: "New Tenant" }
];

export function routeFromPath(pathname: string): { route: RouteName; tenantId: string | null } {
  if (pathname === "/admin/login") return { route: "login", tenantId: null };
  if (pathname === "/admin" || pathname === "/admin/") return { route: "dashboard", tenantId: null };
  if (pathname === "/admin/tenants") return { route: "tenants", tenantId: null };
  if (pathname === "/admin/tenants/new") return { route: "tenant-new", tenantId: null };
  const match = pathname.match(/^\/admin\/tenants\/([^/]+)(?:\/(secrets|tests))?$/);
  if (match?.[1]) {
    return {
      route: match[2] === "secrets" ? "tenant-secrets" : match[2] === "tests" ? "tenant-tests" : "tenant-detail",
      tenantId: decodeURIComponent(match[1])
    };
  }
  return { route: "dashboard", tenantId: null };
}

export function AdminApp({ initialPath }: { initialPath: string }): React.ReactElement {
  const [route, setRoute] = useState(() => routeFromPath(initialPath));
  const [authStatus, setAuthStatus] = useState<AuthStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [apiStatus, setApiStatus] = useState<ApiStatus>("checking");
  const [dataVersion, setDataVersion] = useState(0);

  useEffect(() => {
    const onPop = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    if (!hasApiBaseUrl()) {
      setApiStatus("offline");
      setAuthStatus("unauthenticated");
      return;
    }
    void apiRequest<HealthResponse>("/health")
      .then((body) => {
        setHealth(body);
        setApiStatus("online");
      })
      .catch(() => {
        setHealth(null);
        setApiStatus("offline");
      });
  }, []);

  useEffect(() => {
    if (!hasApiBaseUrl()) {
      return;
    }
    void apiRequest<{ authenticated: boolean }>("/api/admin/me")
      .then(() => setAuthStatus("authenticated"))
      .catch((error) => {
        setAuthStatus("unauthenticated");
        if (!(error instanceof ApiRequestError) || error.status !== 401) {
          setApiStatus("offline");
        }
      });
  }, []);

  const navigate = (href: string) => {
    window.history.pushState(null, "", href);
    setRoute(routeFromPath(window.location.pathname));
  };

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setAuthStatus("unauthenticated");
      setDataVersion((current) => current + 1);
      if (window.location.pathname !== "/admin/login") {
        navigate("/admin/login");
      }
    });
    return () => setUnauthorizedHandler(null);
  }, []);

  useEffect(() => {
    if (authStatus === "unauthenticated" && route.route !== "login") {
      navigate("/admin/login");
    }
  }, [authStatus, route.route]);

  const onAuthenticated = () => {
    void apiRequest<{ authenticated: boolean }>("/api/admin/me")
      .then(() => {
        setAuthStatus("authenticated");
        setDataVersion((current) => current + 1);
        navigate("/admin");
      })
      .catch(() => {
        setAuthStatus("unauthenticated");
        navigate("/admin/login");
      });
  };

  if (!hasApiBaseUrl()) {
    return <ConfigErrorPage />;
  }

  if (route.route === "login") {
    return <LoginPage onAuthenticated={onAuthenticated} />;
  }

  return (
    <Shell
      apiStatus={apiStatus}
      health={health}
      activeRoute={route.route}
      authStatus={authStatus}
      navigate={navigate}
    >
      {authStatus === "checking" && <Panel title="Checking Session"><p className="muted">Loading admin session...</p></Panel>}
      {authStatus === "unauthenticated" && <Panel title="Admin Login Required"><p className="muted">Redirecting to admin login...</p></Panel>}
      {authStatus === "authenticated" && route.route === "tenants" && <TenantListPage key={`tenants-${dataVersion}`} navigate={navigate} />}
      {authStatus === "authenticated" && route.route === "tenant-new" && <NewTenantPage key={`tenant-new-${dataVersion}`} navigate={navigate} />}
      {(route.route === "tenant-detail" || route.route === "tenant-secrets" || route.route === "tenant-tests") && route.tenantId && (
        authStatus === "authenticated" && <TenantDetailPage key={`${route.tenantId}-${dataVersion}`} tenantId={route.tenantId} activeRoute={route.route} navigate={navigate} />
      )}
      {authStatus === "authenticated" && route.route === "dashboard" && <DashboardPage key={`dashboard-${dataVersion}`} health={health} />}
    </Shell>
  );
}

function Shell(props: {
  children: React.ReactNode;
  apiStatus: ApiStatus;
  health: HealthResponse | null;
  activeRoute: RouteName;
  authStatus: AuthStatus;
  navigate: (href: string) => void;
}): React.ReactElement {
  const liveEnabled = Boolean(props.health?.dattoExecutionGloballyEnabled);
  const authLabel = props.authStatus === "authenticated" ? "Authenticated" : props.authStatus === "checking" ? "Checking Auth" : "Unauthorized";
  return (
    <section className="app-shell">
      <aside className="sidebar" aria-label="Admin navigation">
        <div className="brand">
          <span>Dispatch Sentinel</span>
          <strong>Admin GUI</strong>
        </div>
        <nav>
          {navItems.map((item) => (
            <a
              key={item.href}
              className={item.route === props.activeRoute ? "active" : ""}
              href={item.href}
              onClick={(event) => {
                event.preventDefault();
                props.navigate(item.href);
              }}
            >
              {item.label}
            </a>
          ))}
        </nav>
      </aside>
      <main className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Tenant Setup & Integration Control</p>
            <h1>{titleForRoute(props.activeRoute)}</h1>
          </div>
          <div className="header-status">
            <Badge tone={props.apiStatus === "online" ? "good" : props.apiStatus === "checking" ? "warn" : "bad"}>
              {props.apiStatus === "online" ? "API Online" : props.apiStatus === "checking" ? "API Checking" : "API Offline"}
            </Badge>
            <Badge tone={liveEnabled ? "bad" : "good"}>{liveEnabled ? "Live Execution Enabled" : "Dry-run Safe"}</Badge>
            <Badge tone={props.authStatus === "authenticated" ? "good" : "warn"}>{authLabel}</Badge>
          </div>
        </header>
        {props.children}
      </main>
    </section>
  );
}

function LoginPage({ onAuthenticated }: { onAuthenticated: () => void }): React.ReactElement {
  const [tokenValue, setTokenValue] = useState("");
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading", message: "Signing in..." });
    try {
      await apiRequest<{ authenticated?: boolean }>("/api/admin/login", {
        method: "POST",
        body: { token: tokenValue }
      });
      onAuthenticated();
      setState({ status: "success", message: "Signed in." });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Admin Access</p>
        <h1>Dispatch Sentinel</h1>
        <form className="settings-grid single" onSubmit={submit}>
          <label>
            <span>Token or password</span>
            <input
              type="password"
              autoComplete="current-password"
              value={tokenValue}
              onChange={(event) => setTokenValue(event.currentTarget.value)}
              placeholder="Enter ADMIN_SETUP_TOKEN"
            />
          </label>
          <button type="submit" disabled={state.status === "loading"}>
            Login
          </button>
          <StatusLine state={state} />
          <p className="muted">No registration. The MVP uses a secure admin session cookie issued by the API.</p>
        </form>
      </section>
    </main>
  );
}

function ConfigErrorPage(): React.ReactElement {
  return (
    <main className="login-shell">
      <section className="login-panel">
        <p className="eyebrow">Configuration Required</p>
        <h1>API base URL missing</h1>
        <p className="muted">Set NEXT_PUBLIC_API_BASE_URL in the web Vercel project and redeploy the web app.</p>
      </section>
    </main>
  );
}

function DashboardPage({ health }: { health: HealthResponse | null }): React.ReactElement {
  const tenants = useTenants();
  const recentEvents = useRecentWebhookEvents();
  const recentTests = useRecentTests();
  const activeTenants = tenants.items.filter((tenant) => tenant.status === "active");
  const bmsConfigured = tenants.items.filter((tenant) => tenant.configuration.bmsConfigured || tenant.configuration.bmsWebhookConfigured);
  const dattoConfigured = tenants.items.filter((tenant) => tenant.configuration.dattoConfigured);

  return (
    <>
      <section className="metric-grid">
        <Metric label="API reachable" value={health?.ok ? "yes" : "no"} />
        <Metric label="Tenant count" value={String(tenants.items.length)} />
        <Metric label="Active tenants" value={String(activeTenants.length)} />
        <Metric label="BMS configured" value={String(bmsConfigured.length)} />
        <Metric label="Datto configured" value={String(dattoConfigured.length)} />
        <Metric label="Recent webhooks" value={String(recentEvents.length)} />
        <Metric label="Recent tests" value={String(recentTests.length)} />
      </section>
      <Alert state={tenants.state} />
      <section className="split">
        <Panel title="Recent Integration Test Results">
          {recentTests.length === 0 ? <p className="muted">No integration tests have been run yet.</p> : (
            <Table headers={["Tenant", "Test", "Status", "Message"]} rows={recentTests.slice(0, 5).map((item) => [item.tenantName, item.test.testType, item.test.status, item.test.message])} />
          )}
        </Panel>
        <Panel title="Safety Posture">
          <ul className="status-list">
            <li><span>Global Datto execution</span><strong>{health?.dattoExecutionGloballyEnabled ? "enabled" : "disabled"}</strong></li>
            <li><span>Execution default</span><strong>dry_run</strong></li>
            <li><span>Server automation</span><strong>disabled by default</strong></li>
          </ul>
        </Panel>
      </section>
    </>
  );
}

function TenantListPage({ navigate }: { navigate: (href: string) => void }): React.ReactElement {
  const tenants = useTenants();
  async function toggleTenant(tenant: TenantSummary) {
    try {
      await apiRequest(`/api/admin/tenants/${tenant.id}/${tenant.status === "active" ? "disable" : "enable"}`, {
        method: "POST"
      });
      window.location.reload();
    } catch (error) {
      alert(errorMessage(error));
    }
  }
  return (
    <Panel title="Tenants">
      <div className="toolbar">
        <button type="button" onClick={() => navigate("/admin/tenants/new")}>Create tenant</button>
      </div>
      <Alert state={tenants.state} />
      <Table
        headers={["Name", "Slug", "Status", "BMS configured", "Datto configured", "Execution mode", "Last test", "Actions"]}
        rows={tenants.items.map((tenant) => [
          tenant.name,
          tenant.slug,
          tenant.status,
          yesNo(tenant.configuration.bmsConfigured || tenant.configuration.bmsWebhookConfigured),
          yesNo(tenant.configuration.dattoConfigured),
          tenant.executionMode,
          tenant.lastTestStatus ?? "-",
          <span className="row-actions" key={tenant.id}>
            <button type="button" onClick={() => navigate(`/admin/tenants/${tenant.id}`)}>view</button>
            <button type="button" onClick={() => navigate(`/admin/tenants/${tenant.id}/secrets`)}>edit</button>
            <button type="button" onClick={() => void toggleTenant(tenant)}>{tenant.status === "active" ? "disable" : "enable"}</button>
          </span>
        ])}
      />
    </Panel>
  );
}

function NewTenantPage({ navigate }: { navigate: (href: string) => void }): React.ReactElement {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });

  async function submit(event: FormEvent) {
    event.preventDefault();
    setState({ status: "loading", message: "Creating tenant..." });
    try {
      const tenant = await createTenant({ name, slug });
      setState({ status: "success", message: "Tenant created." });
      navigate(`/admin/tenants/${tenant.id}`);
    } catch (error) {
      if (error instanceof ApiRequestError && error.status === 401) {
        return;
      }
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <Panel title="New Tenant">
      <form className="settings-grid" onSubmit={submit}>
        <label><span>Tenant name</span><input value={name} onChange={(event) => setName(event.currentTarget.value)} /></label>
        <label><span>Tenant slug</span><input value={slug} onChange={(event) => setSlug(event.currentTarget.value)} placeholder="acme-support" /></label>
        <button type="submit" disabled={state.status === "loading"}>Create</button>
      </form>
      <StatusLine state={state} />
    </Panel>
  );
}

function TenantDetailPage(props: { tenantId: string; activeRoute: RouteName; navigate: (href: string) => void }): React.ReactElement {
  const tenant = useTenant(props.tenantId);
  const settings = useTenantSettings(props.tenantId);
  const secrets = useTenantSecrets(props.tenantId);
  const tests = useTenantTests(props.tenantId);
  const events = useTenantWebhookEvents(props.tenantId);
  const evaluations = useTenantEvaluations(props.tenantId);
  const candidates = useTenantDryRunCandidates(props.tenantId);
  const webhookUrl = tenant.item ? `${apiBaseUrl}${tenant.item.webhookUrl}` : "";

  if (tenant.state.status === "loading") return <Panel title="Tenant"><p className="muted">Loading tenant...</p></Panel>;
  if (!tenant.item) return <Panel title="Tenant"><Alert state={tenant.state} /></Panel>;

  return (
    <>
      <div className="subnav">
        <button type="button" onClick={() => props.navigate(`/admin/tenants/${props.tenantId}`)}>Overview</button>
        <button type="button" onClick={() => props.navigate(`/admin/tenants/${props.tenantId}/secrets`)}>Secrets</button>
        <button type="button" onClick={() => props.navigate(`/admin/tenants/${props.tenantId}/tests`)}>Tests</button>
      </div>
      <Panel title="Overview">
        <ul className="status-list">
          <li><span>Name</span><strong>{tenant.item.name}</strong></li>
          <li><span>Slug</span><strong>{tenant.item.slug}</strong></li>
          <li><span>Status</span><strong>{tenant.item.status}</strong></li>
          <li><span>Generated webhook URL</span><strong>{webhookUrl || "Set NEXT_PUBLIC_API_BASE_URL"}</strong></li>
        </ul>
      </Panel>
      {props.activeRoute !== "tenant-tests" && (
        <>
          <BmsConfiguration tenantId={props.tenantId} settings={settings.item} />
          <WebhookConfiguration tenantId={props.tenantId} tenant={tenant.item} secrets={secrets.items} />
          <DattoConfiguration tenantId={props.tenantId} />
          <ExecutionSafety tenantId={props.tenantId} settings={settings.item} />
        </>
      )}
      {(props.activeRoute === "tenant-tests" || props.activeRoute === "tenant-detail") && (
        <IntegrationTests tenantId={props.tenantId} tests={tests.items} />
      )}
      <Panel title="Recent Events">
        <Table headers={["Event", "Status", "Reason", "Timestamp"]} rows={events.items.slice(0, 5).map((event) => [event.eventType, event.status, event.reason ?? "-", event.createdAt])} />
        {events.items.length === 0 && <p className="muted">No webhook events yet.</p>}
      </Panel>
      <Panel title="Recent Ticket Evaluations">
        <Table headers={["Ticket", "Intent", "Confidence", "Outcome", "Timestamp"]} rows={evaluations.items.slice(0, 5).map((evaluation) => [evaluation.externalTicketId ?? "-", evaluation.detectedIntent, String(evaluation.confidence), evaluation.outcome, evaluation.createdAt])} />
        {evaluations.items.length === 0 && <p className="muted">No ticket evaluations yet.</p>}
      </Panel>
      <Panel title="Dry-run Automation Candidates">
        <Table headers={["Evaluation", "Component", "Status", "Timestamp"]} rows={candidates.items.slice(0, 5).map((candidate) => [candidate.ticketEvaluationId, candidate.componentId, candidate.status, candidate.createdAt])} />
        {candidates.items.length === 0 && <p className="muted">No dry-run automation candidates yet.</p>}
      </Panel>
    </>
  );
}

function BmsConfiguration(props: { tenantId: string; settings: TenantSettings | null }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  return (
    <Panel title="BMS Configuration">
      <SecretInputs
        tenantId={props.tenantId}
        fields={[
          ["BMS API base URL", "bms_api_base_url"],
          ["BMS username/client ID", "bms_api_username"],
          ["BMS API secret/password", "bms_api_secret"]
        ]}
        onState={setState}
      />
      <SettingsQueueForm tenantId={props.tenantId} settings={props.settings} />
      <div className="toolbar">
        <TestButton tenantId={props.tenantId} test="bms-auth" label="Test BMS auth" />
        <TestButton tenantId={props.tenantId} test="bms-fetch-ticket" label="Test fetch ticket by ID" />
        <TestButton tenantId={props.tenantId} test="bms-add-internal-note" label="Test add internal note" />
      </div>
      <StatusLine state={state} />
    </Panel>
  );
}

function WebhookConfiguration(props: { tenantId: string; tenant: TenantSummary; secrets: TenantSecretStatus[] }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  const [generatedSecret, setGeneratedSecret] = useState("");
  const webhookSecret = props.secrets.find((secret) => secret.secretName === "bms_webhook_secret");
  const webhookUrl = `${apiBaseUrl}${props.tenant.webhookUrl}`;

  async function rotateSecret() {
    setState({ status: "loading", message: "Rotating webhook secret..." });
    try {
      const body = await apiRequest<{ value: string }>(`/api/admin/tenants/${props.tenantId}/secrets/bms_webhook_secret/rotate`, {
        method: "POST"
      });
      setGeneratedSecret(body.value);
      setState({ status: "success", message: "Webhook secret rotated. Store the one-time value now." });
    } catch (error) {
      setGeneratedSecret("");
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <Panel title="Webhook Configuration">
      <div className="settings-grid">
        <label><span>Generated webhook URL</span><input readOnly value={webhookUrl} /></label>
        <div className="server-lock"><span>Webhook secret configured</span><strong>{yesNo(Boolean(webhookSecret?.configured))}</strong></div>
        <button type="button" onClick={() => void rotateSecret()}>Generate/rotate webhook secret</button>
        <button type="button" onClick={() => void navigator.clipboard?.writeText(webhookUrl)}>Copy webhook URL</button>
        <TestButton tenantId={props.tenantId} test="webhook-self-test" label="Send test webhook" />
      </div>
      {generatedSecret && <p className="one-time-secret">One-time webhook secret: <code>{generatedSecret}</code></p>}
      <StatusLine state={state} />
    </Panel>
  );
}

function DattoConfiguration(props: { tenantId: string }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  return (
    <Panel title="Datto RMM Configuration">
      <SecretInputs
        tenantId={props.tenantId}
        fields={[
          ["Datto API URL", "datto_rmm_api_url"],
          ["Datto API key", "datto_rmm_api_key"],
          ["Datto API secret", "datto_rmm_api_secret"]
        ]}
        onState={setState}
      />
      <div className="toolbar">
        <TestButton tenantId={props.tenantId} test="datto-auth" label="Test Datto auth" />
        <TestButton tenantId={props.tenantId} test="datto-list-sites" label="Test list sites" />
        <TestButton tenantId={props.tenantId} test="datto-list-devices" label="Test list devices" />
      </div>
      <StatusLine state={state} />
    </Panel>
  );
}

function ExecutionSafety(props: { tenantId: string; settings: TenantSettings | null }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  const [executionMode, setExecutionMode] = useState<TenantSettings["executionMode"]>("dry_run");
  const [dattoEnabled, setDattoEnabled] = useState(false);
  const [serverEnabled, setServerEnabled] = useState(false);
  const [maxRuns, setMaxRuns] = useState(2);

  useEffect(() => {
    if (props.settings) {
      setExecutionMode(props.settings.executionMode);
      setDattoEnabled(props.settings.dattoExecutionEnabled);
      setServerEnabled(props.settings.serverAutomationEnabled);
      setMaxRuns(props.settings.maxRunsPerDevicePerDay);
    }
  }, [props.settings]);

  async function save() {
    setState({ status: "loading", message: "Saving safety settings..." });
    try {
      await apiRequest(`/api/admin/tenants/${props.tenantId}/settings`, {
        method: "PATCH",
        body: {
          execution_mode: executionMode,
          datto_execution_enabled: dattoEnabled,
          server_automation_enabled: serverEnabled,
          max_runs_per_device_per_day: maxRuns
        }
      });
      setState({ status: "success", message: "Safety settings saved." });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }

  return (
    <Panel title="Execution Safety">
      <div className="settings-grid">
        <label><span>execution_mode</span><select value={executionMode} onChange={(event) => setExecutionMode(event.currentTarget.value as TenantSettings["executionMode"])}><option>dry_run</option><option>live</option></select></label>
        <label><span>datto_execution_enabled</span><input type="checkbox" checked={dattoEnabled} onChange={(event) => setDattoEnabled(event.currentTarget.checked)} /></label>
        <label><span>server_automation_enabled</span><input type="checkbox" checked={serverEnabled} onChange={(event) => setServerEnabled(event.currentTarget.checked)} /></label>
        <label><span>max_runs_per_device_per_day</span><input type="number" min="0" value={maxRuns} onChange={(event) => setMaxRuns(Number(event.currentTarget.value))} /></label>
        <button type="button" onClick={() => void save()}>Save safety settings</button>
      </div>
      {executionMode === "live" && <p className="danger-note">Live mode requires both global and tenant flags. Server automation remains disabled by default.</p>}
      <StatusLine state={state} />
    </Panel>
  );
}

function IntegrationTests(props: { tenantId: string; tests: IntegrationTestRun[] }): React.ReactElement {
  return (
    <Panel title="Integration Test Console">
      <div className="toolbar">
        <HealthButton />
        {[
          ["bms-auth", "Test BMS auth"],
          ["bms-fetch-ticket", "Test fetch ticket"],
          ["datto-auth", "Test Datto auth"],
          ["datto-list-sites", "Test list Datto sites"],
          ["datto-list-devices", "Test list Datto devices"],
          ["classifier-sample", "Test classifier sample"],
          ["policy-sample", "Test policy sample"],
          ["webhook-self-test", "Test webhook self-test"],
          ["device-match-sample", "Test device match sample"]
        ].map(([test, label]) => <TestButton key={test} tenantId={props.tenantId} test={test} label={label} />)}
      </div>
      <Table
        headers={["Test type", "Status", "Message", "Duration", "Timestamp"]}
        rows={props.tests.map((test) => [test.testType, test.status, test.message, `${test.durationMs}ms`, test.createdAt])}
      />
    </Panel>
  );
}

function SecretInputs(props: { tenantId: string; fields: string[][]; onState: (state: RequestState) => void }): React.ReactElement {
  const [values, setValues] = useState<Record<string, string>>({});
  async function save() {
    props.onState({ status: "loading", message: "Saving encrypted secrets..." });
    try {
      for (const [, name] of props.fields) {
        if (values[name]) {
          await saveSecret(props.tenantId, name, values[name]);
        }
      }
      setValues({});
      props.onState({ status: "success", message: "Encrypted secrets saved." });
    } catch (error) {
      props.onState({ status: "error", message: errorMessage(error) });
    }
  }
  return (
    <div className="settings-grid">
      {props.fields.map(([label, name]) => (
        <label key={name}>
          <span>{label}</span>
          <input
            type={name.includes("secret") || name.includes("key") ? "password" : "text"}
            value={values[name] ?? ""}
            onChange={(event) => setValues((current) => ({ ...current, [name]: event.currentTarget.value }))}
          />
        </label>
      ))}
      <button type="button" onClick={() => void save()}>Save encrypted</button>
    </div>
  );
}

function SettingsQueueForm(props: { tenantId: string; settings: TenantSettings | null }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  const [values, setValues] = useState<Record<string, string>>({});
  const fields = [
    ["default queue", "bms_default_queue"],
    ["automation review queue", "bms_automation_review_queue"],
    ["human review queue", "bms_human_review_queue"],
    ["security queue", "bms_security_queue"]
  ];
  async function save() {
    setState({ status: "loading", message: "Saving BMS queues..." });
    try {
      await apiRequest(`/api/admin/tenants/${props.tenantId}/settings`, { method: "PATCH", body: values });
      setState({ status: "success", message: "BMS queue settings saved." });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }
  return (
    <>
      <div className="settings-grid">
        {fields.map(([label, name]) => (
          <label key={name}><span>{label}</span><input value={values[name] ?? ""} onChange={(event) => setValues((current) => ({ ...current, [name]: event.currentTarget.value }))} /></label>
        ))}
        <button type="button" onClick={() => void save()}>Save queue settings</button>
      </div>
      <StatusLine state={state} />
    </>
  );
}

function TestButton(props: { tenantId: string; test: string; label: string }): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  async function run() {
    setState({ status: "loading", message: "Running..." });
    try {
      const body = await apiRequest<{ test: IntegrationTestRun }>(`/api/admin/tenants/${props.tenantId}/tests/${props.test}`, {
        method: "POST"
      });
      setState({ status: body.test.status === "failed" ? "error" : "success", message: body.test.message });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }
  return (
    <span className="inline-action">
      <button type="button" onClick={() => void run()}>{props.label}</button>
      {state.message && <small className={`state-${state.status}`}>{state.message}</small>}
    </span>
  );
}

function HealthButton(): React.ReactElement {
  const [state, setState] = useState<RequestState>({ status: "idle", message: "" });
  async function run() {
    setState({ status: "loading", message: "Checking API..." });
    try {
      await apiRequest("/health");
      setState({ status: "success", message: "API health returned OK." });
    } catch (error) {
      setState({ status: "error", message: errorMessage(error) });
    }
  }
  return <span className="inline-action"><button type="button" onClick={() => void run()}>Test API health</button>{state.message && <small className={`state-${state.status}`}>{state.message}</small>}</span>;
}

function useTenants() {
  const [items, setItems] = useState<TenantSummary[]>([]);
  const [state, setState] = useState<RequestState>({ status: "loading", message: "Loading tenants..." });
  useEffect(() => {
    void apiRequest<{ tenants: TenantSummary[] }>("/api/admin/tenants")
      .then((body) => {
        setItems(body.tenants);
        setState({ status: "success", message: "" });
      })
      .catch((error) => setState({ status: "error", message: errorMessage(error) }));
  }, []);
  return { items, state };
}

function useTenant(tenantId: string) {
  const [item, setItem] = useState<TenantSummary | null>(null);
  const [state, setState] = useState<RequestState>({ status: "loading", message: "Loading tenant..." });
  useEffect(() => {
    void apiRequest<{ tenant: TenantSummary }>(`/api/admin/tenants/${tenantId}`)
      .then((body) => {
        setItem(body.tenant);
        setState({ status: "success", message: "" });
      })
      .catch((error) => setState({ status: "error", message: errorMessage(error) }));
  }, [tenantId]);
  return { item, state };
}

function useTenantSettings(tenantId: string) {
  const [item, setItem] = useState<TenantSettings | null>(null);
  useEffect(() => {
    void apiRequest<{ settings: TenantSettings }>(`/api/admin/tenants/${tenantId}/settings`)
      .then((body) => setItem(body.settings))
      .catch(() => setItem(null));
  }, [tenantId]);
  return { item };
}

function useTenantSecrets(tenantId: string) {
  const [items, setItems] = useState<TenantSecretStatus[]>([]);
  useEffect(() => {
    void apiRequest<{ secrets: TenantSecretStatus[] }>(`/api/admin/tenants/${tenantId}/secrets/status`)
      .then((body) => setItems(body.secrets))
      .catch(() => setItems([]));
  }, [tenantId]);
  return { items };
}

function useTenantTests(tenantId: string) {
  const [items, setItems] = useState<IntegrationTestRun[]>([]);
  useEffect(() => {
    void apiRequest<{ tests: IntegrationTestRun[] }>(`/api/admin/tenants/${tenantId}/tests`)
      .then((body) => setItems(body.tests))
      .catch(() => setItems([]));
  }, [tenantId]);
  return { items };
}

function useTenantWebhookEvents(tenantId: string) {
  const [items, setItems] = useState<TenantWebhookEvent[]>([]);
  useEffect(() => {
    void apiRequest<{ events: TenantWebhookEvent[] }>(`/api/admin/tenants/${tenantId}/webhook-events`)
      .then((body) => setItems(body.events))
      .catch(() => setItems([]));
  }, [tenantId]);
  return { items };
}

function useTenantEvaluations(tenantId: string) {
  const [items, setItems] = useState<TicketEvaluation[]>([]);
  useEffect(() => {
    void apiRequest<{ evaluations: TicketEvaluation[] }>(`/api/admin/tenants/${tenantId}/ticket-evaluations`)
      .then((body) => setItems(body.evaluations))
      .catch(() => setItems([]));
  }, [tenantId]);
  return { items };
}

function useTenantDryRunCandidates(tenantId: string) {
  const [items, setItems] = useState<DryRunCandidate[]>([]);
  useEffect(() => {
    void apiRequest<{ candidates: DryRunCandidate[] }>(`/api/admin/tenants/${tenantId}/dry-run-candidates`)
      .then((body) => setItems(body.candidates))
      .catch(() => setItems([]));
  }, [tenantId]);
  return { items };
}

function useRecentWebhookEvents() {
  const tenants = useTenants();
  const [items, setItems] = useState<TenantWebhookEvent[]>([]);
  useEffect(() => {
    void Promise.all(tenants.items.map((tenant) => apiRequest<{ events: TenantWebhookEvent[] }>(`/api/admin/tenants/${tenant.id}/webhook-events`).catch(() => ({ events: [] }))))
      .then((results) => setItems(results.flatMap((result) => result.events)));
  }, [tenants.items.length]);
  return items;
}

function useRecentTests() {
  const tenants = useTenants();
  const [items, setItems] = useState<Array<{ tenantName: string; test: IntegrationTestRun }>>([]);
  useEffect(() => {
    void Promise.all(tenants.items.map((tenant) => apiRequest<{ tests: IntegrationTestRun[] }>(`/api/admin/tenants/${tenant.id}/tests`)
      .then((body) => body.tests.map((test) => ({ tenantName: tenant.name, test })))
      .catch(() => [])))
      .then((results) => setItems(results.flat()));
  }, [tenants.items.length]);
  return items;
}

async function saveSecret(tenantId: string, name: string, value: string): Promise<void> {
  await apiRequest(`/api/admin/tenants/${tenantId}/secrets/${name}`, {
    method: "PUT",
    body: { value }
  });
}

function Panel({ title, children }: { title: string; children: React.ReactNode }): React.ReactElement {
  return <section className="panel"><h2>{title}</h2>{children}</section>;
}

function Metric({ label, value }: { label: string; value: string }): React.ReactElement {
  return <article><span>{label}</span><strong>{value}</strong></article>;
}

function Badge({ tone, children }: { tone: "good" | "warn" | "bad"; children: React.ReactNode }): React.ReactElement {
  return <span className={`badge ${tone}`}>{children}</span>;
}

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }): React.ReactElement {
  return (
    <div className="table-wrap">
      <table>
        <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
        <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

function Alert({ state }: { state: RequestState }): React.ReactElement | null {
  if (!state.message || state.status === "success") return null;
  return <p className={`alert state-${state.status}`}>{state.message}</p>;
}

function StatusLine({ state }: { state: RequestState }): React.ReactElement | null {
  if (!state.message) return null;
  return <p className={`status-line state-${state.status}`}>{state.message}</p>;
}

function titleForRoute(route: RouteName): string {
  return {
    login: "Login",
    dashboard: "Dashboard",
    tenants: "Tenants",
    "tenant-new": "New Tenant",
    "tenant-detail": "Tenant Control",
    "tenant-secrets": "Tenant Secrets",
    "tenant-tests": "Integration Tests"
  }[route];
}

function yesNo(value: boolean): string {
  return value ? "yes" : "no";
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function renderRouteForTest(pathname: string): React.ReactElement {
  const route = routeFromPath(pathname);
  if (route.route === "login") {
    return <LoginPage onAuthenticated={() => undefined} />;
  }
  return <Shell apiStatus="online" health={{ ok: true, service: "dispatch-sentinel-api", environment: "test", dattoExecutionGloballyEnabled: false }} activeRoute={route.route} authStatus="authenticated" navigate={() => undefined}>
    {route.route === "tenant-new" ? <NewTenantPage navigate={() => undefined} /> : <DashboardPage health={{ ok: true, service: "dispatch-sentinel-api", environment: "test", dattoExecutionGloballyEnabled: false }} />}
  </Shell>;
}
