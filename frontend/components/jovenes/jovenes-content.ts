import type { GalleryItem } from '@/components/public/galeria-section';
import type { Propuesta } from '@/components/public/propuestas-section';
import type { TestimonialItem } from '@/components/public/team-section';
import {
  Bot,
  Brain,
  Briefcase,
  Dumbbell,
  GraduationCap,
  Megaphone,
  Palette,
  Rocket,
} from 'lucide-react';

export const JOVENES_IMAGES = {
  hero: [
    { src: '/images/galeria-1.jpg', alt: 'Jóvenes de Cintalapa en asamblea comunitaria' },
    { src: '/images/galeria-2.jpg', alt: 'Jóvenes participando en una jornada de apoyos' },
    { src: '/images/galeria-3.jpg', alt: 'Jóvenes en un foro de liderazgo' },
    { src: '/images/galeria-4.jpg', alt: 'Jóvenes en recorrido territorial' },
    { src: '/images/galeria-5.jpg', alt: 'Jóvenes en una jornada de salud comunitaria' },
    { src: '/images/team-1.jpg', alt: 'Joven líder de Cintalapa' },
  ],
  compromiso: [
    { src: '/images/galeria-3.jpg', alt: 'Jóvenes aprendiendo en un taller comunitario' },
    { src: '/images/galeria-1.jpg', alt: 'Jóvenes debatiendo propuestas para su barrio' },
    { src: '/images/galeria-2.jpg', alt: 'Jóvenes usando tecnología en equipo' },
  ],
  jornadas: [
    { src: '/images/galeria-4.jpg', alt: 'Jóvenes en una jornada deportiva' },
    { src: '/images/galeria-5.jpg', alt: 'Jóvenes en una actividad cultural' },
    { src: '/images/galeria-1.jpg', alt: 'Jóvenes en una jornada de voluntariado' },
  ],
  escucha: [
    { src: '/images/galeria-3.jpg', alt: 'Jóvenes en un foro de debate' },
    { src: '/images/team-2.jpg', alt: 'Joven presentando una propuesta ciudadana' },
    { src: '/images/galeria-1.jpg', alt: 'Asamblea juvenil en Cintalapa' },
    { src: '/images/team-4.jpg', alt: 'Joven escuchando a su comunidad' },
  ],
} as const;

export const JOVENES_NAV_LINKS = [
  { label: 'Inicio', href: '/jovenes' },
  { label: 'Propuestas', href: '/jovenes#ejes' },
  { label: 'Eventos', href: '/jovenes#jornadas' },
  { label: 'Proyectos', href: '/jovenes#proyectos' },
  { label: 'Foro', href: '/jovenes#escucha' },
  { label: 'Contacto', href: '/jovenes#contacto' },
];

export const JOVENES_NAV_CTA = {
  label: 'Registrate',
  href: '/jovenes#escucha',
  variant: 'teal' as const,
};

export const JOVENES_FOOTER_LINKS = [
  { label: 'Inicio', href: '/jovenes' },
  { label: 'Ejes de acción', href: '/jovenes#ejes' },
  { label: 'Jornadas juveniles', href: '/jovenes#jornadas' },
  { label: 'Proyectos', href: '/jovenes#proyectos' },
];

export const JOVENES_FOOTER_CTA = {
  label: '¡Únete a la red de jóvenes!',
  href: '/jovenes#escucha',
};

export const JOVENES_INTERESES = [
  { id: 'educacion', label: 'Educación' },
  { id: 'empleo', label: 'Empleo' },
  { id: 'salud', label: 'Salud' },
  { id: 'campo', label: 'Campo' },
  { id: 'seguridad', label: 'Seguridad' },
  { id: 'agua', label: 'Agua' },
] as const;

