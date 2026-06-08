import "./styles.css";

type AdminRoute = "overview" | "evaluations" | "components" | "approvals" | "runs" | "audit" | "safety";

const routes: Array<{ id: AdminRoute; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "evaluations", label: "Ticket Evaluations" },
  { id: "components", label: "Component Registry" },
  { id: "approvals", label: "Approvals" },
  { id: "runs", label: "Automation Runs" },
  { id: "audit", label: "Audit Log" },
  { id: "safety", label: "Safety Settings" }
];

const metrics = [
  ["Tickets evaluated today", "18"],
  ["Auto-eligible", "5"],
  ["Approvals pending", "3"],
  ["Automations run", "4"],
  ["Succeeded", "3"],
  ["Failed", "1"],
  ["Escalated to human", "9"]
];

const evaluations = [
  ["BMS-1001", "AUTO_ELIGIBLE_CONFIRM_CLIENT", "95", "restart_print_spooler", "Restart Print Spooler", "ACCOUNTING-PC-04", "Safe workstation match"],
  ["BMS-1002", "AUTO_ELIGIBLE_CONFIRM_CLIENT", "92", "run_gpupdate", "Run GPUpdate", "WS-FIN-22", "Policy request and hostname matched"],
  ["BMS-1008", "ESCALATE_TO_HUMAN", "42", "unknown", "-", "-", "Unclear request"]
];

const components = [
  ["Restart Print Spooler", "enabled", "low", "yes", "no", "restart_print_spooler", "workstation"],
  ["Run GPUpdate", "enabled", "low", "yes", "no", "run_gpupdate", "workstation"],
  ["Collect Workstation Diagnostics", "enabled", "low", "optional", "no", "collect_workstation_diagnostics", "workstation"],
  ["Clear Safe Temp Files", "enabled", "medium", "yes", "no", "clear_safe_temp_files", "workstation"],
  ["Restart User App Process", "enabled", "medium", "yes", "no", "restart_user_app_process", "workstation"],
  ["Reboot Workstation", "enabled", "medium", "yes", "configurable", "reboot_workstation", "workstation"]
];

const approvals = [
  ["BMS-1001", "pending", "ACCOUNTING-PC-04", "Restart Print Spooler", "alicia@example.test"],
  ["BMS-1002", "approved", "WS-FIN-22", "Run GPUpdate", "ben@example.test"],
  ["BMS-1008", "rejected", "-", "-", "hannah@example.test"],
  ["BMS-1005", "expired", "-", "-", "elliot@example.test"]
];

const runs = [
  ["running", "BMS-1002", "WS-FIN-22", "Run GPUpdate", "Datto job running", "2026-06-08 09:12", "-"],
  ["completed", "BMS-1001", "ACCOUNTING-PC-04", "Restart Print Spooler", "Spooler restarted", "2026-06-08 08:45", "2026-06-08 08:46"],
  ["failed", "BMS-1003", "LAPTOP-CARA-01", "Collect Workstation Diagnostics", "Device offline", "2026-06-08 08:20", "2026-06-08 08:51"]
];

const auditEvents = [
  ["automation.run.started", "BMS-1001", "ACCOUNTING-PC-04", "component-restart-print-spooler", "success"],
  ["automation.run.completed", "BMS-1001", "ACCOUNTING-PC-04", "component-restart-print-spooler", "success"],
  ["automation.run.failed", "BMS-1003", "LAPTOP-CARA-01", "component-collect-workstation-diagnostics", "error"],
  ["approval.resend_requested", "BMS-1002", "WS-FIN-22", "component-run-gpupdate", "success"]
];

