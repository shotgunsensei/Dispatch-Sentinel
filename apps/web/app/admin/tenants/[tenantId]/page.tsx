import { AdminApp } from "../../../../src/AdminApp";

export default async function TenantPage({ params }: { params: Promise<{ tenantId: string }> }) {
  const { tenantId } = await params;
  return <AdminApp initialPath={`/admin/tenants/${tenantId}`} />;
}
