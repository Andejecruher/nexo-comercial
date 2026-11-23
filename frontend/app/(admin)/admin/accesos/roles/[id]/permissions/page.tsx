import { RolePermissionsManager } from '@/components/admin/access-control/RolePermissionsManager';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminRolePermissionsPage({ params }: PageProps) {
  const { id } = await params;
  return <RolePermissionsManager roleId={id} />;
}