export function renderAdminDashboard(route: AdminRoute = "overview"): string {
  return `
    <section class="app-shell">
      <aside class="sidebar" aria-label="Admin navigation">
        <div class="brand">
          <span>Dispatch Sentinel</span>
          <strong>Phase 10 Admin</strong>
        </div>
        <nav>
          ${routes.map((item) => `<a href="#${item.id}" class="${item.id === route ? "active" : ""}">${item.label}</a>`).join("")}
        </nav>
      </aside>
      <main class="content">
        <header class="topbar">
          <div>
            <p class="eyebrow">Automation Safety Console</p>
            <h1>${routes.find((item) => item.id === route)?.label ?? "Overview"}</h1>
          </div>
          <a class="api-link" href="http://127.0.0.1:4310/healthz">API health</a>
        </header>
        ${renderRoute(route)}
      </main>
    </section>
  `;
}

function renderRoute(route: AdminRoute): string {
  switch (route) {
    case "evaluations":
      return renderEvaluations();
    case "components":
      return renderComponents();
    case "approvals":
      return renderApprovals();
    case "runs":
      return renderRuns();
    case "audit":
      return renderAudit();
    case "safety":
      return renderSafety();
    default:
      return renderOverview();
  }
}

function renderOverview(): string {
  return `
    <section class="metric-grid" aria-label="Dashboard overview">
      ${metrics.map(([label, value]) => `<article><span>${label}</span><strong>${value}</strong></article>`).join("")}
    </section>
    <section class="split">
      ${panel("Recent Decisions", table(["Ticket", "Decision", "Confidence", "Intent"], evaluations.map((row) => [row[0], row[1], row[2], row[3]])))}
      ${panel("Safety Posture", `
        <ul class="status-list">
          <li><span>Global execution</span><strong>disabled</strong></li>
          <li><span>Dry-run mode</span><strong>enabled</strong></li>
          <li><span>Server automation</span><strong>disabled</strong></li>
          <li><span>Allowed live components</span><strong>3</strong></li>
        </ul>
      `)}
    </section>
  `;
}

function renderEvaluations(): string {
  return panel(
    "Recent ticket evaluations",
    table(["Ticket", "Outcome", "Confidence", "Intent", "Component", "Device", "Reason", "Audit"], evaluations.map((row) => [...row, "Open audit"]))
  );
}

function renderComponents(): string {
  return panel(
    "Approved component registry",
    table(["Component", "State", "Risk", "Client confirm", "Tech approval", "Allowed intents", "Asset types", "Controls"], components.map((row) => [...row, "Enable | Disable | Edit"]))
  );
}

function renderApprovals(): string {
  return panel(
    "Approval requests",
    table(["Ticket", "Status", "Device", "Component", "Requester", "Safe actions"], approvals.map((row) => [...row, row[1] === "pending" ? "Resend | Cancel" : "View"]))
  );
}

function renderRuns(): string {
  return panel("Automation runs", table(["Status", "Ticket", "Device", "Component", "Result", "Started", "Completed"], runs));
}

function renderAudit(): string {
  return `
    ${panel("Audit filters", `
      <form class="filter-row">
        <input placeholder="Ticket ID" aria-label="Ticket ID" />
        <input placeholder="Device UID" aria-label="Device UID" />
        <input placeholder="Component ID" aria-label="Component ID" />
        <input placeholder="Action" aria-label="Action" />
        <button type="button">Export JSON</button>
        <button type="button">Export CSV</button>
      </form>
    `)}
    ${panel("Audit log", table(["Action", "Ticket", "Device", "Component", "Outcome"], auditEvents))}
  `;
}

function renderSafety(): string {
  return panel(
    "Safety settings",
    `
      <div class="settings-grid">
        <label><span>Global execution</span><select><option>disabled</option><option>enabled</option></select></label>
        <label><span>Dry-run mode</span><select><option>enabled</option><option>disabled</option></select></label>
        <label><span>Max runs per device/day</span><input type="number" min="0" value="2" /></label>
        <label><span>Allowed accounts</span><textarea>acct-001</textarea></label>
        <label><span>Blocked accounts</span><textarea>acct-999</textarea></label>
        <div class="server-lock"><span>Server automation</span><strong>disabled</strong></div>
      </div>
    `
  );
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
    return "overview";
  }
  const hash = window.location.hash.replace("#", "") as AdminRoute;
  return routes.some((route) => route.id === hash) ? hash : "overview";
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
