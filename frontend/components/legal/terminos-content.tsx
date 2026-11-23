import { legalConfig, legalRoutes, type LegalTocItem } from '@/lib/legal-config';
import Link from 'next/link';

/** Secciones (h2) de los Términos y Condiciones para la tabla de contenidos. */
export const terminosToc: LegalTocItem[] = [
  { id: 'aceptacion', label: '1. Aceptación de los Términos' },
  { id: 'registro', label: '2. Registro de Usuario' },
  { id: 'edad', label: '3. Requisitos de Edad' },
  { id: 'datos-personales', label: '4. Uso de la Información y Datos Personales' },
  { id: 'propiedad-intelectual', label: '5. Propiedad Intelectual' },
  { id: 'responsabilidad', label: '6. Limitación de Responsabilidad' },
  { id: 'suspension', label: '7. Suspensión o Cancelación de Cuenta' },
  { id: 'legislacion', label: '8. Legislación Aplicable' },
];

/** Cuerpo de los Términos y Condiciones de Uso. */
export function TerminosContent() {
  return (
    <>
      <h2 id="aceptacion">1. Aceptación de los Términos</h2>
      <p>
        El uso de la plataforma &quot;Nexo Comercial&quot; implica la aceptación plena y sin reservas
        de todos los términos aquí establecidos. Si no está de acuerdo, no deberá registrarse ni
        utilizar el sitio.
      </p>

      <h2 id="registro">2. Registro de Usuario</h2>
      <p>
        Para utilizar la plataforma, el usuario deberá registrarse proporcionando información{' '}
        <strong>veraz, exacta y completa</strong>. El usuario es el único responsable de la
        confidencialidad de su contraseña y de todas las actividades que se realicen en su cuenta.
      </p>

      <h2 id="edad">3. Requisitos de Edad</h2>
      <p>
        El usuario declara tener <strong>18 años o más</strong> al momento del registro, en
        cumplimiento con los requisitos para ser elector en México.
      </p>

      <h2 id="datos-personales">4. Uso de la Información y Datos Personales</h2>
      <p>
        El usuario otorga su consentimiento para el tratamiento de sus datos personales conforme a
        lo establecido en el <Link href={legalRoutes.privacy}>Aviso de Privacidad</Link> de la
        plataforma. Los datos capturados (CURP, Clave de Elector, etc.) serán utilizados
        exclusivamente para los fines de vinculación y comunicación de la precampaña.
      </p>

      <h2 id="propiedad-intelectual">5. Propiedad Intelectual</h2>
      <p>
        Todos los contenidos de la plataforma (textos, logotipos, diseños) son propiedad de
        &quot;Nexo Comercial&quot; o de sus licenciantes. Queda prohibida su reproducción sin
        autorización previa.
      </p>

      <h2 id="responsabilidad">6. Limitación de Responsabilidad</h2>
      <p>
        &quot;Nexo Comercial&quot; no será responsable por daños o perjuicios derivados del uso
        indebido de la plataforma por parte del usuario, el acceso no autorizado a su cuenta por
        negligencia del usuario, o fallos técnicos de la plataforma. La participación es voluntaria
        y el usuario es responsable de sus actos.
      </p>

      <h2 id="suspension">7. Suspensión o Cancelación de Cuenta</h2>
      <p>
        Nos reservamos el derecho de suspender o cancelar cuentas de usuario que proporcionen
        información falsa, incumplan estos términos, o que a nuestro criterio, realicen un uso
        indebido de la plataforma.
      </p>

      <h2 id="legislacion">8. Legislación Aplicable</h2>
      <p>
        Los presentes Términos y Condiciones se rigen por las leyes de los Estados Unidos Mexicanos.
        Para cualquier controversia, las partes se someten a la jurisdicción de los tribunales
        competentes en la Ciudad de México.
      </p>

      <p>
        <strong>Última actualización:</strong> {legalConfig.lastUpdated}
      </p>
    </>
  );
}
