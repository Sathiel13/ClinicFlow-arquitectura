"""Correcciones de la semana 10 (ver docs/revision-funcional-2026-11.md).

Uso: python fix_week10.py <carpeta_entrada> <carpeta_salida>
  - Lee workflows exportados de n8n (crudos), corrige y escribe SOLO los que cambiaron.
  - Idempotente: si una corrección ya está aplicada, la salta.

B1  Router: saludos solo como palabra completa; al pedir el nombre, solo si el mensaje es SOLO el saludo
B2  Outbound Sender: el registro en message_log tenía "=={{" (doble =) y fallaba siempre
B3  Router + Admin: "modo admin" persistente (current_step = admin_mode) hasta escribir "salir"
B4  Router: con el bot pausado, el admin sí puede entrar al panel y reactivarlo
B5  Inbound Entry: freno anti-bucle (ráfagas, texto repetido, respuestas automáticas)
B7  Session Guard: al expirar la sesión, si el mensaje tiene texto se procesa en vez de perderse
"""
import copy, glob, json, os, sys, uuid

SRC, DST = sys.argv[1], sys.argv[2]
os.makedirs(DST, exist_ok=True)

wfs = {}
for f in glob.glob(os.path.join(SRC, "*.json")):
    w = json.load(open(f, encoding="utf-8"))
    if w.get("active"):
        wfs[w["name"]] = w
changed = set()
log = []


def wf(prefix):
    hits = [w for n, w in wfs.items() if n.startswith(prefix)]
    if len(hits) != 1:
        raise SystemExit(f"Esperaba 1 workflow activo que empiece con '{prefix}', hay {len(hits)}")
    return hits[0]


def node(w, name):
    for n in w["nodes"]:
        if n["name"] == name:
            return n
    raise SystemExit(f"No existe el nodo '{name}' en {w['name']}")


def has_node(w, name):
    return any(n["name"] == name for n in w["nodes"])


def code_replace(w, node_name, old, new, tag, key="jsCode"):
    n = node(w, node_name)
    c = n["parameters"][key]
    if new in c:
        log.append(f"= {tag} ya aplicado")
        return
    if c.count(old) != 1:
        raise SystemExit(f"{tag}: el texto a reemplazar aparece {c.count(old)} veces en '{node_name}'")
    n["parameters"][key] = c.replace(old, new)
    changed.add(w["name"])
    log.append(f"+ {tag}")


def if_node(name, expr, position, cond_id):
    return {
        "parameters": {
            "conditions": {
                "options": {"caseSensitive": True, "leftValue": "", "typeValidation": "strict", "version": 2},
                "conditions": [{
                    "id": cond_id,
                    "leftValue": expr,
                    "rightValue": "",
                    "operator": {"type": "boolean", "operation": "true", "singleValue": True},
                }],
                "combinator": "and",
            },
            "options": {},
        },
        "id": str(uuid.uuid4()),
        "name": name,
        "type": "n8n-nodes-base.if",
        "typeVersion": 2.2,
        "position": position,
    }


def link(w, src, outputs):
    """outputs: lista por salida, cada una lista de nombres de nodo destino."""
    w["connections"][src] = {"main": [[{"node": d, "type": "main", "index": 0} for d in out] for out in outputs]}


# ───────────────────────────── CF-06 Router ─────────────────────────────
r = wf("[CF] 06 - Router")

# B4: quitar el corte temprano por bot pausado (se vuelve a evaluar más abajo, después del modo admin)
code_replace(
    r, "Determinar Ruta",
    "if (!botEnabled) {\n  return [{ json: { ...envelope, _route: 'bot_disabled' } }];\n}",
    "// (B4) La revisión de bot pausado se hace después de detectar al admin; ver \"MODO ADMIN\".",
    "B4 router: quitar corte temprano por bot pausado",
)

# B1: saludos como palabra completa
code_replace(
    r, "Determinar Ruta",
    "const wantsMenu      = menuWords.some(w => normalizedText.includes(normalize(w)));",
    "// (B1) Palabras completas: evita que \"Paola\", \"Yolanda\" o \"Nicolás\" cuenten como \"hola\".\n"
    "const toWords = (v) => normalize(v).replace(/[^a-z0-9: ]+/g, ' ').replace(/\\s+/g, ' ').trim();\n"
    "const hasWord = (phrase) => { const p = toWords(phrase); return p.length > 0 && (' ' + normalizedWords + ' ').includes(' ' + p + ' '); };\n"
    "// Mientras se espera texto libre (nombre del paciente), solo cuenta si el mensaje es SOLO el saludo.\n"
    "const freeTextStep   = step === 'awaiting_patient_name';\n"
    "const wantsMenu      = freeTextStep\n"
    "  ? menuWords.some(w => normalizedWords === toWords(w))\n"
    "  : menuWords.some(hasWord);",
    "B1 router: saludos como palabra completa",
)

