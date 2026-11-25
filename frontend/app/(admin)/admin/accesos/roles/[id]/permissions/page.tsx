import { RolePermissionsManager } from '@/components/accesos/RolePermissionsManager';

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AdminRolePermissionsPage({ params }: PageProps) {
  const { id } = await params;
  return <RolePermissionsManager roleId={id} />;
}
