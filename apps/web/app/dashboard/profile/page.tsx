'use client';

import { useState, useRef } from 'react';
import { User, Mail, Lock, Camera, CheckCircle2, ShieldAlert } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '@/contexts/AuthContext';
import { api, authApi, getApiError } from '@/lib/api';
import { Input } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState(user?.name ?? '');
  const [saving, setSaving] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  const [pwForm, setPwForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  });
  const [pwErrors, setPwErrors] = useState<Record<string, string>>({});
  const [savingPw, setSavingPw] = useState(false);

  async function saveProfile() {
    setSaving(true);
    try {
      await api.patch('/users/me/profile', { name });
      await refreshUser();
      toast.success('Profile updated');
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleAvatarChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Avatar must be under 5 MB');
      return;
    }

    setUploadingAvatar(true);
    try {
      const formData = new FormData();
      formData.append('avatar', file);
      await api.post('/users/me/avatar', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await refreshUser();
      toast.success('Avatar updated');
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setUploadingAvatar(false);
    }
  }

  function validatePassword(): boolean {
    const errs: Record<string, string> = {};
    if (!pwForm.currentPassword) errs.currentPassword = 'Current password required';
    if (!pwForm.newPassword) errs.newPassword = 'New password required';
    else if (pwForm.newPassword.length < 8) errs.newPassword = 'Minimum 8 characters';
    else if (!/[A-Z]/.test(pwForm.newPassword)) errs.newPassword = 'Must include uppercase';
    else if (!/[0-9]/.test(pwForm.newPassword)) errs.newPassword = 'Must include a number';
    if (pwForm.newPassword !== pwForm.confirmPassword)
      errs.confirmPassword = 'Passwords do not match';
    setPwErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    if (!validatePassword()) return;
    setSavingPw(true);
    try {
      await authApi.changePassword({
        currentPassword: pwForm.currentPassword,
        newPassword: pwForm.newPassword,
      });
      toast.success('Password changed. Please log in again on all devices.');
      setPwForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) {
      toast.error(getApiError(err));
    } finally {
      setSavingPw(false);
    }
  }

  const initials =
    user?.name
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) ?? user?.email?.[0]?.toUpperCase() ?? '?';

  return (
    <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-xl font-bold text-white">My Profile</h1>
        <p className="mt-1 text-sm text-gray-500">Manage your account details</p>
      </div>

      {/* Avatar + Name */}
      <div className="glass rounded-2xl border border-white/5 p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Account Info
        </h2>

        {/* Avatar */}
        <div className="flex items-center gap-5">
          <div className="relative">
            <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-brand-gradient text-xl font-bold text-white shadow-lg shadow-brand-500/20">
              {user?.avatarUrl ? (
                <img
                  src={user.avatarUrl}
                  alt="Avatar"
                  className="h-full w-full rounded-2xl object-cover"
                />
              ) : (
                initials
              )}
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar}
              className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-surface-600 border border-white/10 text-gray-400 hover:text-white transition-colors"
            >
              {uploadingAvatar ? (
                <div className="h-3 w-3 animate-spin rounded-full border border-white/50 border-t-transparent" />
              ) : (
                <Camera className="h-3 w-3" />
              )}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleAvatarChange}
            />
          </div>

          <div>
            <p className="font-medium text-white">{user?.name ?? 'No name set'}</p>
            <p className="text-sm text-gray-500">{user?.email}</p>
            <div className="mt-1 flex items-center gap-1.5">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                  user?.emailVerified
                    ? 'bg-green-500/10 text-green-400'
                    : 'bg-yellow-500/10 text-yellow-400'
                }`}
              >
                <CheckCircle2 className="h-3 w-3" />
                {user?.emailVerified ? 'Verified' : 'Unverified'}
              </span>
              <span className="rounded-full bg-brand-500/10 px-2 py-0.5 text-xs font-medium text-brand-400">
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Name field */}
        <Input
          label="Display Name"
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          icon={<User className="h-4 w-4" />}
          placeholder="Your full name"
        />

        <Button onClick={saveProfile} loading={saving} variant="primary" size="md">
          Save Changes
        </Button>
      </div>

      {/* Legal consent status */}
      <div className="glass rounded-2xl border border-white/5 p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Legal &amp; Compliance
        </h2>
        <div className="flex items-center gap-3 rounded-xl bg-green-500/5 border border-green-500/10 p-4">
          <ShieldAlert className="h-5 w-5 text-green-400 flex-shrink-0" />
          <div>
            <p className="text-sm font-medium text-white">
              Terms accepted{' '}
              {user?.legalConsented ? (
                <span className="text-green-400">✓</span>
              ) : (
                <span className="text-red-400">✗</span>
              )}
            </p>
            <p className="text-xs text-gray-500">
              You accepted the AiCruzz Legal Use &amp; Responsibility Notice at signup.
            </p>
          </div>
        </div>
      </div>

      {/* Change password */}
      <div className="glass rounded-2xl border border-white/5 p-6 space-y-5">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">
          Change Password
        </h2>

        <form onSubmit={changePassword} className="space-y-4" noValidate>
          <Input
            label="Current Password"
            type="password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm((f) => ({ ...f, currentPassword: e.target.value }))}
            error={pwErrors.currentPassword}
            icon={<Lock className="h-4 w-4" />}
            autoComplete="current-password"
          />
          <Input
            label="New Password"
            type="password"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm((f) => ({ ...f, newPassword: e.target.value }))}
            error={pwErrors.newPassword}
            icon={<Lock className="h-4 w-4" />}
            autoComplete="new-password"
            hint="Min. 8 characters, 1 uppercase, 1 number"
          />
          <Input
            label="Confirm New Password"
            type="password"
            value={pwForm.confirmPassword}
            onChange={(e) => setPwForm((f) => ({ ...f, confirmPassword: e.target.value }))}
            error={pwErrors.confirmPassword}
            icon={<Lock className="h-4 w-4" />}
            autoComplete="new-password"
          />
          <Button type="submit" loading={savingPw} variant="secondary" size="md">
            Update Password
          </Button>
        </form>
      </div>
    </div>
  );
}