# B3 + B4: modo admin persistente y bot pausado
code_replace(
    r, "Determinar Ruta",
    "// ── PRIORIDAD 1: INTERACTIVOS",
    "// ── MODO ADMIN (B3) y BOT PAUSADO (B4) ───────────────────────────────\n"
    "// CF-16 deja current_step = 'admin_mode' al verificar al admin. Todo lo que escriba se va al panel\n"
    "// hasta que escriba \"salir\" (o la sesión expire por inactividad).\n"
    "const exitAdminWords = ['salir', 'exit', 'menu', 'inicio', 'hola'];\n"
    "if (step === 'admin_mode') {\n"
    "  if (exitAdminWords.includes(normalizedWords)) return cleanToMenu();\n"
    "  return [{ json: { ...envelope, _route: 'admin' } }];\n"
    "}\n"
    "if (!botEnabled && !wantsAdmin) {\n"
    "  return [{ json: { ...envelope, _route: 'bot_disabled' } }];\n"
    "}\n\n"
    "// ── PRIORIDAD 1: INTERACTIVOS",
    "B3/B4 router: modo admin y bot pausado",
)

# ───────────────────────────── CF-16 Admin ─────────────────────────────
a = wf("[CF] 16 - Admin Flow")
MODE_NODE = "Supabase — Activar modo admin"
if not has_node(a, MODE_NODE):
    ver = node(a, "Supabase — Verificar admin")
    n = copy.deepcopy(ver)
    n["id"] = str(uuid.uuid4())
    n["name"] = MODE_NODE
    n["position"] = [ver["position"][0] + 660, ver["position"][1] + 320]
    p = n["parameters"]
    p["method"] = "PATCH"
    p["url"] = p["url"].replace("/rest/v1/tenant_admins", "/rest/v1/session_state")
    p["sendQuery"] = True
    p["queryParameters"] = {"parameters": [{"name": "id", "value": "=eq.{{ $json.session.session_id }}"}]}
    hdrs = [h for h in p["headerParameters"]["parameters"] if h["name"] in ("apikey", "Authorization")]
    hdrs += [{"name": "Content-Type", "value": "application/json"}, {"name": "Prefer", "value": "return=minimal"}]
    p["headerParameters"] = {"parameters": hdrs}
    p["sendBody"] = True
    p["contentType"] = "raw"
    p["rawContentType"] = "application/json"
    p["body"] = "={{ JSON.stringify({ current_step: 'admin_mode', updated_at: new Date().toISOString() }) }}"
    n["onError"] = "continueRegularOutput"   # si falla, el admin igual recibe su respuesta
    a["nodes"].append(n)
    outs = a["connections"]["IF — ¿Es admin válido?"]["main"]
    outs[0].append({"node": MODE_NODE, "type": "main", "index": 0})
    changed.add(a["name"])
    log.append("+ B3 admin: nodo que activa el modo admin en la sesión")
else:
    log.append("= B3 admin: nodo de modo admin ya existe")

code_replace(
    a, "Build Menú Ayuda",
    "`_Escribe el comando que necesites._`",
    "`_Escribe el comando que necesites. Escribe *salir* para volver al modo normal._`",
    "B3 admin: mencionar 'salir' en la ayuda",
)

# ───────────────────────────── CF-14E Outbound ─────────────────────────────
o = wf("[CF] 14E - WhatsApp Outbound Sender")
lg = node(o, "Supabase — Log outbound")
if lg["parameters"]["body"].startswith("=={{"):
    lg["parameters"]["body"] = lg["parameters"]["body"][1:]
    changed.add(o["name"])
    log.append("+ B2 outbound: body '=={{' → '={{'")
else:
    log.append("= B2 outbound ya aplicado")
if lg.get("onError") != "continueRegularOutput":
    lg["onError"] = "continueRegularOutput"   # un fallo al registrar no debe marcar error el envío
    changed.add(o["name"])

