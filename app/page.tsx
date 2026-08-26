import { PlannerApp } from '@/components/PlannerApp';
import { requireChatGPTUser } from './chatgpt-auth';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const user = await requireChatGPTUser('/');
  const name = user.fullName?.split(' ')[0] ?? user.email.split('@')[0] ?? 'Traveller';
  return <PlannerApp userName={name} />;
}