export const JOVENES_EJES: Propuesta[] = [
  {
    icon: GraduationCap,
    title: 'Becas y apoyos estudiantiles',
    desc: 'Acompañamos a estudiantes de Cintalapa para gestionar becas, materiales y continuidad escolar.',
    full: {
      paragraphs: [
        'La escuela no debería frenarse por falta de recursos. En este eje canalizamos solicitudes de becas, uniformes, útiles y apoyos de transporte para que más jóvenes terminen la prepa y den el salto a la universidad.',
        'También vinculamos tutorías comunitarias y orientación vocacional para que cada joven tenga un plan claro, no solo un trámite.',
      ],
      benefits: [
        'Gestión de becas para prepa y universidad',
        'Apoyos de material y transporte escolar',
        'Tutorías con profesionistas locales',
        'Orientación vocacional en jornadas barriales',
      ],
    },
  },
  {
    icon: Briefcase,
    title: 'Oportunidades de trabajo',
    desc: 'Primer empleo, oficios y ferias laborales para que el talento joven se quede y crezca en Cintalapa.',
    full: {
      paragraphs: [
        'Muchas juventudes tienen oficio, energía y ganas, pero no una red que las conecte con empleo digno. Aquí organizamos ferias, directorios y talleres para el primer empleo.',
        'Priorizamos a quienes estudian y trabajan, y a quienes necesitan una primera experiencia formal sin migrar.',
      ],
      benefits: [
        'Ferias de empleo y oficios en colonias',
        'Talleres de CV, entrevista y derechos laborales',
        'Vinculación con negocios locales',
        'Acompañamiento al primer empleo',
      ],
    },
  },
  {
    icon: Rocket,
    title: 'Crea tu propio negocio',
    desc: 'Mentoría, microcréditos y ferias para que tu idea deje de caber solo en un cuaderno.',
    full: {
      paragraphs: [
        'El emprendimiento joven no es un eslogan: es una cocina, un taller, un canal digital o un puesto que sostiene a una familia. Acompañamos ideas con mentoría y acceso a apoyos.',
        'Buscamos que los negocios nazcan con formalidad básica, clientes reales y comunidad alrededor.',
      ],
      benefits: [
        'Mentorías con emprendedores locales',
        'Gestión de microcréditos y ferias de venta',
        'Talleres de costos, marca y ventas',
        'Directorio de proveedores jóvenes',
      ],
    },
  },
  {
    icon: Palette,
    title: 'Expresión artística',
    desc: 'Música, murales, danza y cultura viva para que Cintalapa se escuche y se vea joven.',
    full: {
      paragraphs: [
        'El arte es participación. Abrimos espacios para bandas, colectivos, muralistas y compañías locales que hoy ensayan sin escenario.',
        'Las jornadas culturales van a las colonias, no al revés: el barrio es el foro.',
      ],
      benefits: [
        'Jornadas culturales en colonias y ejidos',
        'Apoyo a colectivos y bandas locales',
        'Muralismo y memoria comunitaria',
        'Escenarios abiertos en fiestas barriales',
      ],
    },
  },
  {
    icon: Dumbbell,
    title: 'Vida activa y deporte',
    desc: 'Canchas, torneos y recreación para que el tiempo libre construya salud y comunidad.',
    full: {
      paragraphs: [
        'Un espacio deportivo recuperado cambia el ánimo de toda una colonia. Gestionamos canchas, torneos y clubes juveniles con reglas claras y cupo abierto.',
        'El deporte también es prevención: convivencia, disciplina y orgullo de barrio.',
      ],
      benefits: [
        'Recuperación de canchas y espacios públicos',
        'Torneos abiertos por colonia',
        'Clubes juveniles de futbol, basquet y atletismo',
        'Jornadas de activación física',
      ],
    },
  },
  {
    icon: Bot,
    title: 'Formación digital',
    desc: 'Programación, herramientas digitales y alfabetización tecnológica para el trabajo de hoy.',
    full: {
      paragraphs: [
        'La brecha digital no se cierra con un discurso. Abrimos talleres de herramientas digitales, programación introductoria y uso seguro de internet.',
        'Queremos que una joven de Cintalapa pueda armar un portafolio, un CV y un proyecto sin salir del municipio.',
      ],
      benefits: [
        'Talleres de ofimática y herramientas en la nube',
        'Introducción a programación y diseño',
        'Alfabetización digital para familias',
        'Espacios de práctica en jornadas comunitarias',
      ],
    },
  },
  {
    icon: Brain,
    title: 'Mente sana',
    desc: 'Salud mental, prevención y bienestar para que cuidar tu cabeza también sea prioridad pública.',
    full: {
      paragraphs: [
        'Hablar de ansiedad, duelo o presión familiar no es debilidad: es salud. Coordinamos pláticas, primeros auxilios psicológicos y canales de atención cercanos.',
        'El eje se trabaja con respeto, confidencialidad y sin estigmas.',
      ],
      benefits: [
        'Jornadas de salud mental en escuelas y barrios',
        'Talleres de prevención y autocuidado',
        'Canalización a servicios de atención',
        'Espacios de escucha entre pares',
      ],
    },
  },
  {
    icon: Megaphone,
    title: 'Tu voz en Cintalapa',
    desc: 'Foros, propuestas y seguimiento para que lo que dices no se quede en un comentario.',
    full: {
      paragraphs: [
        'Participar no es solo votar. Aquí las juventudes registran propuestas, asisten a foros y dan seguimiento a lo que se gestiona en su colonia.',
        'Nexo Comercial es el canal: tu reporte entra, se canaliza y se informa el avance.',
      ],
      benefits: [
        'Foros juveniles en colonias y ejidos',
        'Registro de propuestas con seguimiento',
        'Formación en liderazgo comunitario',
        'Red de jóvenes por barrio',
      ],
    },
  },
];

