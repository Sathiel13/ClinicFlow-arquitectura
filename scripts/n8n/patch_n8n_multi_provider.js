const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve('backups/n8n-workflows-20260809-005030');
const outDir = path.resolve('workflows/multi-provider-20260810');
fs.mkdirSync(outDir, { recursive: true });

for (const file of fs.readdirSync(sourceDir).filter((f) => f.endsWith('.json'))) {
  fs.copyFileSync(path.join(sourceDir, file), path.join(outDir, file));
}

function load(file) {
  return JSON.parse(fs.readFileSync(path.join(outDir, file), 'utf8'));
}

function save(file, data) {
  fs.writeFileSync(path.join(outDir, file), JSON.stringify(data, null, 2) + '\n');
}

function nodeByName(workflow, name) {
  const node = workflow.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Node not found: ${workflow.name} / ${name}`);
  return node;
}

function extract(fn) {
  const m = fn.toString().match(/\/\*([\s\S]*)\*\//);
  if (!m) throw new Error('Unable to extract code block');
  let code = m[1].trim();
  if (code.startsWith('`')) code = code.slice(1).trim();
  code = code.replace(/`;\s*$/, '').trim();
  if (code.endsWith('`')) code = code.slice(0, -1).trim();
  return code;
}

const catalogCode = extract(function(){/*const envelope = $('Execute Workflow Trigger').first().json;
const rawItems = $input.all().map(i => i.json);
const session  = envelope.session ?? {};
const patient  = envelope.patient ?? {};
const pending  = session.pending_context ?? {};

const normalizeText = (value) =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');

const toNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const providerFromRow = (row) => {
  const provider = row.providers ?? row.provider ?? {};
  return {
    provider_service_id: row.id ?? null,
    provider_id: row.provider_id ?? provider.id ?? null,
    provider_name: provider.name ?? row.provider_name ?? '',
    provider_specialty: provider.specialty ?? row.provider_specialty ?? null,
    calcom_event_type_id: row.calcom_event_type_id ?? null,
    duration_minutes: row.duration_minutes ?? null,
    price: row.price ?? null,
    is_active: row.is_active ?? true,
    sort_order: row.sort_order ?? 100,
  };
};

const services = rawItems
  .map(item => {
    const s = item.service ?? item;
    const providerRows = Array.isArray(s.provider_services) ? s.provider_services : [];
    const providers = providerRows
      .map(providerFromRow)
      .filter(p => p.provider_id && p.provider_name && p.is_active !== false)
      .sort((a, b) => (a.sort_order - b.sort_order) || String(a.provider_name).localeCompare(String(b.provider_name), 'es'));

    return {
      id:               s.id               ?? null,
      name:             s.name             ?? '',
      description:      s.description      ?? '',
      price:            s.price            ?? s.price_mxn ?? null,
      duration_minutes: s.duration_minutes ?? s.duration  ?? 30,
      is_active:        s.is_active        ?? true,
      category:         s.category         ?? 'General',
      providers,
    };
  })
  .filter(s => s.id && s.name && s.is_active !== false);

const interactiveId    = envelope.message?.interactive?.id ?? null;
const messageText      = String(envelope.message?.text ?? '').trim();
const normalizedText   = normalizeText(messageText);
const currentStep      = session.current_step ?? 'idle';
const currentMessageId = envelope.message?.message_id ?? null;
const activePatientId  =
  session.active_patient_id ||
  patient.active_patient_id ||
  null;

const inputConsumed = envelope._input_consumed === true;
const sameCatalogPromptMessage =
  !!currentMessageId &&
  !!pending.catalog_prompt_message_id &&
  pending.catalog_prompt_message_id === currentMessageId;

const canUseCurrentInputForSelection =
  !inputConsumed &&
  !sameCatalogPromptMessage &&
  (
    currentStep === 'select_service' ||
    ['text_booking', 'text_catalog'].includes(envelope._catalog_origin)
  );

const canUseCurrentInputForProvider =
  !inputConsumed &&
  currentStep === 'select_provider';

let selectedService = null;
let selectedProvider = null;

const servicesList = [...services].sort((a, b) => {
  const catCmp = String(a.category).localeCompare(String(b.category), 'es');
  if (catCmp !== 0) return catCmp;
  return String(a.name).localeCompare(String(b.name), 'es');
});

const clearCatalogPromptPending = () => {
  const next = { ...(session.pending_context ?? {}) };
  delete next.catalog_prompt_message_id;
  delete next.catalog_prompted_at;
  delete next.catalog_origin;
  delete next.provider_options;
  delete next.provider_prompted_at;
  return next;
};

const providerPatch = (service, provider, basePending = clearCatalogPromptPending()) => {
  const effectiveDuration = provider?.duration_minutes ?? service.duration_minutes;
  const effectivePrice = provider?.price ?? service.price;
  return {
    pending_context: {
      ...basePending,
      active_provider_id: provider?.provider_id ?? null,
      provider_id: provider?.provider_id ?? null,
      provider_name: provider?.provider_name ?? null,
      provider_specialty: provider?.provider_specialty ?? null,
      provider_service_id: provider?.provider_service_id ?? null,
      calcom_event_type_id: provider?.calcom_event_type_id ?? null,
      service_name: service.name,
      service_duration: effectiveDuration,
      service_price: effectivePrice,
    },
    active_provider_id: provider?.provider_id ?? null,
    provider_name: provider?.provider_name ?? null,
    provider_specialty: provider?.provider_specialty ?? null,
    provider_service_id: provider?.provider_service_id ?? null,
    calcom_event_type_id: provider?.calcom_event_type_id ?? null,
    service_duration: effectiveDuration,
    service_price: effectivePrice,
  };
};

const buildAdvance = (service, provider) => {
  const patch = providerPatch(service, provider);
  const price = patch.service_price
    ? `$${parseFloat(patch.service_price).toLocaleString('es-MX')} MXN`
    : 'Consultar precio';
  const nextStep   = 'select_patient';
  const advanceTo  = 'patient_manager';
  const providerLine = patch.provider_name ? `\n👨‍⚕️ ${patch.provider_name}` : '';

  return [{
    json: {
      ...envelope,
      _needs_nlp: false,
      session: {
        ...session,
        current_step: nextStep,
        active_service_id: service.id,
        active_provider_id: patch.active_provider_id,
        active_patient_id: null,
        pending_context: patch.pending_context,
      },
      patient: {
        ...patient,
        active_patient_id: null,
      },
      _session_update: {
        current_step: nextStep,
        active_service_id: service.id,
        active_provider_id: patch.active_provider_id,
        active_patient_id: null,
        pending_context: patch.pending_context,
      },
      _selected_service: service,
      _selected_provider: provider,
      _advance_to: advanceTo,
      _pm_force_list: true,
      _catalog_selection_consumed: true,
      _outbound: undefined
    }
  }];
};

const synonymHints = {
  neumologia: ['neumologo', 'pulmon', 'pulmones', 'respirar', 'respiracion', 'tos', 'asma', 'bronquitis', 'flemas', 'espirometria'],
  cardiologia: ['cardiologo', 'corazon', 'pecho', 'presion', 'ecocardiograma', 'eco', 'palpitaciones'],
  pediatria: ['pediatra', 'nino', 'nina', 'bebe', 'infante', 'control pediatrico'],
  traumatologia: ['traumatologo', 'hueso', 'huesos', 'fractura', 'golpe', 'dolor rodilla', 'dolor espalda', 'lesion'],
  'medicina general': ['medico general', 'general', 'revision', 'seguimiento', 'consulta general', 'malestar'],
  'consulta inicial': ['primera vez', 'valoracion', 'valoracion inicial', 'primera consulta', 'consulta inicial'],
};

const scoreByTokens = (haystack, needle, weight) => {
  if (!haystack || !needle) return 0;
  let score = 0;
  if (haystack === needle) score += weight * 5;
  if (haystack.includes(needle) || needle.includes(haystack)) score += weight * 3;
  for (const token of needle.split(' ').filter(t => t.length >= 4)) {
    if (haystack.includes(token)) score += weight;
  }
  return score;
};

const scoreServiceMatch = (svc, text) => {
  const serviceName = normalizeText(svc.name);
  const category = normalizeText(svc.category);
  const description = normalizeText(svc.description);
  const providerText = (svc.providers ?? [])
    .map(p => `${p.provider_name ?? ''} ${p.provider_specialty ?? ''}`)
    .map(normalizeText)
    .join(' ');

  let score = 0;
  score += scoreByTokens(serviceName, text, 12);
  score += scoreByTokens(category, text, 8);
  score += scoreByTokens(description, text, 4);
  score += scoreByTokens(providerText, text, 6);

  for (const [topic, words] of Object.entries(synonymHints)) {
    const topicHit = text.includes(topic) || words.some(w => text.includes(normalizeText(w)));
    if (!topicHit) continue;
    if (serviceName.includes(topic) || category.includes(topic) || providerText.includes(topic)) score += 28;
    if (words.some(w => serviceName.includes(normalizeText(w)) || description.includes(normalizeText(w)))) score += 12;
  }

  if (/consulta|cita|agendar|servicio|doctor|dr|medico|especialista/.test(text)) {
    score += 2;
  }

  return score;
};

const resolveServiceByContext = (text) => {
  const ranked = servicesList
    .map((service, index) => ({ service, index, score: scoreServiceMatch(service, text) }))
    .filter(r => r.score > 0)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));

  if (ranked.length === 0) return null;
  const [best, second] = ranked;
  const asksSpecificProcedure = /(seguimiento|control|espirometria|ecocardiograma|eco|estudio|procedimiento)/.test(text);
  if (!asksSpecificProcedure) {
    const preferredGeneralConsult = ranked.find(r => {
      const name = normalizeText(r.service.name);
      return r.score >= 24 &&
        name.includes('consulta') &&
        !/(seguimiento|control|espirometria|ecocardiograma|eco|procedimiento|estudio)/.test(name);
    });
    if (preferredGeneralConsult) return preferredGeneralConsult.service;
  }

  if (best.score >= 24 && (!second || best.score - second.score >= 8)) return best.service;

  const closeMatches = ranked.filter(r => best.score - r.score <= 7);
  const preferredConsult = closeMatches.find(r => {
    const name = normalizeText(r.service.name);
    return name.includes('consulta') &&
      !/(seguimiento|control|espirometria|ecocardiograma|eco|procedimiento|estudio)/.test(name);
  });
  if (preferredConsult && best.score >= 24) return preferredConsult.service;

  return null;
};

// 1) Selección de médico para un servicio ya elegido
if (canUseCurrentInputForProvider) {
  const providerOptions = Array.isArray(pending.provider_options) ? pending.provider_options : [];
  const serviceId = session.active_service_id ?? pending.active_service_id ?? null;
  selectedService = services.find(s => s.id === serviceId) ?? null;
  const choice = toNumber(normalizedText);

  if (choice && choice >= 1 && choice <= providerOptions.length) {
    selectedProvider = providerOptions[choice - 1];
  }

  if (!selectedProvider && normalizedText) {
    const exact = providerOptions.filter(p => normalizeText(p.provider_name) === normalizedText);
    if (exact.length >= 1) selectedProvider = exact[0];
  }

  if (!selectedProvider && normalizedText) {
    const partial = providerOptions.filter(p => normalizeText(p.provider_name).includes(normalizedText));
    if (partial.length === 1) selectedProvider = partial[0];
  }

  if (selectedService && selectedProvider) {
    return buildAdvance(selectedService, selectedProvider);
  }

  const lines = providerOptions.map((p, i) => {
    const spec = p.provider_specialty ? ` — ${p.provider_specialty}` : '';
    return `*${i + 1}.* ${p.provider_name}${spec}`;
  }).join('\n');

  return [{
    json: {
      ...envelope,
      _needs_nlp: false,
      session: { ...session, current_step: 'select_provider' },
      _session_update: {
        current_step: 'select_provider',
        active_service_id: serviceId,
        active_provider_id: null,
        active_patient_id: activePatientId,
        pending_context: pending,
      },
      _advance_to: 'outbound',
      _outbound: {
        type: 'text',
        body: `No pude identificar al médico. Elige una opción:\n\n${lines}\n\n_Responde con el número o nombre del médico._`
      }
    }
  }];
}

// 2) Selección por botón explícita
if (interactiveId?.startsWith('CF:SERV:') && interactiveId !== 'CF:SERV:list') {
  const sid = interactiveId.replace('CF:SERV:', '').trim();
  selectedService = services.find(s => String(s.id) === sid) ?? null;
}

// 3) Selección por número o texto exacto/parcial
if (!selectedService && normalizedText && canUseCurrentInputForSelection) {
  const choice = toNumber(normalizedText);

  if (choice && choice >= 1 && choice <= servicesList.length) {
    selectedService = servicesList[choice - 1];
  }

  if (!selectedService) {
    const exactMatches = servicesList.filter(s => normalizeText(s.name) === normalizedText);
    if (exactMatches.length >= 1) selectedService = exactMatches[0];
  }

  if (!selectedService) {
    const partialMatches = servicesList.filter(s => normalizeText(s.name).includes(normalizedText));
    if (partialMatches.length === 1) selectedService = partialMatches[0];
  }

  if (!selectedService) {
    selectedService = resolveServiceByContext(normalizedText);
  }
}

// 4) Sin servicios
if (servicesList.length === 0) {
  return [{
    json: {
      ...envelope,
      _needs_nlp: false,
      _advance_to: 'outbound',
      _outbound: {
        type: 'text',
        body: 'No hay servicios disponibles en este momento. Contáctanos directamente para más información.'
      }
    }
  }];
}

// 5) Servicio seleccionado por método determinístico
if (selectedService) {
  const providers = selectedService.providers ?? [];

  if (providers.length === 1) {
    return buildAdvance(selectedService, providers[0]);
  }

  if (providers.length > 1) {
    const nextPending = {
      ...clearCatalogPromptPending(),
      active_service_id: selectedService.id,
      service_name: selectedService.name,
      provider_options: providers,
      provider_prompted_at: new Date().toISOString(),
    };
    const lines = providers.map((p, i) => {
      const spec = p.provider_specialty ? ` — ${p.provider_specialty}` : '';
      return `*${i + 1}.* ${p.provider_name}${spec}`;
    }).join('\n');

    return [{
      json: {
        ...envelope,
        _needs_nlp: false,
        session: {
          ...session,
          current_step: 'select_provider',
          active_service_id: selectedService.id,
          active_provider_id: null,
          active_patient_id: activePatientId,
          pending_context: nextPending,
        },
        _session_update: {
          current_step: 'select_provider',
          active_service_id: selectedService.id,
          active_provider_id: null,
          active_patient_id: activePatientId,
          pending_context: nextPending,
        },
        _selected_service: selectedService,
        _advance_to: 'outbound',
        _outbound: {
          type: 'text',
          body: `Elige con qué médico quieres agendar *${selectedService.name}*:\n\n${lines}\n\n_Responde con el número o nombre del médico._`
        }
      }
    }];
  }

  // Compatibilidad con tenants antiguos sin providers configurados.
  return buildAdvance(selectedService, null);
}

// 6) Texto libre no matched → intentar NLP
if (normalizedText && canUseCurrentInputForSelection) {
  return [{
    json: {
      ...envelope,
      _needs_nlp: true,
      _nlp_services: servicesList,
      session: {
        ...session,
        current_step: 'select_service',
      },
      _session_update: {
        current_step: 'select_service',
        active_provider_id: null,
        pending_context: {
          ...(session.pending_context ?? {}),
        }
      },
      _advance_to: 'outbound',
    }
  }];
}

// 7) Mostrar catálogo agrupado por categoría
const byCategory = {};
for (const svc of servicesList) {
  const cat = svc.category ?? 'General';
  if (!byCategory[cat]) byCategory[cat] = [];
  byCategory[cat].push(svc);
}

let index = 1;
const lines = [];

for (const [cat, items] of Object.entries(byCategory)) {
  lines.push(`\n*${cat}*`);
  for (const svc of items) {
    const primaryProvider = (svc.providers ?? [])[0] ?? null;
    const priceValue = primaryProvider?.price ?? svc.price;
    const durationValue = primaryProvider?.duration_minutes ?? svc.duration_minutes;
    const precio = priceValue > 0
      ? `$${parseFloat(priceValue).toLocaleString('es-MX')}`
      : 'Precio con revisión previa';
    const mins = durationValue;
    const dur = mins >= 60
      ? `${Math.floor(mins/60)}h${mins%60 > 0 ? (mins%60)+'min' : ''}`
      : `${mins} min`;
    const providerHint = svc.providers?.length === 1
      ? ` · ${svc.providers[0].provider_name}`
      : (svc.providers?.length > 1 ? ` · ${svc.providers.length} médicos` : '');
    lines.push(`*${index}.* ${svc.name} — ${precio} · ${dur}${providerHint}`);
    index++;
  }
}

const catalogText = lines.join('\n').trimStart();

const nextPending = {
  ...(session.pending_context ?? {}),
  catalog_prompt_message_id: currentMessageId,
  catalog_prompted_at: new Date().toISOString(),
  catalog_origin: envelope._catalog_origin ?? null,
};

return [{
  json: {
    ...envelope,
    _needs_nlp: false,
    session: {
      ...session,
      current_step: 'select_service',
      pending_context: nextPending,
    },
    _session_update: {
      current_step: 'select_service',
      active_provider_id: null,
      pending_context: nextPending,
    },
    _advance_to: 'outbound',
    _outbound: {
      type: 'text',
      body: `Selecciona el servicio que necesitas:\n${catalogText}\n\n_Responde con el número o nombre de la opción que deseas._`
    }
  }
}];*/});

const catalogNlpCode = extract(function(){/*`// Parsear respuesta GROQ y resolver servicio o caer al error original
const envelope = $('Build GROQ Prompt — Servicio').first().json;
const groqResp = $input.first().json;
const services = envelope._nlp_services ?? [];
const session  = envelope.session ?? {};
const patient  = envelope.patient ?? {};

let serviceIndex = null;
let confidence   = 0;

try {
  const content = String(groqResp?.choices?.[0]?.message?.content ?? '');
  const cleaned = content.replace(/```json|```/g, '').trim();
  const parsed  = JSON.parse(cleaned);
  serviceIndex  = parsed?.service_index ?? null;
  confidence    = Number(parsed?.confidence ?? 0);
} catch (_) {}

const idx      = serviceIndex !== null ? Number(serviceIndex) - 1 : -1;
const resolved = (idx >= 0 && idx < services.length && confidence >= 0.50) ? services[idx] : null;

const formatCatalog = () => services
  .map((s, i) => {
    const p = (s.providers ?? [])[0] ?? null;
    const price = (p?.price ?? s.price) ? `$${parseFloat(p?.price ?? s.price).toLocaleString('es-MX')}` : 'Consultar';
    const dur = p?.duration_minutes ?? s.duration_minutes;
    const providerHint = s.providers?.length === 1 ? ` · ${s.providers[0].provider_name}` : '';
    return `*${i + 1}.* ${s.name} — ${price} · ${dur} min${providerHint}`;
  })
  .join('\n');

if (!resolved) {
  return [{
    json: {
      ...envelope,
      _needs_nlp: false,
      _nlp_services: undefined,
      _groq_messages: undefined,
      session:         { ...session, current_step: 'select_service' },
      _session_update: { current_step: 'select_service', active_provider_id: null },
      _advance_to: 'outbound',
      _outbound: {
        type: 'text',
        body: `No pude identificar el servicio. Aquí están las opciones:\n\n${formatCatalog()}\n\n_Responde con el número o el nombre del servicio._`
      }
    }
  }];
}

const providers = resolved.providers ?? [];
const activePatientId = session.active_patient_id || patient.active_patient_id || null;

if (providers.length > 1) {
  const nextPending = {
    ...(session.pending_context ?? {}),
    active_service_id: resolved.id,
    service_name: resolved.name,
    provider_options: providers,
    provider_prompted_at: new Date().toISOString(),
  };
  const lines = providers.map((p, i) => {
    const spec = p.provider_specialty ? ` — ${p.provider_specialty}` : '';
    return `*${i + 1}.* ${p.provider_name}${spec}`;
  }).join('\n');

  return [{
    json: {
      ...envelope,
      _needs_nlp: false,
      _nlp_services: undefined,
      _groq_messages: undefined,
      session: {
        ...session,
        current_step: 'select_provider',
        active_service_id: resolved.id,
        active_provider_id: null,
        active_patient_id: activePatientId,
        pending_context: nextPending,
      },
      _session_update: {
        current_step: 'select_provider',
        active_service_id: resolved.id,
        active_provider_id: null,
        active_patient_id: activePatientId,
        pending_context: nextPending,
      },
      _selected_service: resolved,
      _advance_to: 'outbound',
      _outbound: {
        type: 'text',
        body: `Elige con qué médico quieres agendar *${resolved.name}*:\n\n${lines}\n\n_Responde con el número o nombre del médico._`
      }
    }
  }];
}

const provider = providers[0] ?? null;
const effectiveDuration = provider?.duration_minutes ?? resolved.duration_minutes;
const effectivePrice = provider?.price ?? resolved.price;
const price = effectivePrice
  ? `$${parseFloat(effectivePrice).toLocaleString('es-MX')} MXN`
  : 'Consultar precio';
const nextStep   = 'select_patient';
const advanceTo  = 'patient_manager';
const pendingContext = {
  ...(session.pending_context ?? {}),
  active_provider_id: provider?.provider_id ?? null,
  provider_id: provider?.provider_id ?? null,
  provider_name: provider?.provider_name ?? null,
  provider_specialty: provider?.provider_specialty ?? null,
  provider_service_id: provider?.provider_service_id ?? null,
  calcom_event_type_id: provider?.calcom_event_type_id ?? null,
  service_name: resolved.name,
  service_duration: effectiveDuration,
  service_price: effectivePrice,
};
const providerLine = provider?.provider_name ? `\n👨‍⚕️ ${provider.provider_name}` : '';

return [{
  json: {
    ...envelope,
    _needs_nlp: false,
    _nlp_services: undefined,
    _groq_messages: undefined,
    _nlp_matched_service: resolved.name,
    session: {
      ...session,
      current_step: nextStep,
      active_service_id: resolved.id,
      active_provider_id: provider?.provider_id ?? null,
      active_patient_id: null,
      pending_context: pendingContext,
    },
    patient: { ...patient, active_patient_id: null },
    _session_update: {
      current_step: nextStep,
      active_service_id: resolved.id,
      active_provider_id: provider?.provider_id ?? null,
      active_patient_id: null,
      pending_context: pendingContext,
    },
    _selected_service: resolved,
    _selected_provider: provider,
    _advance_to: advanceTo,
    _pm_force_list: true,
    _catalog_selection_consumed: true,
    _outbound: undefined
  }
}];`*/});

const catalogGroqPromptCode = extract(function(){/*`// Construir prompt amplio para que GROQ identifique intención, servicio y especialidad
const envelope  = $input.first().json;
const services  = envelope._nlp_services ?? [];
const text      = String(envelope.message?.text ?? '').trim();
const clinicName = envelope.tenant?.name ?? 'la clínica';
const session = envelope.session ?? {};
const pending = session.pending_context ?? {};

const serviceList = services.map((s, i) => {
  const providers = (s.providers ?? []).map(p => {
    const specialty = p.provider_specialty ? `, especialidad: ${p.provider_specialty}` : '';
    const price = p.price ? `, precio: $${parseFloat(p.price).toLocaleString('es-MX')}` : '';
    const duration = p.duration_minutes ? `, duración: ${p.duration_minutes} min` : '';
    return `${p.provider_name}${specialty}${price}${duration}`;
  }).join(' | ');
  const price = s.price ? `, precio base: $${parseFloat(s.price).toLocaleString('es-MX')}` : '';
  const desc  = s.description ? `, descripción: ${s.description}` : '';
  const category = s.category ? `, categoría: ${s.category}` : '';
  return `${i + 1}. Servicio: ${s.name}${category}${desc}${price}. Médicos: ${providers || 'sin médico específico'}`;
}).join('\n');

const context = {
  current_step: session.current_step ?? 'idle',
  previous_service: pending.service_name ?? null,
  previous_provider: pending.provider_name ?? null,
};

const system =
  `Eres el motor de interpretación de WhatsApp para ${clinicName}. ` +
  `Tu tarea es elegir el servicio más probable de una lista cerrada. ` +
  `El usuario puede escribir o mandar audio transcrito con saludos, relleno, faltas de ortografía, abreviaciones, especialidades, nombre del médico, síntomas generales o frases como "quiero saber servicios". ` +
  `Ignora saludos como hola/buenas tardes y céntrate en la intención clínica. ` +
  `Si el usuario solo pide ver servicios o precios sin elegir uno, responde service_index null con intent "show_catalog". ` +
  `Si menciona una especialidad o síntoma que corresponde claramente a un servicio, elige ese servicio. ` +
  `No inventes servicios fuera de la lista. Responde únicamente JSON válido, sin markdown ni explicación:\n` +
  `{"intent":"book_or_select|show_catalog|unknown","service_index":N,"confidence":0.0,"reason":"breve"}`;

const user =
  `Texto del usuario: "${text}"\n\n` +
  `Contexto actual: ${JSON.stringify(context)}\n\n` +
  `Lista cerrada de servicios:\n${serviceList}`;

return [{ json: { ...envelope, _groq_messages: [{ role: 'system', content: system }, { role: 'user', content: user }] } }];`*/});

const availabilityPrepareCode = extract(function(){/*`
const envelope     = $input.first().json;
const tz           = envelope.tenant?.timezone ?? 'America/Mexico_City';
const session      = envelope.session ?? {};
const pending      = session.pending_context ?? {};
const eventTypeId  =
  pending.calcom_event_type_id ??
  envelope._selected_provider?.calcom_event_type_id ??
  envelope.tenant?.settings?.calcom_event_type_id ??
  null;
const serviceId    = session.active_service_id ?? pending.active_service_id ?? null;
const providerId   = session.active_provider_id ?? pending.active_provider_id ?? pending.provider_id ?? null;
const patientId    = session.active_patient_id ?? envelope.patient?.active_patient_id ?? null;
const bookingUidToReschedule = pending.reschedule_uid ?? null;

let error = null;
if (!eventTypeId) error = 'missing_calcom_event_type_id';
else if (!serviceId) error = 'missing_service_id';
else if (!patientId) error = 'missing_patient_id';

const now   = new Date();
const start = now.toISOString();
const end   = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

const hasCachedSlots = !error &&
  Array.isArray(pending.available_slots) &&
  pending.available_slots.length > 0;
const tryNlpSlot = false;

return [{
  json: {
    ...envelope,
    _error: error,
    _calcom_event_type_id: eventTypeId,
    _service_id:  serviceId,
    _provider_id: providerId,
    _provider_name: pending.provider_name ?? null,
    _provider_specialty: pending.provider_specialty ?? null,
    _patient_id:  patientId,
    _slot_start:  start,
    _slot_end:    end,
    _timezone:    tz,
    _booking_uid_to_reschedule: bookingUidToReschedule,
    _has_cached_slots: hasCachedSlots,
    _try_nlp_slot:     tryNlpSlot
  }
}];`;
*/});

const availabilityEnrichCode = extract(function(){/*`
const envelope = $('Preparar ventana').item.json;
const calResp  = $input.first().json;
const pending  = envelope.session?.pending_context ?? {};

let patientName = null;
let serviceName = pending.service_name ?? null;
let serviceDesc = null;
let serviceDuration = pending.service_duration ?? null;
let providerName = pending.provider_name ?? envelope._provider_name ?? null;
let providerSpecialty = pending.provider_specialty ?? envelope._provider_specialty ?? null;

try {
  const rawPat = $('Supabase — GET Patient').first().json;
  const pat    = Array.isArray(rawPat) ? rawPat[0] : rawPat;
  patientName  = pat?.full_name ?? null;
} catch (_) {}

try {
  const rawSvc = $('Supabase — GET Service').first().json;
  const svc    = Array.isArray(rawSvc) ? rawSvc[0] : rawSvc;
  serviceName    = serviceName ?? svc?.name ?? null;
  serviceDesc    = svc?.description ?? null;
  serviceDuration= serviceDuration ?? svc?.duration_minutes ?? null;
} catch (_) {}

return [{
  json: {
    ...envelope,
    _calcom_response: calResp,
    _patient_name:    patientName,
    _service_name:    serviceName,
    _service_desc:    serviceDesc,
    _service_duration: serviceDuration,
    _provider_name: providerName,
    _provider_specialty: providerSpecialty,
  }
}];`;
*/});

const bookingValidateCode = extract(function(){/*`const envelope    = $input.first().json;
const session     = envelope.session ?? {};
const interactive = envelope.message?.interactive ?? {};
const pending     = session.pending_context ?? {};

let slotStart = null;
let slotEnd   = null;

if (envelope._selected_slot?.start) {
  slotStart = envelope._selected_slot.start;
  slotEnd   = envelope._selected_slot.end ?? null;
} else if (session.pending_slot_start) {
  slotStart = session.pending_slot_start;
  slotEnd   = session.pending_slot_end ?? null;
} else if (interactive.id?.startsWith('CF:SLOT:')) {
  slotStart = decodeURIComponent(interactive.id.replace('CF:SLOT:', ''));
}

const patientId   = session.active_patient_id || envelope.patient?.active_patient_id || null;
const serviceId   = session.active_service_id || pending.active_service_id || null;
const providerId  = session.active_provider_id || pending.active_provider_id || pending.provider_id || null;
const eventTypeId =
  pending.calcom_event_type_id ??
  envelope._selected_provider?.calcom_event_type_id ??
  envelope.tenant?.settings?.calcom_event_type_id ??
  null;

const rescheduleUid    = pending.reschedule_uid ?? null;
const rescheduleApptId = pending.reschedule_appt_id ?? null;
const isReschedule     = !!rescheduleUid && !!rescheduleApptId;

const patientName  = pending.patient_name ?? envelope._patient_name ?? null;
const serviceName  = pending.service_name ?? envelope._service_name ?? null;
const providerName = pending.provider_name ?? envelope._provider_name ?? null;
const patientEmail = pending.patient_email ?? null;

if (!slotStart)   return [{ json: { ...envelope, _booking_error: 'missing_slot' } }];
if (!patientId)   return [{ json: { ...envelope, _booking_error: 'missing_patient' } }];
if (!serviceId)   return [{ json: { ...envelope, _booking_error: 'missing_service' } }];
if (!eventTypeId) return [{ json: { ...envelope, _booking_error: 'missing_event_type' } }];

return [{
  json: {
    ...envelope,
    _slot_start:         slotStart,
    _slot_end:           slotEnd,
    _patient_id:         patientId,
    _service_id:         serviceId,
    _provider_id:        providerId,
    _provider_name:      providerName,
    _event_type_id:      eventTypeId,
    _is_reschedule:      isReschedule,
    _reschedule_uid:     rescheduleUid,
    _reschedule_appt_id: rescheduleApptId,
    _patient_name:       patientName,
    _service_name:       serviceName,
    _patient_email:      patientEmail,
    _booking_error:      null
  }
}];`;
*/});

const bookingConfirmCode = extract(function(){/*`const envelope = $('Recover booking data').first().json;
const raw      = $input.first().json;
const appt     = Array.isArray(raw) ? raw[0] : raw;

const tz  = envelope.tenant?.timezone ?? 'America/Mexico_City';
const dt  = new Date(envelope._booking_start);
const fmt = dt.toLocaleString('es-MX', {
  timeZone: tz,
  weekday: 'long',
  year: 'numeric',
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
});

const isReschedule   = envelope._is_reschedule === true;
const clinicName     = envelope.tenant?.name ?? 'la clínica';
const patientName    = envelope._patient_name ?? envelope.user?.wa_name ?? 'Paciente';
const serviceName    = envelope._service_name ?? 'tu servicio';
const providerName   = envelope._provider_name ?? null;
const providerLine   = providerName ? `\n👨‍⚕️ *${providerName}*` : '';
const cancelPolicy   = envelope.tenant?.settings?.cancellation_policy
  ?? 'Si necesitas mover tu cita, puedes escribir *cancelar* o *reagendar*.';

const deterministicBody = isReschedule
  ? `✅ *Tu cita fue reagendada con éxito*

📅 *${fmt}*${providerLine}

Hola, *${patientName}*. Tu cita para *${serviceName}* fue actualizada correctamente en *${clinicName}*.

${cancelPolicy}

Si necesitas algo más, con gusto te ayudamos.`
  : `✅ *Tu cita quedó confirmada con éxito*

📅 *${fmt}*${providerLine}

Hola, *${patientName}*. Tu cita para *${serviceName}* ha sido registrada correctamente en *${clinicName}*.

${cancelPolicy}

Recomendación general: si te es posible, llega unos minutos antes para atenderte con mayor comodidad.`;

return [{
  json: {
    ...envelope,
    patient: {
      ...(envelope.patient ?? {}),
      active_patient_id: null
    },
    session: {
      ...envelope.session,
      current_step: 'idle',
      active_service_id: null,
      active_provider_id: null,
      active_patient_id: null,
      pending_slot_start: null,
      pending_slot_end: null,
      pending_context: {}
    },
    _session_update: {
      current_step: 'idle',
      active_service_id: null,
      active_provider_id: null,
      active_patient_id: null,
      pending_slot_start: null,
      pending_slot_end: null,
      pending_context: {}
    },
    _appointment_id: appt?.id ?? envelope._reschedule_appt_id ?? null,
    _fallback_outbound: {
      type: 'text',
      body: deterministicBody
    },
    _outbound: {
      type: 'text',
      body: deterministicBody
    },
    _humanizer: {
      operation: isReschedule ? 'reschedule_confirmation' : 'booking_confirmation',
      clinic_name: clinicName,
      user_name: envelope.user?.wa_name ?? 'Paciente',
      patient_name: patientName,
      service_name: serviceName,
      provider_name: providerName,
      formatted_datetime: fmt,
      cancellation_policy: cancelPolicy,
      base_message: deterministicBody
    }
  }
}];`;
*/});

// Catalog workflow.
{
  const file = 'tv7WUNmbxaxGvWSN.json';
  const wf = load(file);
  const get = nodeByName(wf, 'Supabase — GET servicios activos');
  const select = get.parameters.queryParameters.parameters.find((p) => p.name === 'select');
  select.value = 'id,name,description,duration_minutes,price,category,provider_services(id,provider_id,calcom_event_type_id,duration_minutes,price,is_active,sort_order,providers(id,name,specialty,description,is_active,sort_order))';
  nodeByName(wf, 'Build Catálogo').parameters.jsCode = catalogCode;
  nodeByName(wf, 'Build GROQ Prompt — Servicio').parameters.jsCode = catalogGroqPromptCode;
  nodeByName(wf, 'Resolver NLP — Servicio').parameters.jsCode = catalogNlpCode;
  const update = nodeByName(wf, 'Supabase — UPDATE session');
  update.parameters.body = "={{ JSON.stringify({  current_step:      $json._session_update?.current_step ?? $json.session?.current_step ?? 'idle',  active_service_id: $json._session_update?.active_service_id ?? $json.session?.active_service_id ?? null,  active_provider_id:$json._session_update?.active_provider_id ?? $json.session?.active_provider_id ?? null,  active_patient_id: $json._session_update?.active_patient_id ?? $json.session?.active_patient_id ?? null,  pending_context:   $json._session_update?.pending_context ?? $json.session?.pending_context ?? {},  updated_at:        new Date().toISOString()}) }}";
  save(file, wf);
}

// Availability workflow.
{
  const file = 'FZhU5iobUVOHPOEG.json';
  const wf = load(file);
  nodeByName(wf, 'Preparar ventana').parameters.jsCode = availabilityPrepareCode;
  nodeByName(wf, 'Enrich Meta').parameters.jsCode = availabilityEnrichCode;
  const process = nodeByName(wf, 'Procesar slots');
  process.parameters.jsCode = process.parameters.jsCode
    .replace(/próximos 14 días/g, 'próximos 30 días')
    .replace(/proximos 14 dias/g, 'proximos 30 dias')
    .replace('⚠️ No pude identificar el horario que elegiste. Aquí están las opciones de nuevo:', '⚠️ No pude identificar el número de horario que elegiste. Aquí están las opciones de nuevo:')
    .replace('`\\n\\n_Responde con el número del horario que prefieras, o describe el que más te convenga (ej: "el lunes a las 10")._`;', '`\\n\\n_Responde solo con el número del horario que prefieras._`;')
    .replace(`// ── Tomar hasta 8 slots y agrupar por día ─────────────────────────────────
const topSlots = dedup.slice(0, 8);

const byDay = {};
for (const slot of topSlots) {
  const dayKey = slot.date || slot.start.slice(0, 10);
  if (!byDay[dayKey]) byDay[dayKey] = [];
  byDay[dayKey].push(slot);
}`, `// ── Tomar varios días disponibles, respetando lo que Cal.com devuelve ─────
const MAX_DAYS_TO_SHOW = 5;
const MAX_SLOTS_PER_DAY = 5;
const MAX_TOTAL_SLOTS = 25;

const byDayAll = {};
for (const slot of dedup) {
  const dayKey = slot.date || slot.start.slice(0, 10);
  if (!byDayAll[dayKey]) byDayAll[dayKey] = [];
  byDayAll[dayKey].push(slot);
}

const selectedDays = Object.keys(byDayAll)
  .sort()
  .slice(0, MAX_DAYS_TO_SHOW);

const topSlots = [];
const byDay = {};
for (const day of selectedDays) {
  const slotsForDay = byDayAll[day].slice(0, MAX_SLOTS_PER_DAY);
  byDay[day] = [];
  for (const slot of slotsForDay) {
    if (topSlots.length >= MAX_TOTAL_SLOTS) break;
    topSlots.push(slot);
    byDay[day].push(slot);
  }
}

for (const day of Object.keys(byDay)) {
  if (byDay[day].length === 0) delete byDay[day];
}`)
    .replace("const serviceDur  = raw._service_duration ?? null;", "const serviceDur  = raw._service_duration ?? null;\nconst providerName = raw._provider_name ?? envelope._provider_name ?? null;")
    .replace("para la cita de *${patientName}*:\\n\\n`;", "para la cita de *${patientName}*${providerName ? ` con *${providerName}*` : ''}:\\n\\n`;")
    .replace("service_name:    serviceName,", "service_name:    serviceName,\n  provider_id:     envelope._provider_id ?? pending.provider_id ?? null,\n  provider_name:   providerName,\n  calcom_event_type_id: envelope._calcom_event_type_id ?? pending.calcom_event_type_id ?? null,");
  const error = nodeByName(wf, 'Build Error — Sin config');
  error.parameters.jsCode = error.parameters.jsCode.replace('Esta clínica no tiene configurada su agenda todavía.', 'Esta clínica o médico no tiene configurada su agenda todavía.');
  save(file, wf);
}

// Booking workflow.
{
  const file = 'wCjeF0Xd7vUXZq7c.json';
  const wf = load(file);
  nodeByName(wf, 'Validar datos booking').parameters.jsCode = bookingValidateCode;
  const post = nodeByName(wf, 'Cal.com — POST booking');
  post.parameters.body = post.parameters.body
    .replace("service_name: $json._service_name ?? null,\n          wa_number: $json.user.wa_number", "service_name: $json._service_name ?? null,\n          provider_id: $json._provider_id ?? null,\n          provider_name: $json._provider_name ?? null,\n          wa_number: $json.user.wa_number");
  post.parameters.body = post.parameters.body
    .replace("($json.user.wa_number + '@whatsapp.clinicflow')", "'cristiansathiel@gmail.com'");
  const insert = nodeByName(wf, 'Supabase — INSERT appointment');
  insert.parameters.body = insert.parameters.body
    .replace("service_id: $json._service_id,\n  start_at:", "service_id: $json._service_id,\n  provider_id: $json._provider_id ?? null,\n  start_at:");
  nodeByName(wf, 'Build Confirmación').parameters.jsCode = bookingConfirmCode;
  const reset = nodeByName(wf, 'Supabase — Reset session');
  reset.parameters.body = "={{ JSON.stringify({   current_step:       'idle',   active_service_id:  null,   active_provider_id: null,   active_patient_id:  null,   pending_slot_start: null,   pending_slot_end:   null,   pending_context:    {},   is_expired:         false,   updated_at:         new Date().toISOString() }) }}";
  const humanizer = nodeByName(wf, 'Groq — Humanizar confirmación');
  humanizer.parameters.body = humanizer.parameters.body
    .replace('Eres un asistente de WhatsApp para una clínica dental.', 'Eres un asistente de WhatsApp para una clínica médica.')
    .replace('por ejemplo sobre puntualidad, llegar unos minutos antes o mantener una buena higiene dental.', 'por ejemplo sobre puntualidad o llegar unos minutos antes.')
    .replace("Servicio: ${$json._humanizer?.service_name ?? $json._service_name ?? 'Consulta'}", "Servicio: ${$json._humanizer?.service_name ?? $json._service_name ?? 'Consulta'}\\nMédico: ${$json._humanizer?.provider_name ?? $json._provider_name ?? ''}");
  save(file, wf);
}

// Router workflow.
{
  const file = '3LTDnXPdGt04TJSd.json';
  const wf = load(file);
  const router = nodeByName(wf, 'Determinar Ruta');
  router.parameters.jsCode = router.parameters.jsCode
    .replace('const activeServiceId = session.active_service_id || null;', 'const activeServiceId = session.active_service_id || null;\nconst activeProviderId = session.active_provider_id || pending.active_provider_id || pending.provider_id || null;')
    .replace("const menuWords    = ['hola', 'menu', 'menú', 'inicio', 'start', 'ayuda', 'help'];", "const menuWords    = ['hola', 'ola', 'buen dia', 'buenos dias', 'buenas tardes', 'buenas noches', 'menu', 'menú', 'inicio', 'start', 'ayuda', 'help'];")
    .replace("const bookWords    = ['agendar', 'reservar', 'quiero cita', 'necesito cita', 'nueva cita', 'book'];", "const bookWords    = ['agendar', 'reservar', 'quiero cita', 'necesito cita', 'nueva cita', 'consulta', 'consultar', 'doctor', 'doctora', 'medico', 'médico', 'especialista', 'neumologo', 'neumólogo', 'cardiologo', 'cardiólogo', 'pediatra', 'traumatologo', 'traumatólogo', 'book'];")
    .replace("const normalizedText  = normalize(messageText);", `const normalizedText  = normalize(messageText);
const normalizedWords = normalizedText.replace(/[^a-z0-9: ]+/g, ' ').replace(/\\s+/g, ' ').trim();

const getLocalParts = (iso, timeZone = 'America/Mexico_City') => {
  const d = new Date(iso);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(d).reduce((acc, p) => {
    if (p.type !== 'literal') acc[p.type] = Number(p.value);
    return acc;
  }, {});

  const weekdayLabel = normalize(new Intl.DateTimeFormat('es-MX', {
    timeZone,
    weekday: 'long',
  }).format(d));

  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    weekday: weekdayLabel,
  };
};

const addLocalDays = (date, days) => new Date(date.getTime() + days * 24 * 60 * 60 * 1000);

const parseSlotRequest = (text, slots, timeZone = 'America/Mexico_City') => {
  if (!text || !Array.isArray(slots) || slots.length === 0) return null;

  const months = {
    enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
    julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10,
    noviembre: 11, diciembre: 12,
  };
  const weekdays = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];
  const hasDateWord = /(hoy|manana|pasado manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre|\\d{1,2}[\\/-]\\d{1,2})/.test(text);

  let requestedDay = null;
  let requestedMonth = null;
  let requestedWeekday = weekdays.find((w) => text.includes(w)) ?? null;

  const longDate = text.match(/\\b(\\d{1,2})\\s*(?:de\\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre)\\b/);
  if (longDate) {
    requestedDay = Number(longDate[1]);
    requestedMonth = months[longDate[2]];
  }

  const slashDate = text.match(/\\b(\\d{1,2})[\\/-](\\d{1,2})(?:[\\/-](\\d{2,4}))?\\b/);
  if (!longDate && slashDate) {
    requestedDay = Number(slashDate[1]);
    requestedMonth = Number(slashDate[2]);
  }

  const nowParts = getLocalParts(new Date().toISOString(), timeZone);
  if (text.includes('pasado manana')) {
    const target = getLocalParts(addLocalDays(new Date(), 2).toISOString(), timeZone);
    requestedDay = target.day;
    requestedMonth = target.month;
  } else if (text.includes('manana')) {
    const target = getLocalParts(addLocalDays(new Date(), 1).toISOString(), timeZone);
    requestedDay = target.day;
    requestedMonth = target.month;
  } else if (text.includes('hoy')) {
    requestedDay = nowParts.day;
    requestedMonth = nowParts.month;
  }

  const timeCandidates = [];
  const pushTime = (hourRaw, minuteRaw, meridianRaw, dayPartRaw) => {
    let hour = Number(hourRaw);
    const minute = minuteRaw == null || minuteRaw === '' ? 0 : Number(minuteRaw);
    const meridian = normalize(meridianRaw ?? '');
    const dayPart = normalize(dayPartRaw ?? '');
    if (!Number.isFinite(hour) || hour < 0 || hour > 23 || !Number.isFinite(minute) || minute > 59) return;

    if (meridian === 'pm' && hour < 12) hour += 12;
    if (meridian === 'am' && hour === 12) hour = 0;
    if ((dayPart === 'tarde' || dayPart === 'noche') && hour < 12) hour += 12;
    if (dayPart === 'manana' && hour === 12) hour = 0;
    timeCandidates.push({ hour, minute });
  };

  let m;
  if ((m = text.match(/(?:a las|alas|de las|las)\\s+(\\d{1,2})(?::(\\d{2}))?\\s*(am|pm)?\\b/))) pushTime(m[1], m[2], m[3], null);
  if ((m = text.match(/\\b(\\d{1,2}):(\\d{2})\\s*(am|pm)?\\b/))) pushTime(m[1], m[2], m[3], null);
  if ((m = text.match(/\\b(\\d{1,2})\\s*(am|pm)\\b/))) pushTime(m[1], null, m[2], null);
  if ((m = text.match(/\\b(\\d{1,2})\\s+de la\\s+(manana|tarde|noche)\\b/))) pushTime(m[1], null, null, m[2]);

  if (timeCandidates.length === 0) return null;

  const ranked = slots
    .map((slot, index) => {
      const p = getLocalParts(slot.start, timeZone);
      let score = 0;
      const timeMatch = timeCandidates.some((t) => t.hour === p.hour && t.minute === p.minute);
      if (!timeMatch) return null;
      score += 20;
      if (requestedDay != null) score += p.day === requestedDay ? 12 : -100;
      if (requestedMonth != null) score += p.month === requestedMonth ? 12 : -100;
      if (requestedWeekday) score += p.weekday === requestedWeekday ? 6 : -20;
      if (!hasDateWord) score += Math.max(0, 5 - index);
      return { slot, index, score };
    })
    .filter(Boolean)
    .filter((r) => r.score >= 20)
    .sort((a, b) => (b.score - a.score) || (a.index - b.index));

  return ranked[0]?.slot ?? null;
};`)
    .replace("if (!slot && normalizedText && availableSlots.length > 0) {\n    slot = availableSlots.find((s) => {", "if (!slot && normalizedWords && availableSlots.length > 0) {\n    slot = parseSlotRequest(normalizedWords, availableSlots, tz);\n  }\n\n  if (!slot && normalizedText && availableSlots.length > 0) {\n    slot = availableSlots.find((s) => {")
    .replace(`  if (!slot && normalizedWords && availableSlots.length > 0) {
    slot = parseSlotRequest(normalizedWords, availableSlots, tz);
  }

  if (!slot && normalizedText && availableSlots.length > 0) {
    slot = availableSlots.find((s) => {
      const label = normalize(fmtFull(s.start, tz));
      return normalizedText === label || label.includes(normalizedText) || normalizedText.includes(label);
    }) ?? null;
  }
`, '')
    .replace("if (wantsMenu) {\n  return cleanToMenu();\n}", "if (wantsMenu && !wantsBooking && !wantsCatalog && !normalizedText.includes('cita')) {\n  return cleanToMenu();\n}")
    .replace("return routeToCatalog({\n        ...consumeCurrentInput(),\n        _catalog_origin: 'text_booking',\n      });", "return routeToCatalog({\n        _catalog_origin: 'text_booking',\n      });")
    .replace("return routeToCatalog({\n    ...consumeCurrentInput(),\n    _catalog_origin: 'text_catalog',\n  });", "return routeToCatalog({\n    _catalog_origin: 'text_catalog',\n  });")
    .replace('active_patient_id: null,\n    },\n    _session_update:', 'active_patient_id: null,\n      active_provider_id: null,\n    },\n    _session_update:')
    .replace('active_patient_id: null,\n    },\n    _route:', 'active_patient_id: null,\n      active_provider_id: null,\n    },\n    _route:')
    .replace("pending_slot_end: slot?.end ?? null,\n    },\n    _route: 'booking',", "pending_slot_end: slot?.end ?? null,\n      active_provider_id: activeProviderId,\n    },\n    _route: 'booking',")
    .replace("pending_slot_end: slot?.end ?? null,\n    },\n    _route: 'booking',", "pending_slot_end: slot?.end ?? null,\n      active_provider_id: activeProviderId,\n    },\n    _route: 'booking',")
    .replace("if (step === 'select_slot') {", "if (step === 'select_provider') {\n  return routeToCatalog();\n}\n\nif (step === 'select_slot') {")
    .replace("active_patient_id: null, pending_slot_start: null", "active_patient_id: null, active_provider_id: null, pending_slot_start: null");
  const reset = nodeByName(wf, 'Supabase — Reset session (menú)');
  reset.parameters.body = "={{ JSON.stringify({ current_step: 'idle', active_service_id: null, active_provider_id: null, active_patient_id: null, pending_slot_start: null, pending_slot_end: null, pending_context: {}, is_expired: false, updated_at: new Date().toISOString() }) }}";
  save(file, wf);
}

// Session bootstrap workflow.
{
  const file = 'I8dHR1hMvYYyrLgu.json';
  const wf = load(file);
  const recover = nodeByName(wf, 'Recover session + Enrich Envelope');
  recover.parameters.jsCode = recover.parameters.jsCode
    .replace('active_service_id:  existingSession.active_service_id  ?? null,', 'active_service_id:  existingSession.active_service_id  ?? null,\n    active_provider_id: existingSession.active_provider_id ?? null,')
    .replace('active_service_id:  null,\n    active_patient_id:', 'active_service_id:  null,\n    active_provider_id: null,\n    active_patient_id:');
  const insert = nodeByName(wf, 'Supabase — INSERT session_state');
  insert.parameters.body = "={{ JSON.stringify({ tenant_id: $json.tenant.tenant_id, user_id: $json.user.user_id, current_step: 'idle', is_expired: false, active_service_id: null, active_provider_id: null, active_patient_id: null, pending_slot_start: null, pending_slot_end: null, pending_context: {}, last_interaction_at: new Date().toISOString() }) }}";
  const inserted = nodeByName(wf, 'Envelope — Inserted session ready');
  inserted.parameters.jsCode = inserted.parameters.jsCode
    .replace('active_service_id:  row?.active_service_id  ?? null,', 'active_service_id:  row?.active_service_id  ?? null,\n      active_provider_id: row?.active_provider_id ?? null,');
  save(file, wf);
}

// Patient manager workflow.
{
  const file = '46pxTzNfW2DAMFJT.json';
  const wf = load(file);
  const evalNode = nodeByName(wf, 'Evaluar pacientes');
  evalNode.parameters.jsCode = evalNode.parameters.jsCode.replace(
`if (forceList) {
  if (patients.length > 1) {
    return [build({ _pm_action: 'show_list' })];
  }

  if (patients.length === 1) {
    return [build({ _pm_action: 'select_existing', _patient: patients[0] })];
  }

  return [build({ _pm_action: 'ask_name' })];
}`,
`if (forceList) {
  if (patients.length >= 1) {
    return [build({ _pm_action: 'show_list' })];
  }

  return [build({ _pm_action: 'ask_name' })];
}`
  );
  const responseNode = nodeByName(wf, 'Build Respuesta PM');
  responseNode.parameters.jsCode = responseNode.parameters.jsCode.replace(
`'👤 Encontré varios pacientes registrados con este número:\\n\\n' +
        list +
        extraHint`,
`'👤 ¿Para quién agendamos la cita?\\n\\n' +
        list +
        extraHint`
  );
  save(file, wf);
}

// FAQ helper workflow.
{
  const file = 'M5CToAdeEBxfYnvz.json';
  const wf = load(file);
  nodeByName(wf, 'Build FAQ Context').parameters.jsCode = `// CF-10 - Build FAQ Context with engagement fallback
const envelope   = $input.first().json;
const settings   = envelope.tenant?.settings ?? {};
const clinicName = envelope.tenant?.name ?? 'la clinica';
const rawText    = String(envelope.message?.text ?? '').trim();

const menuAliases = {
  '1': 'Quiero agendar una cita',
  '2': 'Quiero ver los servicios disponibles',
  '3': 'Dame informacion de la clinica, horarios, ubicacion, servicios y como agendar.',
};
const isMenuNumber = /^\\d+$/.test(rawText) && rawText.length <= 2;
const msgText = isMenuNumber
  ? (menuAliases[rawText] ?? 'Dame informacion de la clinica.')
  : (rawText || 'Dame informacion de la clinica.');

const normalizeList = (value) => Array.isArray(value) ? value : [];

let faqBlock = '';
const faqItems = normalizeList(settings.faq_json);
if (faqItems.length > 0) {
  const lines = faqItems.map(item => {
    const q = item.q ?? item.question ?? '';
    const a = item.a ?? item.answer ?? '';
    return q && a ? \`P: \${q}\\nR: \${a}\` : null;
  }).filter(Boolean);
  if (lines.length > 0) faqBlock = \`\\n\\nPreguntas frecuentes:\\n\${lines.join('\\n\\n')}\`;
}

let hoursBlock = '';
const wh = settings.working_hours_json ?? {};
if (wh && typeof wh === 'object' && Object.keys(wh).length > 0) {
  const dayMap = { mon:'Lun', tue:'Mar', wed:'Mie', thu:'Jue', fri:'Vie', sat:'Sab', sun:'Dom' };
  const lines = Object.entries(wh).map(([d, h]) => \`\${dayMap[d] ?? d}: \${h}\`);
  hoursBlock = \`\\n\\nHorarios de atencion: \${lines.join(' | ')}\`;
}

const contactLines = [];
if (settings.phone_contact) contactLines.push(\`Telefono/WhatsApp: \${settings.phone_contact}\`);
if (settings.google_maps_url) contactLines.push(\`Ubicacion / mapa: \${settings.google_maps_url}\`);

const hasConfiguredInfo =
  !!faqBlock ||
  !!settings.about_text ||
  !!hoursBlock ||
  contactLines.length > 0 ||
  !!settings.cancellation_policy;

const defaultInfo =
  \`Informacion base si faltan datos configurados:\\n\` +
  \`- La clinica usa este WhatsApp para orientar pacientes y ayudarles a agendar.\\n\` +
  \`- Puede mostrar servicios disponibles, precios configurados, medicos/especialistas y horarios libres.\\n\` +
  \`- Puede ayudar a cancelar o reagendar citas escribiendo "cancelar" o "reagendar".\\n\` +
  \`- Si el paciente necesita hablar con recepcion, puede llamar por WhatsApp al numero de la clinica o pedir contacto aqui.\\n\` +
  \`- Para dudas medicas, diagnosticos o medicamentos, debe agendar consulta con un doctor.\`;

let system = settings.assistant_prompt
  ? settings.assistant_prompt
  : \`Eres el asistente virtual de \${clinicName}. Responde de forma amable, clara y util en espanol.\`;

if (settings.about_text) system += \`\\n\\nSobre la clinica: \${settings.about_text}\`;
if (faqBlock) system += faqBlock;
if (settings.cancellation_policy) system += \`\\n\\nPolitica de cancelacion: \${settings.cancellation_policy}\`;
if (hoursBlock) system += hoursBlock;
if (contactLines.length > 0) system += \`\\n\\nContacto:\\n\${contactLines.join('\\n')}\`;
system += \`\\n\\n\${defaultInfo}\`;

system +=
  \`\\n\\nReglas importantes:\\n\` +
  \`- Si preguntan por informacion general, responde con una estructura clara: presentacion, que puede hacer el asistente, como agendar y siguiente paso.\\n\` +
  \`- No digas simplemente "no tengo informacion disponible"; si falta un dato exacto, dilo brevemente y ofrece agendar o mostrar servicios.\\n\` +
  \`- No inventes horarios, direccion ni telefonos si no estan configurados.\\n\` +
  \`- Maximo 6 bloques cortos, apto para WhatsApp.\\n\` +
  \`- Para sintomas, medicamentos o diagnosticos, indica que debe revisarlo el doctor en consulta.\\n\` +
  \`- Cierra con una pregunta util para enganchar al paciente.\`;

return [{
  json: {
    ...envelope,
    _faq_has_configured_info: hasConfiguredInfo,
    _groq_messages: [
      { role: 'system', content: system },
      { role: 'user', content: msgText }
    ]
  }
}];`;

  nodeByName(wf, 'Build FAQ Outbound').parameters.jsCode = `// CF-10 - Build FAQ Outbound
const envelope = $('Build FAQ Context').item.json;
const groqResp = $input.first().json;

let answer = '';
try {
  answer = String(groqResp?.choices?.[0]?.message?.content ?? '').trim();
} catch (_) {
  answer = '';
}

const clinic = envelope.tenant?.name ?? 'la clinica';
const phone = envelope.tenant?.settings?.phone_contact ?? null;
const weakAnswer =
  !answer ||
  /no tengo (esa )?informaci[oó]n disponible/i.test(answer) ||
  /no hay informaci[oó]n/i.test(answer);

if (weakAnswer) {
  const phoneLine = phone
    ? \`\\n📞 Tambien puedes llamar por WhatsApp a la clinica: \${phone}\`
    : \`\\n📞 Tambien puedes llamar por WhatsApp a este mismo numero si prefieres hablar directo.\`;

  answer =
    \`🏥 *\${clinic}*\\n\\n\` +
    \`Puedo ayudarte a encontrar el servicio adecuado, revisar medicos disponibles y agendar una cita desde este chat.\\n\\n\` +
    \`Tambien puedo apoyarte con cambios de cita: escribe *cancelar* o *reagendar* cuando lo necesites.\` +
    phoneLine +
    \`\\n\\nPara ver servicios y precios, responde *2*. Para agendar, responde *1*.\`;
}

const fullBody =
  answer +
  '\\n\\n─────────────────\\n¿En qué más puedo ayudarte?\\n\\n1. 📅 Agendar cita\\n2. 🏥 Ver servicios\\n3. ❓ Más preguntas\\n\\n_Responde con el número o escribe tu opción._';

return [{
  json: {
    ...envelope,
    _groq_messages: undefined,
    _outbound: {
      type: 'text',
      body: fullBody
    }
  }
}];`;
  save(file, wf);
}

// Evolution inbound entry: ignore WhatsApp call events before dedup/session.
{
  const file = '0df3bTsm6I8Lz0e3.json';
  const wf = load(file);
  nodeByName(wf, 'Guard — Filtrar evento').parameters.jsCode = `// GUARD rapido para Evolution inbound
const body = $input.first().json.body;

const event = String(body?.event ?? '');
const eventLower = event.toLowerCase();
const data = body?.data ?? {};
const key = data?.key ?? {};
const messageType = String(data?.messageType ?? data?.type ?? '').toLowerCase();

const fromMe = key?.fromMe ?? true;
const remoteJid = key?.remoteJid ?? null;
const hasJid = !!remoteJid;

const isCallEvent =
  eventLower.includes('call') ||
  messageType.includes('call') ||
  !!data?.call ||
  !!data?.calls ||
  !!body?.call ||
  !!body?.calls;

const isGroup = String(remoteJid ?? '').endsWith('@g.us');

const isValid = (
  event === 'messages.upsert' &&
  fromMe === false &&
  hasJid === true &&
  isCallEvent === false &&
  isGroup === false
);

return [{
  json: {
    _is_valid: isValid,
    _skip_reason: isCallEvent ? 'call_event' : (isGroup ? 'group_message' : null),
    _raw_body: body
  }
}];`;
  save(file, wf);
}

// Reminder system fixes: use true PostgREST windows and process all returned items.
{
  const file = 'UBvE1gzVINp72g4l.json';
  const wf = load(file);
  for (const name of ['Supabase — GET recordatorios 24h', 'Supabase — GET recordatorios 2h']) {
    const node = nodeByName(wf, name);
    const params = node.parameters.queryParameters.parameters;
    node.parameters.queryParameters.parameters = params.filter(p => p.name !== 'start_at');
    const is24 = name.includes('24h');
    node.parameters.queryParameters.parameters.splice(1, 0, {
      name: 'and',
      value: is24
        ? '=(start_at.gte.{{$json.w24_start}},start_at.lte.{{$json.w24_end}})'
        : '=(start_at.gte.{{$json.w2_start}},start_at.lte.{{$json.w2_end}})'
    });
  }

  nodeByName(wf, 'Etiquetar 24h').parameters.jsCode = `// Etiquetar recordatorios 24h procesando todos los items devueltos
const appts = $input.all()
  .map(i => i.json)
  .flatMap(j => Array.isArray(j) ? j : (j?.id ? [j] : []));
const start = new Date($('Calcular ventanas').item.json.w24_start).getTime();
const end = new Date($('Calcular ventanas').item.json.w24_end).getTime();

return appts
  .filter(a => {
    if (!a?.id || !a?.start_at) return false;
    if (a.reminder_24h_sent !== false) return false;
    const t = new Date(a.start_at).getTime();
    return t >= start && t <= end;
  })
  .map(a => ({ json: { ...a, _reminder_type: '24h', _reminder_field: 'reminder_24h_sent' } }));`;

  nodeByName(wf, 'Etiquetar 2h').parameters.jsCode = `// Etiquetar recordatorios 2h procesando todos los items devueltos
const appts = $input.all()
  .map(i => i.json)
  .flatMap(j => Array.isArray(j) ? j : (j?.id ? [j] : []));
const start = new Date($('Calcular ventanas').item.json.w2_start).getTime();
const end = new Date($('Calcular ventanas').item.json.w2_end).getTime();

return appts
  .filter(a => {
    if (!a?.id || !a?.start_at) return false;
    if (a.reminder_2h_sent !== false) return false;
    const t = new Date(a.start_at).getTime();
    return t >= start && t <= end;
  })
  .map(a => ({ json: { ...a, _reminder_type: '2h', _reminder_field: 'reminder_2h_sent' } }));`;

  save(file, wf);
}

console.log(`Patched workflows written to ${outDir}`);
