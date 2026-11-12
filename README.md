# CoffeLink — CRM especializado para distribución de café a cafeterías

Trabajo práctico de **Gestión Aplicada al Desarrollo de Software II** (UNLaM). Es un CRM especializado en un distribuidor y tostador de café que vende a cafeterías, bares, panaderías y otros locales gastronómicos.

## Cómo ejecutarlo

Necesitás Node.js 18 o superior. No hay dependencias que instalar.

```bash
node server.js        # o: npm start
```

Después abrí <http://localhost:3000>. La primera ejecución crea `data/db.json` con datos de ejemplo. Si borrás ese archivo, el sistema vuelve al estado inicial.

| Usuario     | Contraseña | Rol                    |
|-------------|------------|------------------------|
| `admin`     | 12345      | Administrador          |
| `comercial` | 12345      | Responsable comercial  |
| `vendedor`  | 12345      | Vendedor (Lucía)       |
| `martin`    | 12345      | Vendedor (Martín)      |

## Arquitectura

- **`server.js`**: backend HTTP en Node puro. Guarda los datos en un archivo JSON. Ahí se validan todos los permisos y reglas de negocio (regla 12). Las contraseñas se guardan con **scrypt y sal aleatoria** (regla 13). Las sesiones usan un token que vence a las 8 horas.
- **`index.html`**: la interfaz, una sola página sin frameworks que consume la API. Escapa todos los datos que muestra, para evitar inyección de HTML.

## Especialización de la industria

El rubro no se limita a cambiar nombres; se refleja en el modelo de datos y en el proceso:

- **Cafetería (empresa):** tipo de establecimiento, cantidad de sucursales, consumo estimado en kg/mes, proveedor de café actual y equipamiento (máquina propia, comodato propio o de otro proveedor, sin máquina).
- **Oportunidad:** volumen estimado en kg/mes, frecuencia de entrega y si incluye máquina en comodato.
- **Embudo:** Contacto inicial → Relevamiento → Degustación → Propuesta → Negociación → Ganada / Perdida. Las etapas se pueden configurar.
- **Regla propia del rubro:** las etapas marcadas como "exige degustación" (por defecto Propuesta, Negociación y Ganada) solo se alcanzan si la oportunidad tiene una actividad de **degustación** registrada.
- **Regla propia del rubro:** al ganar una oportunidad, la cafetería pasa automáticamente a estado **Cliente** (o el contacto, si es un cliente individual).
- Los orígenes, motivos de pérdida y tipos de actividad son propios del rubro, por ejemplo "No le gustó el perfil de sabor en la degustación" o "No acepta condiciones de comodato".

## Roles y permisos (validados en el backend)

| Acción | Admin | Resp. comercial | Vendedor |
|---|---|---|---|
| Usuarios, roles y configuración (etapas, tipos, orígenes, motivos) | ✔ | — | — |
| Ver información | Todo | Todo el equipo | Solo su cartera |
| Crear y editar cafeterías, contactos y oportunidades | ✔ | ✔ | Solo los propios |
| Asignar y reasignar responsables | ✔ | ✔ | — |
| Gestionar productos | ✔ | ✔ | Solo lectura |
| Cambiar etapa y marcar ganada o perdida | ✔ | ✔ | Sus oportunidades |
| Modificar o reabrir una oportunidad cerrada (con motivo) | ✔ | ✔ | — |

## Reglas de negocio implementadas

1. Toda oportunidad tiene responsable, una etapa actual y está asociada a una cafetería, a un contacto o a ambos. Si se indican los dos, el contacto debe pertenecer a esa cafetería.
2. El estado se deriva del tipo de etapa: una oportunidad abierta solo puede estar en etapas abiertas, y las etapas de cierre dejan el estado en Ganada o Perdida.
3. **Ganada** exige la fecha real de cierre (no futura) y el valor final. **Perdida** exige la fecha real de cierre y el motivo de pérdida.
4. Cada cambio de etapa se guarda como un registro independiente con etapa anterior, etapa nueva, fecha y hora, usuario y observación.
5. Una oportunidad cerrada no se puede modificar ni reabrir sin autorización: solo el responsable comercial o el administrador pueden hacerlo, y deben indicar un motivo. El cambio queda en la auditoría.
6. Las actividades registran tipo, fecha y hora (no puede ser futura), el usuario que la cargó, la entidad relacionada, la descripción y el resultado. No se editan ni se borran porque son hechos históricos.
7. No hay borrado físico: las cafeterías y contactos se dan de baja con los estados Inactivo o No contactar, y la configuración y los productos se deshabilitan.
8. Las altas y modificaciones registran quién y cuándo las hizo, con los campos que cambiaron.
9. La configuración del embudo exige al menos una etapa activa de cada tipo. No permite deshabilitar una etapa que tenga oportunidades abiertas, ni cambiar el tipo de una etapa que esté en uso.

## Módulo: visualización de indicadores

Es una pantalla nueva, **Indicadores**, disponible para los tres roles. Los cálculos se hacen en el servidor (`GET /api/indicators`) y respetan los permisos: el vendedor ve solo sus números y, si pide los de otro, el servidor responde 403. El responsable comercial y el administrador ven todo el equipo y pueden filtrar por vendedor.

| Indicador | Cálculo |
|---|---|
| Tasa de conversión | ganadas ÷ (ganadas + perdidas) cerradas en el período |
| Ventas ganadas | suma del valor final y de los kg/mes de las ganadas en el período |
| Tiempo promedio de cierre | días entre el alta y la fecha de cierre de las ganadas |
| Pipeline abierto | valor estimado de las oportunidades abiertas, y su valor ponderado (valor × probabilidad) |
| Pipeline por etapa | cantidad y valor de las oportunidades abiertas en cada etapa |
| Motivos de pérdida | cantidad y valor de las perdidas, por motivo |
| Ventas por producto y por vendedor | valor final ganado, y el detalle de cada vendedor |
| Actividades | interacciones registradas en el período |

Hay filtros por rango de fechas (con atajos: este mes, últimos 90 días, este año, todo) y por vendedor. El período se aplica a lo que se cerró o se registró en esas fechas. El pipeline abierto, en cambio, muestra siempre la situación actual.

## Pantallas

Inicio de sesión · Pantalla principal · Gestión de usuarios · Listado, alta, edición y detalle de cafeterías · Listado, alta, edición y detalle de contactos · Productos · Listado, alta, edición y detalle de oportunidades · Tablero por etapa (arrastrar y soltar) · Registro de actividad · Historial comercial (por cafetería, contacto u oportunidad) · Configuración de etapas, tipos de actividad, orígenes y motivos de pérdida · Indicadores.

Todos los listados tienen **búsqueda, filtros** (responsable, etapa, estado, origen y otros, según el listado) **y paginación**.

La funcionalidad de inteligencia artificial, que la consigna marca como opcional, no está incluida.
