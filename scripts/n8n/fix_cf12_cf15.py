"""Corrige CF-12 (reserva) y CF-15 (recordatorios) en los JSON exportados de n8n.

Uso: python fix_cf12_cf15.py <carpeta-con-workflows>
Es idempotente: si una corrección ya está aplicada, la salta.
"""
import json, os, sys, uuid

DIR = sys.argv[1]
CF12 = "wCjeF0Xd7vUXZq7c.json"
CF15 = "UBvE1gzVINp72g4l.json"


def load(f):
    return json.load(open(os.path.join(DIR, f), encoding="utf-8"))


def save(f, w):
    json.dump(w, open(os.path.join(DIR, f), "w", encoding="utf-8"), ensure_ascii=False, indent=2)


def node(w, name):
    for n in w["nodes"]:
        if n["name"] == name:
            return n
    raise SystemExit(f"No existe el nodo '{name}' en {w['name']}")


def replace(n, key, old, new):
    """Reemplaza texto dentro de un parámetro (string o JSON serializado)."""
    v = n["parameters"][key]
    s = v if isinstance(v, str) else json.dumps(v, ensure_ascii=False)
    if new in s and old not in s:
        return
    if old not in s:
        raise SystemExit(f"No encontré el texto a reemplazar en '{n['name']}'.{key}: {old[:60]}")
    s = s.replace(old, new)
    n["parameters"][key] = s if isinstance(v, str) else json.loads(s)


# ── CF-15 · Recordatorios ────────────────────────────────────────────────
w = load(CF15)

# 1) La tabla tenants no tiene is_active; usa status ('active' | 'paused')
replace(node(w, "Supabase — GET Tenant"), "queryParameters",
        "timezone,is_active", "timezone,status")
replace(node(w, "Enrich con Tenant"), "jsCode",
        "tenant.is_active         ?? true",
        "(tenant.status ?? 'active') === 'active'")

# 2) No enviar recordatorios de tenants pausados
replace(node(w, "Build & Send Reminder"), "jsCode",
        "if (!waNumber || !evoInstance || !ctx._bot_enabled) {",
        "if (!waNumber || !evoInstance || !ctx._bot_enabled || !ctx._tenant_active) {")
replace(node(w, "Build & Send Reminder"), "jsCode",
        "_skip_reason:  !ctx._bot_enabled ? 'bot_disabled'",
        "_skip_reason:  !ctx._tenant_active ? 'tenant_paused'\n                   : !ctx._bot_enabled ? 'bot_disabled'")

# 3) La rama "no enviar" llega a estos nodos sin pasar por 'Resolve Mensaje Final'.
#    'Build & Send Reminder' corre en ambas ramas, así que se toma de ahí.
SRC_OLD = "$('Resolve Mensaje Final').item.json._"
SRC_NEW = "$('Build & Send Reminder').item.json._"
marcar = node(w, "Supabase — Marcar recordatorio enviado")
replace(marcar, "queryParameters", SRC_OLD + "appt_id", SRC_NEW + "appt_id")
replace(marcar, "body", SRC_OLD + "reminder_field", SRC_NEW + "reminder_field")
B = "$('Build & Send Reminder').item.json"
node(w, "Supabase — Log recordatorio")["parameters"]["body"] = (
    "={{ JSON.stringify({"
    f" tenant_id: {B}._tenant_id,"
    f" user_wa: {B}._wa_number,"
    " direction: 'outbound',"
    " message_id: null,"
    " payload: {"
    f" type: {B}._skip_send ? 'reminder_skipped' : 'reminder',"
    f" reminder_type: {B}._reminder_type,"
    " body: $('Resolve Mensaje Final').isExecuted ? $('Resolve Mensaje Final').item.json._final_message : null,"
    f" skip_reason: {B}._skip_reason ?? null,"
    " channel: 'evolution'"
    " } }) }}"
)
save(CF15, w)
print("CF-15 corregido")

# ── CF-12 · Reserva ──────────────────────────────────────────────────────
w = load(CF12)

# 1) Si Cal.com responde error (p. ej. horario ya ocupado) no detener el flujo:
#    la respuesta sigue a 'Recover booking data', que la marca como calcom_failed.
node(w, "Cal.com — POST booking")["onError"] = "continueRegularOutput"

# 2) IF nuevo: solo guardar la cita y confirmar si Cal.com devolvió un booking
IF_NAME = "¿Booking creado en Cal.com?"
if not any(n["name"] == IF_NAME for n in w["nodes"]):
    rec = node(w, "Recover booking data")
    x, y = rec["position"]
    w["nodes"].append({
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                "conditions": [{
                    "id": "cf12-booking-ok",
                    "leftValue": "={{ !$json._booking_error }}",
                    "rightValue": "",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }],
                "combinator": "and",
            },
            "options": {},
        },
        "id": str(uuid.uuid4()),
        "name": IF_NAME,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": [x + 120, y + 160],
    })
    c = w["connections"]
    c["Recover booking data"] = {"main": [[{"node": IF_NAME, "type": "main", "index": 0}]]}
    c[IF_NAME] = {"main": [
        [{"node": "Supabase — INSERT appointment", "type": "main", "index": 0}],
        [{"node": "Build Error Booking", "type": "main", "index": 0}],
    ]}

# 3) Mensaje más claro cuando Cal.com rechaza la reserva
replace(node(w, "Build Error Booking"), "jsCode",
        "calcom_failed:      '⚠️ Hubo un problema al reservar tu cita. Intenta en unos minutos.'",
        "calcom_failed:      '⚠️ No pude reservar ese horario; es posible que se acabe de ocupar.\\n\\n"
        "Escribe *agendar* para ver horarios actualizados o *hola* para volver al menú.'")
save(CF12, w)
print("CF-12 corregido")
