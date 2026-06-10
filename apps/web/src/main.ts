import "./styles.css";

type AdminRoute = "login" | "dashboard" | "tenants" | "tenant-new" | "tenant-detail";

const routes: Array<{ id: AdminRoute; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "tenants", label: "Tenants" },
  { id: "tenant-new", label: "New Tenant" },
  { id: "tenant-detail", label: "Tenant Control" }
];

const tenants = [
  ["Acme Support", "acme-support", "active", "configured", "configured", "dry_run", "passed"],
  ["Northwind Clinic", "northwind-clinic", "active", "configured", "missing", "dry_run", "dry_run"],
  ["Blue Harbor", "blue-harbor", "disabled", "missing", "missing", "dry_run", "failed"]
];

const testRuns = [
  ["bms-auth", "passed", "BMS prerequisites configured", "34ms", "2026-06-10 10:10"],
  ["datto-list-devices", "dry_run", "Live execution disabled; dry-run only", "18ms", "2026-06-10 10:12"],
  ["classifier-sample", "passed", "Local sample test completed", "6ms", "2026-06-10 10:14"]
];

export function renderAdminDashboard(route: AdminRoute = "dashboard"): string {
  if (route === "login") {
    return renderLogin();
  }
  return `
    <section class="app-shell">
      <aside class="sidebar" aria-label="Admin navigation">
        <div class="brand">
          <span>Dispatch Sentinel</span>
          <strong>Phase 13 Control Center</strong>
        </div>
        <nav>
          ${routes.map((item) => `<a href="#${item.id}" class="${item.id === route ? "active" : ""}">${item.label}</a>`).join("")}
        </nav>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Tenant Setup & Integration Control</p>
            <h1>${routes.find((item) => item.id === route)?.label ?? "Dashboard"}</h1>
          </div>
          <a class="api-link" href="/health">API health</a>
        </header>
        ${renderRoute(route)}
      </main>
    </section>
  `;
}

function renderLogin(): string {
  return `
    <main class="login-shell">
      <section class="login-panel">
        <p class="eyebrow">Admin Access</p>
        <h1>Dispatch Sentinel</h1>
        <form class="settings-grid single">
          <label><span>ADMIN_SETUP_TOKEN</span><input type="password" autocomplete="current-password" placeholder="Enter setup token" /></label>
          <button type="button">Login</button>
          <p class="muted">No registration. Admin routes require a signed session token.</p>
        </form>
      </section>
    </main>
  `;
}

function renderRoute(route: AdminRoute): string {
  switch (route) {
    case "tenants":
      return renderTenants();
    case "tenant-new":
      return renderTenantNew();
    case "tenant-detail":
      return renderTenantDetail();
    default:
      return renderOverview();
  }
}

function renderOverview(): string {
  return `
    <section class="metric-grid" aria-label="Dashboard overview">
      ${[
        ["API status", "online"],
        ["Tenants", "3"],
        ["Active tenants", "2"],
        ["Recent webhooks", "12"],
        ["Integration tests", "8"],
        ["Dry-run/live", "dry-run"],
        ["Global Datto execution", "disabled"]
      ].map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    <section class="split">
      ${panel("Recent Webhook Events", table(["Tenant", "Event", "Outcome"], [
        ["acme-support", "tenant.bms.webhook.accepted", "success"],
        ["northwind-clinic", "tenant.bms.webhook.rejected", "rejected"],
        ["blue-harbor", "tenant.bms.webhook.rejected", "rejected"]
      ]))}
      ${panel("Recent Integration Tests", table(["Test", "Status", "Message"], testRuns.map((row) => [row[0], row[1], row[2]])))}
    </section>
  `;
}

function renderTenants(): string {
  return `
    ${panel("Tenant Registry", `
      <div class="toolbar"><a class="api-link" href="#tenant-new">Create tenant</a></div>
      ${table(["Name", "Slug", "Status", "BMS configured", "Datto configured", "Execution mode", "Last test"], tenants)}
    `)}
  `;
}

function renderTenantNew(): string {
  return panel("Create Tenant", `
    <form class="settings-grid">
      <label><span>Tenant name</span><input placeholder="Acme Support" /></label>
      <label><span>Tenant slug</span><input placeholder="acme-support" /></label>
      <button type="button">Create</button>
    </form>
  `);
}

