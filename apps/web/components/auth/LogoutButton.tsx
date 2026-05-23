'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import toast from 'react-hot-toast';

interface LogoutButtonProps {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  showLabel?: boolean;
  className?: string;
}

export function LogoutButton({
  variant = 'ghost',
  showLabel = true,
  className,
}: LogoutButtonProps) {
  const { logout } = useAuth();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    try {
      await logout();
      toast.success('Logged out successfully');
      router.push('/login');
    } catch {
      toast.error('Failed to logout');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Button
      variant={variant}
      size="sm"
      loading={loading}
      onClick={handleLogout}
      className={className}
      icon={!loading ? <LogOut className="h-4 w-4" /> : undefined}
    >
      {showLabel && 'Logout'}
    </Button>
  );
}