# ───────────────────────────── CF-01E Inbound ─────────────────────────────
e = wf("[CF] 01E - Evolution Inbound Entry")
code_replace(
    e, "Guard — Filtrar evento",
    "return [{\n  json: {\n    _is_valid: isValid,\n    _skip_reason: isCallEvent ? 'call_event' : (isGroup ? 'group_message' : null),\n    _raw_body: body\n  }\n}];",
    "// ── (B5) Freno anti-bucle ────────────────────────────────────────────\n"
    "// Silencia 10 min un chat si: más de 12 mensajes en 1 min, o el mismo texto (4+ letras) 3 veces en 2 min.\n"
    "// Ignora respuestas automáticas de otros negocios. Estado en memoria del workflow (static data).\n"
    "let loopReason = null;\n"
    "if (isValid) {\n"
    "  const store = $getWorkflowStaticData('global');\n"
    "  const now = Date.now();\n"
    "  store.rl = store.rl || {};\n"
    "  for (const k of Object.keys(store.rl)) {\n"
    "    if (now - (store.rl[k].last ?? 0) > 15 * 60 * 1000) delete store.rl[k];\n"
    "  }\n"
    "  const msg = data?.message ?? {};\n"
    "  const text = String(msg.conversation ?? msg.extendedTextMessage?.text ?? '').trim().toLowerCase().replace(/\\s+/g, ' ').slice(0, 200);\n"
    "  const key = `${body?.instance ?? ''}|${remoteJid}`;\n"
    "  const st = store.rl[key] ?? { ts: [], texts: [], mutedUntil: 0 };\n"
    "  st.ts = st.ts.filter(t => now - t < 60 * 1000);\n"
    "  st.ts.push(now);\n"
    "  st.texts = st.texts.filter(x => now - x.t < 2 * 60 * 1000);\n"
    "  if (text.length >= 4) st.texts.push({ t: now, v: text });\n"
    "  const sameText = text.length >= 4 ? st.texts.filter(x => x.v === text).length : 0;\n"
    "  if (st.ts.length > 12 || sameText >= 3) st.mutedUntil = now + 10 * 60 * 1000;\n"
    "  st.last = now;\n"
    "  store.rl[key] = st;\n"
    "  const autoReply = /(respuesta autom[aá]tica|mensaje autom[aá]tico|auto-?reply|este es un mensaje autom)/i.test(text);\n"
    "  if (st.mutedUntil > now) loopReason = 'loop_guard_muted';\n"
    "  else if (autoReply) loopReason = 'auto_reply';\n"
    "}\n\n"
    "return [{\n  json: {\n    _is_valid: isValid && !loopReason,\n"
    "    _skip_reason: loopReason ?? (isCallEvent ? 'call_event' : (isGroup ? 'group_message' : null)),\n    _raw_body: body\n  }\n}];",
    "B5 inbound: freno anti-bucle",
)

# ───────────────────────────── CF-05 Session Guard ─────────────────────────────
s = wf("[CF] 05 - Session Expiration Guard")
rs = node(s, "Supabase — Reset sesión")
if "\n" in rs["parameters"]["url"]:
    rs["parameters"]["url"] = rs["parameters"]["url"].replace("\n", "")
    changed.add(s["name"])
    log.append("+ CF-05: URL sin salto de línea")
code_replace(
    s, "Supabase — Reset sesión",
    "active_service_id: null, pending_slot_start: null",
    "active_service_id: null, active_patient_id: null, active_provider_id: null, pending_slot_start: null",
    "B7 reset: limpiar también paciente y médico",
    key="body",
)
code_replace(
    s, "Recover + Reset Envelope",
    "return [{ json: {\n  ...envelope,",
    "// (B7) Si el mensaje trae texto (no solo un número de una lista vieja), se procesa en lugar de perderse.\n"
    "const inText = String(envelope.message?.text ?? '').trim();\n"
    "const processNow = inText.length > 0 && !/^\\d+$/.test(inText);\n"
    "if (processNow) {\n"
    "  return [{ json: {\n"
    "    ...envelope,\n"
    "    session: { ...envelope.session, current_step: 'idle', is_expired: true, active_service_id: null,\n"
    "      active_patient_id: null, active_provider_id: null, pending_slot_start: null, pending_slot_end: null, pending_context: {} },\n"
    "    patient: { ...(envelope.patient ?? {}), active_patient_id: null },\n"
    "    _after_reset: 'router',\n"
    "  }}];\n"
    "}\n"
    "return [{ json: {\n  _after_reset: 'notify',\n  ...envelope,",
    "B7 guard: decidir si procesar el mensaje tras expirar",
)
IF_B7 = "¿Procesar mensaje tras expirar?"
if not has_node(s, IF_B7):
    rec = node(s, "Recover + Reset Envelope")
    s["nodes"].append(if_node(IF_B7, "={{ $json._after_reset === 'router' }}",
                              [rec["position"][0] + 220, rec["position"][1]], "cf05-after-reset"))
    link(s, "Recover + Reset Envelope", [[IF_B7]])
    link(s, IF_B7, [["→ CF-06 Router"], ["→ CF-14 Notificar expiración"]])
    changed.add(s["name"])
    log.append("+ B7 guard: IF que manda al router o notifica")
else:
    log.append("= B7 guard: IF ya existe")

# ───────────────────────────── salida ─────────────────────────────
for name in sorted(changed):
    w = wfs[name]
    with open(os.path.join(DST, f"{w['id']}.json"), "w", encoding="utf-8") as f:
        json.dump(w, f, ensure_ascii=False, indent=2)
print("\n".join(log))
print(f"\nworkflows modificados: {len(changed)}")
for name in sorted(changed):
    print("  -", name, wfs[name]["id"])
