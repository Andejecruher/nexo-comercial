import { redirect } from 'next/navigation';

export default function AiAdminIndexPage() {
  redirect('/admin/ai/agents');
}
