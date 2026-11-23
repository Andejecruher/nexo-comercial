import { redirect } from 'next/navigation';

// Ruta legacy — redirige a la ruta canónica
export default function AiLinesPage() {
  redirect('/admin/ai/phone-lines');
}