function renderTenantDetail(): string {
  return `
    ${panel("Overview", `
      <ul class="status-list">
        <li><span>Status</span><strong>active</strong></li>
        <li><span>Webhook URL</span><strong>/api/webhooks/bms/acme-support</strong></li>
        <li><span>Secret exposure</span><strong>hidden</strong></li>
      </ul>
    `)}
    ${panel("BMS Configuration", secretForm([
      ["BMS base URL", "bms_api_base_url"],
      ["BMS username/client ID", "bms_api_username"],
      ["BMS secret/password", "bms_api_secret"]
    ], ["Test BMS auth", "Test fetch ticket by ID", "Test add internal note"]))}
    ${panel("Webhook Configuration", `
      <div class="settings-grid">
        <label><span>Generated webhook URL</span><input readonly value="/api/webhooks/bms/acme-support" /></label>
        <div class="server-lock"><span>Webhook secret</span><strong>configured</strong></div>
        <button type="button">Generate / rotate secret</button>
        <button type="button">Copy URL</button>
      </div>
    `)}
    ${panel("Datto RMM Configuration", secretForm([
      ["Datto API URL", "datto_rmm_api_url"],
      ["Datto API key", "datto_rmm_api_key"],
      ["Datto API secret", "datto_rmm_api_secret"]
    ], ["Test Datto auth", "Test list sites", "Test list devices"]))}
    ${panel("Execution Safety", `
      <div class="settings-grid">
        <label><span>Execution mode</span><select><option>dry_run</option><option>live</option></select></label>
        <label><span>Datto execution enabled</span><select><option>false</option><option>true</option></select></label>
        <label><span>Server automation enabled</span><select disabled><option>false</option></select></label>
        <label><span>Max runs per device/day</span><input type="number" min="0" value="2" /></label>
      </div>
      <p class="muted">Live execution requires both global and tenant execution flags. Datto quick jobs remain dry-run by default.</p>
    `)}
    ${panel("Integration Test Console", `
      <div class="toolbar">
        ${["bms-auth", "bms-fetch-ticket", "bms-add-internal-note", "datto-auth", "datto-list-sites", "datto-list-devices", "classifier-sample", "device-match-sample"].map((test) => `<button type="button">${test}</button>`).join("")}
      </div>
      ${table(["Test", "Status", "Message", "Duration", "Timestamp"], testRuns)}
    `)}
    ${panel("Recent Events", table(["Action", "Outcome", "Timestamp"], [
      ["tenant.secret.saved", "success", "2026-06-10 10:00"],
      ["tenant.integration_test.completed", "success", "2026-06-10 10:10"],
      ["tenant.bms.webhook.accepted", "success", "2026-06-10 10:20"]
    ]))}
  `;
}

function secretForm(fields: string[][], actions: string[]): string {
  return `
    <div class="settings-grid">
      ${fields.map(([label, name]) => `<label><span>${label}</span><input type="${name.includes("secret") || name.includes("key") ? "password" : "text"}" placeholder="${name}" /></label>`).join("")}
      <button type="button">Save encrypted</button>
      ${actions.map((action) => `<button type="button">${action}</button>`).join("")}
    </div>
  `;
}

function panel(title: string, body: string): string {
  return `<section class="panel"><h2>${title}</h2>${body}</section>`;
}

function table(headers: string[], rows: string[][]): string {
  return `
    <div class="table-wrap">
      <table>
        <thead><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr></thead>
        <tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`).join("")}</tbody>
      </table>
    </div>
  `;
}

function currentRoute(): AdminRoute {
  if (typeof window === "undefined") {
    return "dashboard";
  }
  const path = window.location.pathname;
  if (path === "/admin/login") {
    return "login";
  }
  const hash = window.location.hash.replace("#", "") as AdminRoute;
  return routes.some((route) => route.id === hash) ? hash : "dashboard";
}

function mount(): void {
  if (typeof document === "undefined") {
    return;
  }
  const root = document.querySelector<HTMLDivElement>("#app");
  if (root) {
    root.innerHTML = renderAdminDashboard(currentRoute());
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("hashchange", mount);
  mount();
}
