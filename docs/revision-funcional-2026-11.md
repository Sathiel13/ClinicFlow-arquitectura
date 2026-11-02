# Revisión funcional de ClinicFlow — noviembre 2026

Revisión de los 19 workflows en producción (VPS Hetzner) y de los datos reales en Supabase. Fecha: 2 de noviembre de 2026.

## 1. Qué hace hoy el sistema

### Paciente (por WhatsApp)

| Capacidad | Cómo funciona | Workflow |
|---|---|---|
| Recibir texto y **notas de voz** | El audio se transcribe con Whisper (Groq) y se trata como texto | 01E, 01EA, 01BE |
| Evitar mensajes duplicados | `claim_inbound_message` en Supabase | 01E |
| Multi-clínica | Identifica la clínica por la instancia de Evolution | 02 |
| Recordar la conversación | `session_state` por usuario; expira a los 30 min de inactividad | 04, 05 |
| Menú | 1 Agendar · 2 Servicios · 3 Preguntas frecuentes (saludo humanizado con IA) | 06 |
| Entender texto libre | Palabras clave + clasificador de intención con IA (agendar, servicios, cancelar, reagendar, FAQ, saludo) | 06, 09 |
| Elegir servicio | Por número, nombre, sinónimos o IA ("me duele el pecho" → cardiología) | 08 |
| Elegir médico | Si el servicio lo dan varios doctores | 08 |
| Pacientes por número | Un mismo WhatsApp puede agendar para varias personas (familia) | 07 |
| Ver horarios | Cal.com, próximos 14 días, hasta 8 opciones agrupadas por día | 11 |
| Elegir horario | Por número o en lenguaje natural ("el martes a las 10") con IA | 06, 11 |
| Reservar | Crea la cita en Cal.com y en Supabase; confirmación humanizada con IA | 12 |
| Cancelar / reagendar | Escribiendo "cancelar" o "reagendar"; muestra sus próximas citas | 13 |
| Preguntas frecuentes | IA con el contexto de la clínica (FAQ, horario, ubicación, políticas) | 10 |
| Recordatorios | 24 h y 2 h antes, humanizados con IA | 15 |

### Clínica

| Capacidad | Cómo funciona | Workflow |
|---|---|---|
| Alta de clínica | Formulario de Tally → crea tenant, admin, configuración y servicios | 17 |
| Panel por WhatsApp | `administrar` → agenda de hoy/mañana, estado, pacientes, pausar/activar bot | 16 |

### Uso real (Supabase)

- 535 mensajes recibidos (marzo–agosto), 21 pacientes, 46 citas (38 reservadas, 7 canceladas, 1 no-show).
- Lo más escrito: "1" (114), "hola" (91), "2" (45), "3" (35). **La gente usa el menú por números.**
- Conversación típica: 3 mensajes (mediana); el 10 % llega a 11 o más.

## 2. Problemas encontrados

### Bugs (corregir antes de probar con un número real)

> **Estado al 2 de noviembre:** B1, B2, B3, B4, B5 y B7 corregidos y en producción (`scripts/n8n/fix_week10.py`), con 21 pruebas del código de los nodos. Falta probarlos con un número real: ver `docs/plan-de-pruebas-semana10.md`. B6 queda para la semana 11.

| # | Problema | Evidencia | Impacto |
|---|---|---|---|
| B1 | **Saludos detectados dentro de otras palabras.** El router busca "ola", "hola", "inicio"… con `includes` y lo hace *antes* de revisar en qué paso va la conversación | CF-06 `menuWords` | Si el paciente escribe su nombre y es **Paola, Fabiola, Yolanda, Nicolás, Lola…**, el bot lo regresa al menú y pierde el avance |
| B2 | **Las respuestas del bot no se registran.** El nodo "Supabase — Log outbound" tiene `=={{` (doble `=`) | 0 mensajes `outbound` en `message_log` | Sin historial de lo que dijo el bot: no hay auditoría, métricas ni contexto para la IA |
| B3 | **Comandos de admin no funcionan como dice la ayuda.** La ayuda pide escribir "agenda hoy", pero el router no recuerda el modo admin | CF-06 no tiene paso `admin` | "agenda hoy" se interpreta como paciente queriendo agendar |
| B4 | **"pausar" no se puede deshacer por WhatsApp.** El router revisa `is_bot_enabled` antes que el comando admin | CF-06, primeras líneas | Tras pausar, el bot ignora también al admin; hay que reactivarlo en Supabase a mano |
| B5 | **Ciclo bot contra bot.** Una respuesta automática de otro negocio escribió 15 veces en 66 s y el bot contestó cada vez | `message_log` 22-abr | Gasto de IA, posible bloqueo del número por WhatsApp |
| B6 | **Reserva sin confirmar cuando el horario se elige con IA.** "El martes a las 10" → si la IA tiene ≥ 70 % de confianza, reserva directo | CF-11 → CF-12 | Una mala interpretación crea una cita equivocada |
| B7 | **Al expirar la sesión se pierde el mensaje.** Tras 30 min, responde "tu sesión expiró" y no procesa lo que escribió | CF-05 | El paciente tiene que repetir |

