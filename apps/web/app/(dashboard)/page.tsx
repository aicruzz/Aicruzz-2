import { redirect } from 'next/navigation';

// (dashboard) group root → redirect to /dashboard
export default function DashboardGroupRoot() {
  redirect('/dashboard');
}