export const JOVENES_GALERIA: GalleryItem[] = [
  {
    id: 'jg1',
    src: '/images/galeria-1.jpg',
    caption: 'Asamblea juvenil: propuestas que salen del barrio y se gestionan en red',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'jg2',
    src: '/images/galeria-2.jpg',
    caption: 'Voluntariado y entrega de apoyos con jóvenes de Cintalapa',
    aspect: 'aspect-[3/4]',
  },
  {
    id: 'jg3',
    src: '/images/galeria-3.jpg',
    caption: 'Foro de liderazgo joven y debate público',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'jg4',
    src: '/images/galeria-4.jpg',
    caption: 'Jornada en territorio: deporte, campo y comunidad',
    aspect: 'aspect-square',
  },
  {
    id: 'jg5',
    src: '/images/galeria-5.jpg',
    caption: 'Brigada de bienestar y salud con participación juvenil',
    aspect: 'aspect-[4/3]',
  },
  {
    id: 'jg6',
    src: '/images/team-1.jpg',
    caption: 'Mentoría y acompañamiento entre pares',
    aspect: 'aspect-[3/4]',
  },
  {
    id: 'jg7',
    src: '/images/team-2.jpg',
    caption: 'Emprendimiento joven en talleres comunitarios',
    aspect: 'aspect-square',
  },
  {
    id: 'jg8',
    src: '/images/team-3.jpg',
    caption: 'Recuperación de espacios públicos con trabajo colectivo',
    aspect: 'aspect-[4/3]',
  },
];

export const JOVENES_TESTIMONIOS: TestimonialItem[] = [
  {
    id: 'yj1',
    name: 'Andrea López, 19',
    location: 'Colonia Centro, Cintalapa',
    img: '/images/team-1.jpg',
    short:
      'Por primera vez sentí que una propuesta de prepa no se quedaba en el pizarrón: la registramos y le dieron seguimiento.',
    full: 'Por primera vez sentí que una propuesta de prepa no se quedaba en el pizarrón: la registramos en Nexo Comercial y le dieron seguimiento. Pedíamos un espacio para estudiar por las tardes y hoy hay jornada juvenil en mi colonia. Eso me hizo creer que participar sí sirve.',
  },
  {
    id: 'yj2',
    name: 'Luis Hernández, 21',
    location: 'Barrio de Guadalupe',
    img: '/images/team-3.jpg',
    short:
      'El taller de oficios me conectó con mi primer empleo formal. Ya no era solo “échale ganas”: había un canal real.',
    full: 'El taller de oficios me conectó con mi primer empleo formal. Ya no era solo “échale ganas”: había un canal real, una feria y gente que te presenta. Sigo en Cintalapa y ahora yo llevo a dos amigos a las jornadas.',
  },
  {
    id: 'yj3',
    name: 'Marisol Cruz, 18',
    location: 'Colonia Ejidal',
    img: '/images/team-2.jpg',
    short:
      'Con la gestión de beca pude seguir en la prepa. Mi mamá no tenía cómo pagar el pasaje todos los días.',
    full: 'Con la gestión de beca pude seguir en la prepa. Mi mamá no tenía cómo pagar el pasaje todos los días. El trámite fue claro, sin vueltas raras, y hoy estoy en segundo año. Quiero estudiar enfermería y devolver el apoyo en las brigadas.',
  },
  {
    id: 'yj4',
    name: 'Diego Morales, 22',
    location: 'Santo Domingo, Cintalapa',
    img: '/images/team-4.jpg',
    short:
      'Recuperamos la cancha del barrio. Ahora entrenamos de noche y el espacio ya no está abandonado.',
    full: 'Recuperamos la cancha del barrio. Ahora entrenamos de noche y el espacio ya no está abandonado. Fue trabajo de varios: reporte, faena y seguimiento. El deporte nos juntó a los que antes ni nos hablábamos.',
  },
  {
    id: 'yj5',
    name: 'Paola Jiménez, 20',
    location: 'Barrio La Candelaria',
    img: '/images/team-2.jpg',
    short:
      'En el foro pude hablar de salud mental sin que se rieran. Eso también es política pública.',
    full: 'En el foro pude hablar de salud mental sin que se rieran. Eso también es política pública. Pedimos pláticas en la prepa y se abrió un espacio de escucha. No resuelve todo, pero ya no estamos solos con el tema.',
  },
  {
    id: 'yj6',
    name: 'Carlos Ramírez, 23',
    location: 'Ejido La Concordia',
    img: '/images/team-3.jpg',
    short:
      'Armé mi negocio de reparación con la mentoría. Vendí en la feria y ahora tengo clientes del pueblo.',
    full: 'Armé mi negocio de reparación con la mentoría. Vendí en la feria y ahora tengo clientes del pueblo. Antes pensaba que emprender era solo para quien tiene capital. Aquí el capital fue la red y el seguimiento.',
  },
];
