"""Quita secretos de workflows exportados de n8n antes de subirlos a git.

Uso: python sanitize_workflows.py <carpeta_origen> <carpeta_destino> <archivo .env>

Reemplaza:
  - Cualquier valor del .env (de 12+ caracteres) por {{REDACTED:NOMBRE_VARIABLE}}
  - Patrones conocidos: sb_secret_, sb_publishable_, gsk_, cal_live_/cal_test_, JWT (eyJ...), tokens de Meta (EAA...)
Sale con código 1 si después de limpiar todavía encuentra algo sospechoso.
"""
import json, os, re, sys

src, dst, env_path = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(dst, exist_ok=True)

secrets = {}
for line in open(env_path, encoding="utf-8"):
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, v = line.split("=", 1)
    k, v = k.strip(), v.strip().strip('"').strip("'")
    # Correos y dominios no son secretos (y así el resultado es igual en el servidor y en local)
    if re.fullmatch(r"[^@\s]+@[^@\s]+\.[a-z]{2,}", v) or k.endswith("_DOMAIN"):
        continue
    if len(v) >= 12 and not v.startswith(("http://", "https://", "America/")):
        secrets[v] = k

PATTERNS = [
    (re.compile(r"sb_secret_[A-Za-z0-9_-]{10,}"), "SUPABASE_SECRET_KEY"),
    (re.compile(r"sb_publishable_[A-Za-z0-9_-]{10,}"), "SUPABASE_PUBLISHABLE_KEY"),
    (re.compile(r"gsk_[A-Za-z0-9]{20,}"), "GROQ_API_KEY"),
    (re.compile(r"cal_(live|test)_[A-Za-z0-9]{16,}"), "CALCOM_API_KEY"),
    (re.compile(r"eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}"), "JWT"),
    (re.compile(r"EAA[A-Za-z0-9]{30,}"), "META_ACCESS_TOKEN"),
    (re.compile(r"postgres(?:ql)?://[^:\s\"']+:[^@\s\"']+@"), "DB_URL_WITH_PASSWORD"),
    # Teléfonos de México (52 + 10 dígitos, con o sin el 1 de celular) en comentarios o ejemplos
    (re.compile(r"(?<![0-9])521?[0-9]{10}(?![0-9])"), "PHONE"),
]

total = 0
for name in sorted(os.listdir(src)):
    if not name.endswith(".json"):
        continue
    text = open(os.path.join(src, name), encoding="utf-8").read()
    for value, var in sorted(secrets.items(), key=lambda kv: -len(kv[0])):
        if value in text:
            total += text.count(value)
            text = text.replace(value, "{{REDACTED:%s}}" % var)
    for rx, label in PATTERNS:
        text, n = rx.subn("{{REDACTED:%s}}" % label, text)
        total += n
    w = json.loads(text)  # asegura que sigue siendo JSON válido
    # Las ejecuciones de prueba fijadas (pinData) pueden traer datos de pacientes
    w.pop("pinData", None)
    safe = re.sub(r"[^\w.-]+", "_", w.get("name", name)).strip("_")
    with open(os.path.join(dst, f"{safe}__{w.get('id', '')}.json"), "w", encoding="utf-8") as f:
        json.dump(w, f, ensure_ascii=False, indent=2)
        f.write("\n")

# Verificación final
leaks = []
for name in os.listdir(dst):
    t = open(os.path.join(dst, name), encoding="utf-8").read()
    if any(v in t for v in secrets) or any(rx.search(t) for rx, _ in PATTERNS):
        leaks.append(name)
print(f"workflows: {len([n for n in os.listdir(dst) if n.endswith('.json')])}  secretos reemplazados: {total}")
if leaks:
    print("POSIBLE FUGA en:", leaks)
    sys.exit(1)
print("verificación: sin secretos detectados")
