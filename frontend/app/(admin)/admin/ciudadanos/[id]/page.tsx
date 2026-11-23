import { CitizenProfilePageView } from '@/components/admin/citizen-profile-page-view';

interface CitizenProfilePageProps {
  params: Promise<{ id: string }>;
}

export default async function CitizenProfilePage({ params }: CitizenProfilePageProps) {
  const { id } = await params;

  return (
    <div className="h-full">
      <CitizenProfilePageView citizenId={id} />
    </div>
  );
}
