# Contexto de workflows n8n

Fuente: `n8n_data\database.sqlite` (tabla `workflow_entity`). El resumen se basa en nombres de nodos, triggers y conexiones visibles en cada workflow.

| Workflow | Activo | Trigger principal | Contexto |
| --- | --- | --- | --- |
| My workflow | No | Webhook | Webhook simple sin pasos adicionales. |
| Prueba-EVOLUTION | No | Webhook | Prueba de entrada por webhook, sin logica adicional. |
| Tally test | No | Webhook | Prueba de Tally, sin pasos adicionales. |
| [CF] 00 - Meta Webhook Verify | Si | Webhook GET | Verifica el webhook de Meta: valida token y responde challenge 200/403. |
| [CF] 00E - Evolution Health Check | No | Webhook GET | Endpoint de salud para Evolution, responde 200 OK. |
| [CF] 01-01B - WhatsApp Inbound Entry + Normalize | Si | Webhook POST Inbound | Entrada WhatsApp (Meta). Valida mensaje, arma envelope y deriva al resolver de tenant; descarta status updates. |
| [CF] 01BE - Evolution Normalize Payload | Si | Execute Workflow Trigger | Normaliza payload de Evolution a envelope JSON y continua al resolver de tenant. |
| [CF] 01E - Evolution Inbound Entry | Si | Webhook POST Evolution | Entrada Evolution: filtra eventos, detecta tipo y enruta a normalizacion o transcripcion de audio. |
| [CF] 01EA - Evolution Audio Transcribe | Si | Execute Workflow Trigger | Prepara audio (base64/URL), transcribe con Groq y reescribe inbound como texto; luego normaliza. |
| [CF] 02 - Tenant Resolver | No | Execute Workflow Trigger | Busca tenant en Supabase, valida activo, trae settings y arma envelope; registra errores en `message_log`. |
| [CF] 02 - Tenant Resolver (v2 Meta + Evolution) | Si | Execute Workflow Trigger | Resuelve tenant por canal (Evolution o Meta), obtiene settings y arma envelope; registra errores. |
| [CF] 03 - Message Logger Inbound | No | Execute Workflow Trigger | Inserta `message_log` en Supabase y pasa a bootstrap de usuario/sesion. |
| [CF] 03 - Message Logger Inbound | Si | Execute Workflow Trigger | Version activa del logger: inserta `message_log` y continua flujo. |
| [CF] 04 - User & Session Bootstrap | No | Execute Workflow Trigger | Upsert de usuario/sesion en Supabase y enruta a guardia de expiracion. |
| [CF] 04 - User & Session Bootstrap | Si | Execute Workflow Trigger | Upsert usuario; recupera/crea estado de sesion y enruta a guardia de expiracion. |
| [CF] 05 - Session Expiration Guard | No | Execute Workflow Trigger | Evalua expiracion, resetea sesion si expiro y notifica; si no, enruta al router. |
| [CF] 05 - Session Expiration Guard | Si | Execute Workflow Trigger | Version activa del guard: resetea sesion y enruta a router o notifica expiracion. |
| [CF] 06 - Router (State + Button-first) | No | Execute Workflow Trigger | Determina ruta conversacional, arma bienvenida/fallback y envia a modulos base. |
| [CF] 06 - Router (State + Button-first) | Si | Execute Workflow Trigger | Router principal: menu, intents/FAQ, disponibilidad, booking, cancelacion y admin; humaniza textos con Groq. |
| [CF] 07 - Patient Manager | No | Execute Workflow Trigger | Gestion de pacientes en Supabase (GET/INSERT) y actualizacion de sesion. |
| [CF] 07 - Patient Manager | Si | Execute Workflow Trigger | Gestion de pacientes con rutas a disponibilidad y NLP de nombre via Groq. |
| [CF] 08 - Catalog Engine | No | Execute Workflow Trigger | Carga servicios activos desde Supabase y envia catalogo. |
| [CF] 08 - Catalog Engine | Si | Execute Workflow Trigger | Catalogo con rutas a paciente/disponibilidad y NLP de servicio via Groq. |
| [CF] 09 - Intent Helper (GROQ) | Si | Execute Workflow Trigger | Clasifica intencion con Groq y enruta a catalogo, cancelacion o FAQ; genera saludo. |
| [CF] 10 - FAQ Helper (GROQ + tenant context) | Si | Execute Workflow Trigger | Responde FAQ con contexto del tenant usando Groq y envia respuesta. |
| [CF] 11 - Availability Engine (Cal.com) | Si | Execute Workflow Trigger | Consulta slots en Cal.com, procesa y guarda en sesion; NLP de slot y deriva a booking. |
| [CF] 12 - Booking Processor (Cal.com + Supabase) | Si | Execute Workflow Trigger | Crea booking en Cal.com, guarda cita en Supabase, confirma y resetea sesion; humaniza con Groq. |
| [CF] 13 - Cancel / Reschedule Processor | Si | Execute Workflow Trigger | Cancela o reagenda citas: consulta/actualiza Supabase, usa Cal.com y arma mensajes. |
| [CF] 14E - WhatsApp Outbound Sender (Evolution) | No | Execute Workflow Trigger | Construye payload y envia mensajes por Evolution; log en Supabase. |
| [CF] 14E - WhatsApp Outbound Sender (Evolution) | Si | Execute Workflow Trigger | Version activa del outbound sender para Evolution. |
| [CF] 15 - Reminder System | Si | Schedule Trigger (cada 15 min) | Ventanas 24h/2h, humaniza con Groq, envia por Evolution y registra recordatorios. |
| [CF] 16 - Admin Flow | Si | Execute Workflow Trigger | Verifica admin; clasifica comandos con Groq; agenda, stats, pacientes y control de pausa/activacion. |
| [CF] 17 - Tally Onboarding Intake | Si | Webhook POST Tally | Onboarding: crea tenant/admin/settings/services en Supabase y notifica admin por Evolution. |
