import { legalConfig, type LegalTocItem } from '@/lib/legal-config';

/** Secciones (h2) del Aviso de Privacidad para la tabla de contenidos. */
export const avisoPrivacidadToc: LegalTocItem[] = [
  { id: 'responsable', label: 'Responsable de los Datos' },
  { id: 'datos-recabados', label: 'Datos Personales que Recabamos' },
  { id: 'finalidades', label: 'Finalidades del Tratamiento de Datos' },
  { id: 'transferencia', label: 'Transferencia de Datos' },
  { id: 'derechos-arco', label: 'Derechos ARCO' },
  { id: 'cambios', label: 'Cambios al Aviso de Privacidad' },
];

/** Cuerpo del Aviso de Privacidad (LFPDPPP). */
export function AvisoPrivacidadContent() {
  return (
    <>
      <h2 id="responsable">Responsable de los Datos</h2>
      <p>
        &quot;Voz Ciudadana&quot;, representada por {legalConfig.responsibleName}, con domicilio en{' '}
        {legalConfig.address}, es el responsable del tratamiento de sus datos personales.
      </p>

      <h2 id="datos-recabados">Datos Personales que Recabamos</h2>
      <p>
        Para los fines de esta plataforma, podemos recabar los siguientes datos personales,
        incluyendo aquellos considerados <strong>sensibles</strong> según la ley:
      </p>
      <ul>
        <li>Nombre completo.</li>
        <li>CURP (Clave Única de Registro de Población).</li>
        <li>Clave de Elector (de la Credencial para Votar).</li>
        <li>Número de identificación de la Credencial para Votar (INE) y año de registro.</li>
        <li>Domicilio (con el fin de verificar tu distrito electoral).</li>
        <li>Número de teléfono y correo electrónico.</li>
      </ul>

      <h2 id="finalidades">Finalidades del Tratamiento de Datos</h2>
      <p>
        Sus datos serán utilizados para las siguientes finalidades{' '}
        <strong>primarias y necesarias</strong>:
      </p>
      <ol>
        <li>
          <strong>Identificación y Verificación:</strong> Para confirmar tu identidad y tu calidad
          como ciudadano mexicano habilitado para votar.
        </li>
        <li>
          <strong>Vinculación Ciudadana:</strong> Para registrar tu apoyo y simpatía hacia el
          candidato en su precampaña.
        </li>
        <li>
          <strong>Comunicación Política:</strong> Para enviarte información sobre las actividades,
          propuestas y eventos de la precampaña.
        </li>
        <li>
          <strong>Segmentación y Análisis:</strong> Para entender mejor el perfil de los
          simpatizantes y enfocar las estrategias de la campaña.
        </li>
      </ol>
      <p>
        <strong>Finalidades secundarias</strong> que <em>no son necesarias</em> y para las que
        solicitamos su consentimiento:
      </p>
      <ul>
        <li>
          Compartir información con otros candidatos o partidos aliados (en caso de coalición).
        </li>
        <li>Enviar información sobre futuros procesos electorales.</li>
      </ul>

      <h2 id="transferencia">Transferencia de Datos</h2>
      <p>
        Sus datos personales <strong>no serán transferidos</strong> a terceros ajenos a la campaña,
        salvo las siguientes excepciones:
      </p>
      <ul>
        <li>
          A autoridades competentes (como el INE o tribunales electorales) cuando sea requerido por
          ley.
        </li>
        <li>
          A proveedores de servicios tecnológicos (hosting, plataforma de envío de correos) que
          actúan únicamente por cuenta de &quot;Voz Ciudadana&quot; y están sujetos a las mismas
          obligaciones de confidencialidad.
        </li>
      </ul>

      <h2 id="derechos-arco">Derechos ARCO</h2>
      <p>
        Usted tiene derecho a ejercer sus derechos de <strong>A</strong>cceso, <strong>R</strong>
        ectificación, <strong>C</strong>ancelación y <strong>O</strong>posición al tratamiento de
        sus datos personales. Para ello, puede enviar una solicitud al correo electrónico:{' '}
        <a href={`mailto:${legalConfig.arcoEmail}`}>{legalConfig.arcoEmail}</a>.
      </p>

      <h2 id="cambios">Cambios al Aviso de Privacidad</h2>
      <p>Cualquier modificación a este aviso será publicada en nuestra página web.</p>

      <p>
        <strong>Última actualización:</strong> {legalConfig.lastUpdated}
      </p>
    </>
  );
}
