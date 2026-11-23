'use client';

import { publicRegistroApi, type PublicBarrio } from '@/lib/public-registro-api';
import { mapRegistroApiError } from '@/lib/registro-errors';
import { isValidPhoneNumber, toDigitsE164 } from '@/lib/phone-utils';
import { useCallback, useEffect, useMemo, useState } from 'react';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type RegistroFormData = {
  fullName: string;
  phone: string;
  email: string;
  neighborhoodId: string;
  interests: string[];
  consentGiven: boolean;
};

export type RegistroValidationStatus = {
  fullName: 'empty' | 'invalid' | 'valid';
  phone: 'empty' | 'invalid' | 'valid';
  email: 'empty' | 'invalid' | 'valid';
  neighborhoodId: 'empty' | 'invalid' | 'valid';
  consent: 'unchecked' | 'valid';
};

export function useRegistroCiudadano() {
  const [formData, setFormData] = useState<RegistroFormData>({
    fullName: '',
    phone: '',
    email: '',
    neighborhoodId: '',
    interests: [],
    consentGiven: false,
  });
  const [errors, setErrors] = useState<Partial<Record<keyof RegistroFormData | 'form', string>>>(
    {},
  );
  const [touched, setTouched] = useState<Partial<Record<keyof RegistroFormData, boolean>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [barrios, setBarrios] = useState<PublicBarrio[]>([]);
  const [barriosLoading, setBarriosLoading] = useState(true);
  const [barriosError, setBarriosError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBarriosLoading(true);
      const res = await publicRegistroApi.listBarrios();
      if (cancelled) return;
      if (res.ok) {
        setBarrios(res.data.barrios);
        setBarriosError(null);
      } else {
        setBarrios([]);
        setBarriosError(mapRegistroApiError(res));
      }
      setBarriosLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const validationStatus = useMemo((): RegistroValidationStatus => {
    const fn = formData.fullName.trim();
    const fullName: RegistroValidationStatus['fullName'] =
      fn.length === 0 ? 'empty' : fn.length < 2 ? 'invalid' : 'valid';

    const phoneTrimmed = formData.phone.trim();
    const phone: RegistroValidationStatus['phone'] =
      phoneTrimmed.length === 0 ? 'empty' : isValidPhoneNumber(phoneTrimmed) ? 'valid' : 'invalid';

    const em = formData.email.trim();
    const email: RegistroValidationStatus['email'] =
      em.length === 0 ? 'empty' : EMAIL_RE.test(em) ? 'valid' : 'invalid';

    const neighborhoodId: RegistroValidationStatus['neighborhoodId'] =
      formData.neighborhoodId.length === 0 ? 'empty' : 'valid';

    const consent: RegistroValidationStatus['consent'] = formData.consentGiven
      ? 'valid'
      : 'unchecked';

    return { fullName, phone, email, neighborhoodId, consent };
  }, [formData]);

  const handleChange = useCallback((field: keyof RegistroFormData, value: string | boolean) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setErrors((e) => {
      const next = { ...e };
      delete next[field];
      if (next.form) delete next.form;
      return next;
    });
  }, []);

  const toggleInterest = useCallback((id: string) => {
    setFormData((prev) => ({
      ...prev,
      interests: prev.interests.includes(id)
        ? prev.interests.filter((i) => i !== id)
        : [...prev.interests, id],
    }));
  }, []);

  const handleBlur = useCallback((field: keyof RegistroFormData) => {
    setTouched((t) => ({ ...t, [field]: true }));
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (isSubmitting) return;

      const nextErrors: Partial<Record<keyof RegistroFormData | 'form', string>> = {};
      if (validationStatus.fullName !== 'valid') {
        nextErrors.fullName = 'Ingresa tu nombre completo (al menos 2 caracteres).';
      }
      if (validationStatus.phone !== 'valid') {
        nextErrors.phone = 'Ingresá un teléfono válido.';
      }
      if (validationStatus.email === 'invalid') {
        nextErrors.email = 'Ingresa un correo válido o deja el campo vacío.';
      }
      if (validationStatus.neighborhoodId !== 'valid') {
        nextErrors.neighborhoodId = 'Selecciona tu barrio.';
      }
      if (validationStatus.consent !== 'valid') {
        nextErrors.consentGiven = 'Debes aceptar el tratamiento de datos personales.';
      }
      if (barriosError || (!barriosLoading && barrios.length === 0)) {
        nextErrors.form =
          barriosError ?? 'No se pudieron cargar los barrios. Intenta recargar la página.';
      }

      if (Object.keys(nextErrors).length > 0) {
        setErrors(nextErrors);
        return;
      }

      setIsSubmitting(true);
      setErrors({});
      const payload = {
        fullName: formData.fullName.trim(),
        phone: toDigitsE164(formData.phone),
        neighborhoodId: formData.neighborhoodId,
        interests: formData.interests.length > 0 ? formData.interests : undefined,
        consentGiven: true as const,
        ...(formData.email.trim() ? { email: formData.email.trim() } : {}),
      };

      const result = await publicRegistroApi.registroCiudadano(payload);
      setIsSubmitting(false);
      if (result.ok) {
        setIsSuccess(true);
        return;
      }
      setErrors({ form: mapRegistroApiError(result) });
    },
    [barrios.length, barriosError, barriosLoading, formData, isSubmitting, validationStatus],
  );

  const reset = useCallback(() => {
    setFormData({
      fullName: '',
      phone: '',
      email: '',
      neighborhoodId: '',
      interests: [],
      consentGiven: false,
    });
    setErrors({});
    setTouched({});
    setIsSuccess(false);
  }, []);

  return {
    formData,
    errors,
    isSubmitting,
    isSuccess,
    validationStatus,
    handleChange,
    handleSubmit,
    toggleInterest,
    touched,
    handleBlur,
    barrios,
    barriosLoading,
    barriosError,
    reset,
  };
}
