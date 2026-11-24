'use client';

import { useEffect, useState } from 'react';
import { z } from 'zod';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { authStorage } from '@/lib/shared/auth-storage';
import { profileApi, type ProfileFields, type UserProfile } from '@/lib/perfil/profile-api';

const schema = z.object({
  nombre: z.string().trim().min(2, 'Ingresá al menos 2 caracteres.').max(255),
  correo: z.string().trim().email('Ingresá un correo electrónico válido.').max(255),
  telefono: z
    .string()
    .trim()
    .max(30)
    .refine(
      (value) =>
        value === '' ||
        (/^\+?[0-9 ()-]+$/.test(value) &&
          value.replace(/\D/g, '').length >= 7 &&
          value.replace(/\D/g, '').length <= 15),
      'Ingresá un teléfono válido de 7 a 15 dígitos.',
    ),
});

function fieldsFrom(user: UserProfile): ProfileFields {
  return { nombre: user.nombre ?? '', correo: user.correo, telefono: user.telefono ?? '' };
}

function syncSession(user: UserProfile) {
  const stored = authStorage.getUser();
  if (stored?.id === user.id) {
    authStorage.setUser({ ...stored, fullName: user.nombre ?? '', email: user.correo });
    window.dispatchEvent(new CustomEvent('vc:user-updated'));
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile>();
  const [fields, setFields] = useState<ProfileFields>({ nombre: '', correo: '', telefono: '' });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    void profileApi
      .get()
      .then((result) => {
        if (!active) return;
        if (result.ok) {
          setProfile(result.data.user);
          setFields(fieldsFrom(result.data.user));
          syncSession(result.data.user);
        } else {
          setError(result.message);
        }
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('No fue posible cargar tu perfil.');
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [attempt]);

  const validation = schema.safeParse(fields);
  const errors = validation.success ? {} : validation.error.flatten().fieldErrors;
  const original = profile ? fieldsFrom(profile) : undefined;
  const dirty =
    original &&
    Object.keys(fields).some(
      (key) => fields[key as keyof ProfileFields] !== original[key as keyof ProfileFields],
    );

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validation.success || !dirty || saving) return;
    setSaving(true);
    setError('');
    try {
      const result = await profileApi.update(validation.data);
      if (!result.ok) {
        setError(result.message);
        toast.error(result.message);
        return;
      }
      setProfile(result.data.user);
      setFields(fieldsFrom(result.data.user));
      syncSession(result.data.user);
      toast.success('Tu perfil se actualizó correctamente.');
    } catch {
      setError('No fue posible guardar los cambios. Intentá nuevamente.');
      toast.error('No fue posible guardar los cambios.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="h-full overflow-y-auto p-4 md:p-8">
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Mi perfil</h2>
          <p className="text-sm text-muted-foreground">
            Consultá y actualizá tu información personal.
          </p>
        </div>
        {loading ? (
          <p role="status" className="flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Cargando perfil…
          </p>
        ) : !profile ? (
          <div className="space-y-4">
            <p role="alert" className="text-destructive">
              {error}
            </p>
            <Button
              className="hover:cursor-pointer"
              onClick={() => setAttempt((value) => value + 1)}
            >
              Reintentar
            </Button>
          </div>
        ) : (
          <>
            <section
              aria-label="Información de la cuenta"
              className="flex flex-wrap items-center gap-4 rounded-xl border bg-card p-6"
            >
              <div
                aria-hidden="true"
                className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary"
              >
                {(profile.nombre || profile.correo)
                  .trim()
                  .split(/\s+/)
                  .slice(0, 2)
                  .map((part) => part[0])
                  .join('')
                  .toUpperCase()}
              </div>
              <div className="min-w-0 space-y-1">
                <p className="break-words font-semibold">{profile.nombre || profile.correo}</p>
                <p className="text-sm text-muted-foreground">
                  Rol: {profile.roles.map((role) => role.name).join(', ') || 'Sin rol asignado'}
                </p>
                <p className="text-sm text-muted-foreground">
                  Fecha de registro:{' '}
                  {new Date(profile.fechaRegistro).toLocaleDateString('es-MX', {
                    dateStyle: 'long',
                  })}
                </p>
              </div>
            </section>
            <form
              onSubmit={save}
              noValidate
              aria-busy={saving}
              className="space-y-5 rounded-xl border bg-card p-6"
            >
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              {(
                [
                  ['nombre', 'Nombre completo', 'text', 'name'],
                  ['correo', 'Correo electrónico', 'email', 'email'],
                  ['telefono', 'Número de teléfono', 'tel', 'tel'],
                ] as const
              ).map(([key, label, type, autoComplete]) => (
                <div key={key} className="space-y-2">
                  <Label htmlFor={key}>{label}</Label>
                  <Input
                    id={key}
                    type={type}
                    autoComplete={autoComplete}
                    value={fields[key]}
                    disabled={saving}
                    maxLength={key === 'telefono' ? 30 : 255}
                    required={key !== 'telefono'}
                    aria-invalid={!!errors[key]?.length}
                    aria-describedby={errors[key]?.length ? `${key}-error` : undefined}
                    onChange={(event) =>
                      setFields((current) => ({ ...current, [key]: event.target.value }))
                    }
                  />
                  {errors[key]?.[0] && (
                    <p id={`${key}-error`} className="text-sm text-destructive">
                      {errors[key]?.[0]}
                    </p>
                  )}
                </div>
              ))}
              <p className="text-xs text-muted-foreground">
                El teléfono es opcional. Podés incluir el prefijo internacional.
              </p>
              <div className="flex flex-wrap justify-end gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="hover:cursor-pointer"
                  disabled={!dirty || saving}
                  onClick={() => {
                    setFields(fieldsFrom(profile));
                    setError('');
                  }}
                >
                  Cancelar
                </Button>
                <Button
                  type="submit"
                  className="hover:cursor-pointer"
                  disabled={!dirty || !validation.success || saving}
                >
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
