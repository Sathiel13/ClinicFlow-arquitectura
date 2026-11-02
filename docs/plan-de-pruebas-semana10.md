# Plan de pruebas — semana 10 (integración de mensajería)

Actividad 06 del cronograma. Se ejecuta con un número de WhatsApp de pruebas conectado a ClinicFlow en producción.

## 0. Preparación

| Paso | Cómo | Listo |
|---|---|---|
| Elegir clínica de prueba | **Clínica Demo** (instancia `ClinicFlow-Pruebas-Demos`) o **Centro Médico del Patrocinio** (`Multimedico-test`, 6 doctores) | ☐ |
| Conectar el número | Abrir `https://evo.89-167-5-55.sslip.io/manager`, entrar con la API key de Evolution, abrir la instancia → **QR** → en el teléfono: WhatsApp → Dispositivos vinculados → Vincular | ☐ |
| Registrar un administrador | Agregar el número del admin en `tenant_admins` de esa clínica | ☐ |
| Segundo teléfono | El "paciente" escribe desde **otro** número | ☐ |

Usa un número de pruebas, no el personal: Evolution conecta WhatsApp de forma no oficial.

## 1. Flujo del paciente

| # | Escribir | Resultado esperado | OK |
|---|---|---|---|
| P1 | `hola` | Saludo con el nombre de la clínica + menú 1/2/3 | ☐ |
| P2 | `1` | Lista de servicios | ☐ |
| P3 | número de un servicio | Lista de médicos (si hay varios) o pide nombre del paciente | ☐ |
| P4 | nombre completo, p. ej. **`Paola Hernández`** | Lo registra y muestra horarios (**antes regresaba al menú**) | ☐ |
| P5 | número de un horario | "✅ Tu cita quedó confirmada…" con fecha correcta | ☐ |
| P6 | `cancelar` → número de la cita | Cita cancelada; desaparece en Cal.com | ☐ |
| P7 | `quiero cita con el pediatra` | Va directo al servicio de pediatría | ☐ |
| P8 | Nota de voz: "quiero agendar una cita" | Se transcribe y entra al flujo de agendar | ☐ |
| P9 | `¿dónde están ubicados?` | Respuesta con datos de la clínica, sin inventar | ☐ |
| P10 | `reagendar` → elegir cita → nuevo horario | Cita movida en Cal.com y en Supabase | ☐ |

## 2. Correcciones de la semana 10

| # | Prueba | Esperado | OK |
|---|---|---|---|
| B1 | En el paso de nombre, escribir `Yolanda Ruiz` o `Nicolás Pérez` | Se registra el paciente (no vuelve al menú) | ☐ |
| B2 | Después de P1–P5, revisar `message_log` en Supabase | Hay filas `direction = outbound` con lo que respondió el bot | ☐ |
| B3 | Admin: `administrar` → `agenda hoy` → `pacientes` → `salir` | Cada comando responde; `salir` vuelve al menú normal | ☐ |
| B4 | Admin: `administrar` → `pausar`; desde el paciente: `hola`; admin: `activar` | El paciente no recibe respuesta mientras está pausado; el admin sí puede reactivar | ☐ |
| B5 | Desde el paciente, mandar el mismo texto largo 3 veces seguidas (p. ej. `esto es una prueba`) | Al 3.º el bot deja de responder a ese chat por 10 minutos | ☐ |
| B7 | Empezar a agendar, esperar 31 minutos y escribir `quiero cita` | Se procesa directo (no pide repetirlo). Si se escribe solo un número, avisa que la sesión expiró | ☐ |

## 3. Recordatorios

| # | Prueba | Esperado | OK |
|---|---|---|---|
| R1 | Agendar una cita para dentro de ~2 h 10 min | Entre 1 h 45 min y 2 h 15 min antes llega el recordatorio de 2 h | ☐ |
| R2 | Revisar `appointments.reminder_2h_sent` | `true` después del envío | ☐ |

## 4. Qué revisar en cada prueba

- **n8n** (`https://n8n.89-167-5-55.sslip.io` → Executions): ninguna ejecución en rojo.
- **Supabase**: `appointments`, `session_state.current_step` y `message_log` (entrada y salida).
- **Cal.com**: la reserva o cancelación aparece reflejada.

Anota fecha, hora y resultado de cada caso: sirve como evidencia para el reporte de residencia (actividad 10).