### Faltantes importantes

| # | Falta | Por qué importa |
|---|---|---|
| F1 | **Confirmación de asistencia y liberación del horario** | Objetivo explícito del documento de residencia; hoy el recordatorio solo informa |
| F2 | **Estado después de la cita** (asistió / no asistió) | 38 citas pasadas siguen "reservadas"; no se pueden medir inasistencias (indicador del documento) |
| F3 | **Emergencias.** "Me duele el pecho y no puedo respirar" va a la IA de preguntas frecuentes | Riesgo real para un SaaS médico: debe responder con 911 y el teléfono de la clínica, sin IA |
| F4 | **Aviso de privacidad y consentimiento.** Se guardan nombres asociados a especialidades médicas (datos sensibles según la LFPDPPP) sin aviso ni consentimiento | Requisito legal en México para datos de salud |
| F5 | **Pasar con un humano.** No hay intención "hablar con recepción", y si la recepción contesta desde el teléfono, el bot sigue respondiendo encima | Evolution ya avisa cuando la clínica escribe (`fromMe`); se puede pausar el bot solo en esa conversación |
| F6 | **"Mis citas" en el menú.** Cancelar o reagendar solo funciona si el paciente sabe escribir la palabra | Agregar opción 4 |
| F7 | **Memoria en preguntas frecuentes.** Cada pregunta se responde sin las anteriores | Depende de B2 |

### Multi-negocio (para que sirva a algo más que clínicas)

| # | Hoy está fijo en el código | Debería |
|---|---|---|
| M1 | Sinónimos de especialidades (neumología, cardiología…) en CF-08 | Palabras clave por servicio en Supabase |
| M2 | Emoji 🦷 en el menú; "clínica dental" en prompts de confirmación y transcripción de audio | Tomarlo de `tenant_settings` (giro del negocio) |
| M3 | Palabras de agenda médicas en el router ("neumólogo", "pediatra"…) | Derivarlas de los servicios del tenant |

### Configuración de datos

| Clínica | Pendiente |
|---|---|
| Centro Médico del Patrocinio | **Sin administradores** (no puede usar el panel), sin mapa |
| Clínica Demo / Clinica Demo | **Duplicada** (con y sin acento); una sin administradores |
| DEMO FRANCISCO | Sin horario |
| Todas | Sin `assistant_prompt` salvo Centro Médico; pocas FAQ |

### Seguridad (pendiente de la semana 1)

- Llaves de Supabase, Groq, Cal.com y Evolution escritas dentro de los nodos → mover a Credenciales de n8n y rotarlas.

## 3. Plan propuesto (alineado al cronograma, entrega 10 de diciembre)

| Semana | Actividad del cronograma | Trabajo | Esfuerzo |
|---|---|---|---|
| **10** (3–9 nov) | 05/06 Flujos + mensajería | B1, B2, B3, B4, B5, B7 · admins y limpieza de tenants · **conectar número y pruebas** | Medio |
| **11** (10–16 nov) | 07 Citas y recordatorios | F1 confirmación + liberación · B6 confirmar horario elegido por IA · F6 "Mis citas" | Medio-alto |
| **12** (17–23 nov) | 07 Citas y recordatorios | F2 asistió/no asistió (comando admin + resumen diario) · F5 pasar con humano | Medio |
| **13** (24–30 nov) | 08/09 Despliegue + IA | F3 emergencias · F4 aviso de privacidad · M1–M3 · F7 memoria FAQ · llaves a Credenciales | Medio |
| **14** (1–7 dic) | 10 Pruebas y documentación | Pruebas integrales con la clínica piloto, métricas, documentación | — |
| 8–10 dic | — | Colchón | — |

### Para después del 10 de diciembre

- API de calendario propia (AgendaCore) en lugar de Cal.com.
- Panel web para la clínica (agenda, pacientes, métricas).
- Canal oficial de WhatsApp (Meta Cloud API) para clínicas grandes; Evolution queda para pruebas y clientes pequeños.
