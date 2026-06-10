import { AdminApp } from "../../../../../src/AdminApp";

export default async function TenantSecretsPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <AdminApp initialPath={`/admin/tenants/${tenantId}/secrets`} />;
}
