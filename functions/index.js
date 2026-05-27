const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const { onCall, onRequest } = require("firebase-functions/v2/https");

// LAZY LOADERS PARA LIBRERÍAS PESADAS (Evita Timeouts en despliegue)
let _admin;
function getAdmin() {
    if (!_admin) {
        _admin = require("firebase-admin");
        _admin.initializeApp();
    }
    return _admin;
}

let openai;
function getOpenAI() {
    if (!openai) {
        const { OpenAI } = require("openai");
        openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openai;
}

let genAI;
function getGenAI() {
    if (!genAI) {
        const { GoogleGenerativeAI } = require("@google/generative-ai");
        genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    }
    return genAI;
}

async function callGeminiText(prompt, systemInstruction = null, isJson = false) {
    const ai = getGenAI();
    const modelOptions = { model: "gemini-2.5-flash" };
    if (systemInstruction) {
        modelOptions.systemInstruction = systemInstruction;
    }
    if (isJson) {
        modelOptions.generationConfig = {
            responseMimeType: "application/json"
        };
    }
    const model = ai.getGenerativeModel(modelOptions);
    const result = await model.generateContent(prompt);
    return result.response.text();
}

async function callGeminiVision(imageBase64, prompt, systemInstruction = null) {
    const ai = getGenAI();
    const modelOptions = { model: "gemini-2.5-flash" };
    if (systemInstruction) {
        modelOptions.systemInstruction = systemInstruction;
    }
    modelOptions.generationConfig = {
        responseMimeType: "application/json"
    };
    const model = ai.getGenerativeModel(modelOptions);
    
    const base64Data = imageBase64.split(",")[1] || imageBase64;
    const mimeType = imageBase64.split(";")[0].split(":")[1] || "image/png";
    
    const imagePart = {
        inlineData: {
            data: base64Data,
            mimeType: mimeType
        }
    };
    
    const result = await model.generateContent([prompt, imagePart]);
    return result.response.text();
}

// CONFIGURACIÓN DE GREEN API (WhatsApp Directo sin verificación de Meta)
// ✅ CORREGIDO: Sin valores reales expuestos. Se maneja puramente por variables de entorno de Firebase.
const GREEN_API_HOST  = process.env.GREEN_API_HOST;
const GREEN_API_ID    = process.env.GREEN_API_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;

const MY_PHONE_NUMBER = "17874596147"; // Número móvil de recepción (Sin + ni guiones)

exports.onNewLead = onDocumentCreated("leads/{leadId}", async (event) => {
    const lead = event.data.data();
    const leadId = event.params.leadId;

    console.log(`🚀 Procesando nuevo lead: ${leadId} para el servicio: ${lead.service}`);

    // Disparar Webhook a Make.com si está configurado en las variables de entorno
    const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
    if (makeWebhookUrl) {
        try {
            const payload = {
                event: "new_lead",
                leadId,
                ...lead
            };
            const makeResponse = await fetch(makeWebhookUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            if (makeResponse.ok) {
                console.log("🚀 Notificación de nuevo lead enviada a Make.com");
            } else {
                console.error(`⚠️ Error al enviar webhook a Make.com: HTTP ${makeResponse.status}`);
            }
        } catch (webhookErr) {
            console.error("⚠️ Error enviando nuevo lead a Make.com:", webhookErr);
        }
    }

    // Construir el mensaje
    const messageBody = `
🔥 ¡NUEVO LEAD RECIBIDO!
-------------------------
👤 Nombre: ${lead.name || 'Sin nombre'}
📞 Tel: ${lead.phone || 'Sin teléfono'}
📍 Pueblo: ${lead.municipio || 'No especificado'}
🏢 Servicio: ${lead.service?.toUpperCase() || 'SOLAR'}
${lead.source ? `📢 Origen: ${lead.source}` : ''}
${lead.consumo ? `💰 Factura: ${lead.consumo}` : ''}
${lead.roofType ? `🏠 Techo: ${lead.roofType}` : ''}
${lead.credit ? `💳 Crédito: ${lead.credit}` : ''}
${lead.battery ? `🔋 Batería: ${lead.battery}` : ''}
${lead.recordingUrl ? `🎧 Grabación: ${lead.recordingUrl}` : ''}
-------------------------
⭐ Calificación: ${lead.scoreLabel || 'VIP Telefónico'}
🔗 Ver en CRM: https://angel-curbelo-sales-crm.web.app/admin.html
    `.trim();

    // ENVÍO POR GREEN API (WhatsApp Directo)
    if (GREEN_API_ID !== "TU_ID_INSTANCE") {
        try {
            const url = `${GREEN_API_HOST}/waInstance${GREEN_API_ID}/sendMessage/${GREEN_API_TOKEN}`;
            const payload = {
                chatId: `${MY_PHONE_NUMBER}@c.us`,
                message: messageBody
            };

            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            const result = await response.json();
            if (response.ok) {
                console.log(`✅ WhatsApp enviado por Green API al número ${MY_PHONE_NUMBER}`);
            } else {
                console.error("❌ Error de Green API:", JSON.stringify(result));
            }
        } catch (error) {
            console.error("❌ Excepción enviando WhatsApp por Green API:", error.message);
        }
    } else {
        console.log("⚠️ Green API en modo espera (Falta ID/TOKEN). Mostrando mensaje de alerta en consola:\n", messageBody);
    }
});

// ====== NUEVO: GENERACIÓN DE IA CON CONTROL DE COSTOS ======
exports.generateAIAsset = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { prompt, type, clientId } = request.data;
    
    if (!prompt) return { error: "No prompt provided" };

    try {
        const admin = getAdmin();
        const usageRef = admin.firestore().collection("usage").doc("stats");
        const usageDoc = await usageRef.get();
        let currentSpent = 0;
        
        if (usageDoc.exists) {
            currentSpent = usageDoc.data()[clientId || 'angel'] || 0;
        }

        if (clientId !== 'master' && currentSpent >= 5.00) {
            return { error: "Límite de presupuesto alcanzado ($5.00). Por favor recargue.", limitReached: true };
        }

        let result = "";
        let cost = 0;
        const ai = getOpenAI();

        if (type === "document") {
            const companyName = clientId === 'master' ? 'Master CRM HQ' : (clientId === 'angel' ? 'Angel Curbelo Sales' : 'Julio Varela Solar');
            const docContexts = {
                'factura': `Genera una factura comercial formal desglosada en formato JSON. Estructura requerida: { "title": "FACTURA COMERCIAL", "docNumber": "INV-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "items": [ { "description": "...", "unitPrice": 3500, "total": 3500 } ], "subtotal": 3500, "tax": 0, "total": 3500, "notes": "Pago debido al recibir. Gracias por su confianza en ${companyName}." }`,
                'propuesta': `Genera una propuesta comercial ejecutiva en formato JSON. Estructura requerida: { "title": "PROPUESTA COMERCIAL VIP", "docNumber": "PRP-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "objectives": "...", "scope": [ "Desarrollo de CRM o Sistema a la medida", "Creación de Agente IA Multimodal" ], "items": [ { "description": "Sistema de Gestión", "total": 2500 }, { "description": "Agente IA", "total": 1000 } ], "total": 3500, "nextSteps": "Firma del acuerdo inicial y depósito del 50% para inicio." }`,
                'contrato': `Genera un contrato formal de desarrollo de servicios y licenciamiento en formato JSON. Estructura requerida: { "title": "CONTRATO DE SERVICIOS PROFESIONALES", "docNumber": "CNT-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "clauses": [ { "title": "1. Objeto del Contrato", "text": "..." }, { "title": "2. Obligaciones y Confidencialidad", "text": "..." }, { "title": "3. Esquema de Inversión y Pagos", "text": "..." } ], "terms": "Licenciamiento perpetuo sin costos mensuales por usuario.", "total": 3500 }`
            };
            const sysPrompt = docContexts[request.data.docType] || docContexts['propuesta'];
            const cleanPrompt = prompt.trim();
            
            console.log(`📄 Generando documento JSON de tipo: ${request.data.docType} para: ${companyName}`);
            try {
                const response = await ai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: `Eres un consultor senior de negocios y gerente financiero de ${companyName}. ${sysPrompt} Debes entregar SIEMPRE un objeto JSON válido que cumpla la estructura solicitada.` },
                        { role: "user", content: `Genera un(a) ${request.data.docType} en formato JSON basado en: ${cleanPrompt}` }
                    ],
                    response_format: { type: "json_object" },
                    temperature: 0.3,
                });
                result = response.choices[0].message.content;
                cost = 0.001;
            } catch (openaiError) {
                console.warn("⚠️ OpenAI falló al generar documento. Intentando con Gemini...", openaiError);
                try {
                    result = await callGeminiText(
                        `Genera un(a) ${request.data.docType} en formato JSON basado en: ${cleanPrompt}`,
                        `Eres un consultor senior de negocios y gerente financiero de ${companyName}. ${sysPrompt} Debes entregar SIEMPRE un objeto JSON válido que cumpla la estructura solicitada.`,
                        true
                    );
                    cost = 0.0001;
                } catch (geminiError) {
                    console.error("❌ Fallaron tanto OpenAI como Gemini para generar documento:", geminiError);
                    throw openaiError;
                }
            }
        } else if (type === "image") {
            // Extraer categoría del prompt enriquecido
            const catMatch = prompt.match(/\[Categoría: (.+?)\]/);
            const category = catMatch ? catMatch[1] : 'Energía Solar';
            const cleanPrompt = prompt.replace(/\[Categoría: .+?\]\s*/g, '').replace(/\[Link: .+?\]\s*/g, '').trim();
            
            const imageContext = {
                'Energía Solar': 'paneles solares y baterías de respaldo en una casa moderna en Puerto Rico, techo con paneles brillantes bajo el sol tropical',
                'H&H Integral': 'sistema de limpieza Aqua Viva con filtro de agua cristalina, hogar impecable y moderno, purificador Water Tree elegante en cocina premium',
                'Aspiradoras Rainbow': 'sistema de limpieza Rainbow SRX premium con su recipiente de agua, familia saludable en hogar impecable, aire puro y superficies brillantes',
                'Baterías Zendure': 'sistema de almacenamiento de energía Zendure SuperBase en un hogar moderno, baterías elegantes conectadas a paneles solares',
                'Master CRM HQ': 'panel de control futurista y premium de un CRM personalizado con gráficos iluminados en oro y negro, agentes de inteligencia artificial y automatización de negocios de alta tecnología'
            };
            const imgContext = imageContext[category] || imageContext['Master CRM HQ'];
            
            console.log(`🎨 Generando imagen de ${category} para: ${cleanPrompt}`);
            const response = await ai.images.generate({
                model: "gpt-image-1",
                prompt: `Anuncio publicitario profesional y premium de ${imgContext}. Tema: ${cleanPrompt}. Estilo: Fotografía realista de alta gama, iluminación cinematográfica, colores vibrantes y modernos. Sin texto en la imagen.`,
                n: 1,
                size: "1024x1024"
            });
            
            const imgData = response.data[0];
            console.log("✅ Respuesta de OpenAI (Imagen) - keys:", Object.keys(imgData));
            
            if (imgData.url) {
                result = imgData.url;
                console.log("📎 Imagen recibida como URL");
            } else if (imgData.b64_json) {
                result = `data:image/png;base64,${imgData.b64_json}`;
                console.log("📎 Imagen recibida como base64, convertida a data URI");
            } else {
                console.error("❌ Formato de imagen desconocido:", JSON.stringify(imgData).substring(0, 200));
                return { error: "La IA generó la imagen pero en un formato no reconocido." };
            }
            cost = 0.04;
        } else {
            // Extraer categoría y link del prompt enriquecido
            const catMatch = prompt.match(/\[Categoría: (.+?)\]/);
            const linkMatch = prompt.match(/\[Link: (.+?)\]/);
            const category = catMatch ? catMatch[1] : 'Energía Solar';
            const ctaLink = linkMatch ? linkMatch[1] : 'https://master-crm-jvarela.web.app/';
            const cleanPrompt = prompt.replace(/\[Categoría: .+?\]\s*/g, '').replace(/\[Link: .+?\]\s*/g, '').trim();
            
            console.log(`✍️ Generando texto para categoría: ${category}, prompt: ${cleanPrompt}`);
            
            const categoryContext = {
                'Energía Solar': 'Vendes e instalas sistemas de paneles solares + baterías de respaldo en Puerto Rico. Enfócate en ahorro, independencia energética y protección contra apagones de LUMA.',
                'H&H Integral': 'Vendes productos de H&H Distributors en Puerto Rico. Tu catálogo incluye: AQUA VIVA SYSTEM (sistema de limpieza multifuncional con filtro de agua que limpia espacios y purifica el aire), WATER TREE (sistema de purificación de agua de flujo directo con filtros avanzados, detector de calidad y pantalla digital), TRIPLE TREATED WATER (sistema de tratamiento de agua con válvula de control avanzado y Smart Logic Controller). Enfócate en salud familiar, agua pura, aire limpio y hogar libre de contaminantes.',
                'Aspiradoras Rainbow': 'Vendes el Sistema de Limpieza Rainbow SRX en Puerto Rico. Es un sistema de limpieza + purificador de aire certificado. Usa agua en movimiento como filtro ("el polvo mojado no vuela") + neutralizador HEPA que retiene el 99.997% de bacterias y partículas. Incluye motor Hurricane de alta potencia. Accesorios: AquaMate (lava alfombras), RainJet (pisos duros), RainbowMate (muebles), Mini Jet (manchas). También tiene fragancias y soluciones de limpieza. Se vende mediante demostraciones en el hogar. Enfócate en eliminar ácaros, alérgenos, mejorar el aire que respira tu familia y limpieza profunda real.',
                'Baterías Zendure': 'Vendes sistemas de almacenamiento de energía Zendure en Puerto Rico. Línea incluye: SuperBase V (toda la casa), SuperBase Pro (uso profesional), SuperBase M (portátil). Son sistemas plug-and-play diseñados para respaldo del hogar completo. Enfócate en respaldo durante apagones de LUMA, independencia energética, almacenamiento solar y tecnología de vanguardia.',
                'Master CRM HQ': 'Vendes sistemas de CRM personalizados premium, creación de agentes de Inteligencia Artificial autónomos (como bots multimodales en WhatsApp/Telegram), automatizaciones de negocio avanzadas con Make.com y Twilio, y embudos de captación de leads de alta conversión construidos a la medida para empresas en Puerto Rico y el exterior. Enfócate en control total de prospectos, automatización del equipo de ventas, notificaciones instantáneas a WhatsApp, y escalabilidad empresarial con IA de última generación.'
            };
            
            const context = categoryContext[category] || categoryContext['Energía Solar'];
            
            try {
                const response = await ai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [
                        { role: "system", content: `Eres un experto en redactar anuncios virales para redes sociales. ${context} Tu tarea es entregar el texto del anuncio LISTO PARA PEGAR. NO incluyas etiquetas como 'Hook:', 'Texto corto:', ni introducciones. Solo el texto persuasivo con emojis. Al final incluye un llamado a la acción con el enlace proporcionado.` },
                        { role: "user", content: `Redacta un anuncio irresistible de ${category} basado en: ${cleanPrompt}. Empieza con un hook potente y sigue con el cuerpo del mensaje. Al final pon: 👉 Cotiza gratis aquí: ${ctaLink}` }
                    ],
                });
                console.log("✅ Respuesta de OpenAI (Texto):", response.choices[0].message.content);
                result = response.choices[0].message.content;
                cost = 0.0005;
            } catch (openaiError) {
                console.warn("⚠️ OpenAI falló al generar texto de anuncio. Intentando con Gemini...", openaiError);
                try {
                    result = await callGeminiText(
                        `Redacta un anuncio irresistible de ${category} basado en: ${cleanPrompt}. Empieza con un hook potente y sigue con el cuerpo del mensaje. Al final pon: 👉 Cotiza gratis aquí: ${ctaLink}`,
                        `Eres un experto en redactar anuncios virales para redes sociales. ${context} Tu tarea es entregar el texto del anuncio LISTO PARA PEGAR. NO incluyas etiquetas como 'Hook:', 'Texto corto:', ni introducciones. Solo el texto persuasivo con emojis. Al final incluye un llamado a la acción con el enlace proporcionado.`
                    );
                    cost = 0.00005;
                } catch (geminiError) {
                    console.error("❌ Fallaron tanto OpenAI como Gemini para generar texto de anuncio:", geminiError);
                    throw openaiError;
                }
            }
        }

        const newTotal = currentSpent + cost;
        const targetId = clientId || 'angel';
        await usageRef.set({
            [targetId]: newTotal,
            [`${targetId}_last_use`]: getAdmin().firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return { 
            result, 
            totalSpent: newTotal, 
            nearLimit: newTotal >= 4.50 
        };

    } catch (error) {
        console.error("❌ AI Error Detallado:", error);
        
        let extraInfo = "";
        try {
            const ai = getOpenAI();
            const models = await ai.models.list();
            const modelIds = models.data.map(m => m.id).join(", ");
            extraInfo = `\n\nModelos disponibles en tu cuenta: ${modelIds}`;
        } catch (e) {
            extraInfo = "\n\nNo se pudo listar los modelos.";
        }

        if (error.response) {
            console.error("OpenAI Error Data:", error.response.data);
            return { error: `OpenAI Error: ${error.response.data.error?.message || 'Error desconocido'}${extraInfo}` };
        }

        return { error: `Error de IA: ${error.message}${extraInfo}` };
    }
});

// ====== OCR: EXTRAER LEADS DESDE FOTO ======
exports.extractLeadsFromImage = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { imageBase64 } = request.data;
    if (!imageBase64) return { error: "No se proporcionó imagen" };

    try {
        const ai = getOpenAI();
        let content;
        try {
            const response = await ai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    {
                        role: "system",
                        content: `Eres un experto en extraer datos de prospectos/leads de imágenes. Extrae TODOS los prospectos que encuentres. Responde SOLO con un JSON array válido, sin markdown ni texto extra. Cada objeto debe tener estos campos (usa null si no hay dato):
{"name":"nombre","phone":"teléfono","municipio":"ciudad","service":"solar","credit":"750+|651-749|Menos de 650","consumo":"factura","roofType":"Concreto|Zinc","notes":"info extra"}`
                    },
                    {
                        role: "user",
                        content: [
                            { type: "text", text: "Extrae todos los prospectos/leads de esta imagen. Si no hay datos, devuelve []." },
                            { type: "image_url", image_url: { url: imageBase64 } }
                        ]
                    }
                ],
                max_tokens: 4000
            });
            content = response.choices[0].message.content;
        } catch (openaiError) {
            console.warn("⚠️ OpenAI falló en OCR. Intentando con Gemini...", openaiError);
            try {
                content = await callGeminiVision(
                    imageBase64,
                    "Extrae todos los prospectos/leads de esta imagen. Si no hay datos, devuelve [].",
                    `Eres un experto en extraer datos de prospectos/leads de imágenes. Extrae TODOS los prospectos que encuentres. Responde SOLO con un JSON array válido, sin markdown ni texto extra. Cada objeto debe tener estos campos (usa null si no hay dato):
{"name":"nombre","phone":"teléfono","municipio":"ciudad","service":"solar","credit":"750+|651-749|Menos de 650","consumo":"factura","roofType":"Concreto|Zinc","notes":"info extra"}`
                );
            } catch (geminiError) {
                console.error("❌ Fallaron tanto OpenAI como Gemini para OCR:", geminiError);
                throw openaiError;
            }
        }
        console.log("📸 OCR Response:", content.substring(0, 300));
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const leads = JSON.parse(jsonMatch[0]);
            return { leads };
        }
        return { leads: [], message: "No se encontraron leads en la imagen." };
    } catch (error) {
        console.error("❌ OCR Error:", error);
        return { error: `Error al procesar imagen: ${error.message}` };
    }
});

// ====== IA ASISTENTE DE COMUNICACIÓN ======
// export const initStorage = onCall({ region: 'us-central1' }, async (request) => { ... });


exports.generateLeadMessage = onCall({ timeoutSeconds: 60 }, async (request) => {
    const { lead, objective, tone } = request.data;
    if (!lead) return { error: "Datos del prospecto incompletos." };

    try {
        const ai = getOpenAI();
        const promptText = `Actúa como un asesor de ventas premium experto (Angel Curbelo / TuPlanta.com). Redacta un mensaje directo de comunicación para el siguiente prospecto:

Datos del Prospecto:
- Nombre: ${lead.name || 'Cliente'}
- Servicio de interés: ${lead.service || 'Solar'}
- Ubicación: ${lead.municipio || 'No especificada'}
- Calidad de crédito: ${lead.credit || 'No especificada'}
- Notas o detalles: ${lead.notes || lead.consumo || lead.detalles || 'Ninguno'}

Objetivo del mensaje: ${objective || 'Contacto inicial'}
Tono del mensaje: ${tone || 'Profesional y Humano'}

REGLAS DE ORO (CRÍTICO PARA NO SONAR COMO ROBOT):
1. El mensaje debe sentirse 100% humano, cercano, empático y muy natural. Evita frases cliché de call center o lenguaje robótico.
2. Saluda cálidamente por su nombre. Demuestra que entiendes su necesidad.
3. Termina siempre con una pregunta o llamado a la acción suave (ej: confirmar si le viene bien hablar unos minutos hoy o agendar una breve llamada).
4. Firma de forma profesional y amigable: "Angel Curbelo - Asesor Premium (TuPlanta.com / 787-459-6147)".
5. Nunca incluyas corchetes ni placeholders [como este], todo debe estar listo para copiar y enviar.`;

        let messageText;
        try {
            const response = await ai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [{ role: "user", content: promptText }],
                max_tokens: 500,
                temperature: 0.7
            });
            messageText = response.choices[0].message.content;
        } catch (openaiError) {
            console.warn("⚠️ OpenAI falló al generar mensaje de lead. Intentando con Gemini...", openaiError);
            try {
                messageText = await callGeminiText(promptText);
            } catch (geminiError) {
                console.error("❌ Fallaron tanto OpenAI como Gemini para generar mensaje de lead:", geminiError);
                throw openaiError;
            }
        }

        return { message: messageText };
    } catch (error) {
        console.error("❌ AI Comm Error:", error);
        return { error: `Error al generar mensaje: ${error.message}` };
    }
});

// ====== NUEVO: WEBHOOK PARA AGENTES DE VOZ IA (VAPI / RETELL / TWILIO STREAM) ======
exports.onVoiceCallWebhook = onRequest(async (req, res) => {
    // Verificar si es petición POST
    if (req.method !== "POST") {
        return res.status(405).send("Method Not Allowed");
    }

    try {
        const body = req.body || {};
        console.log("📞 Webhook de Voz IA recibido. Payload inicial:", JSON.stringify(body).substring(0, 400));

        // 1. Extraer el mensaje principal de Vapi o Retell
        const message = body.message || body;
        const callData = message.call || message;

        // Validar si es un evento ignorable (ej: status-update intermedio de Vapi sin final)
        if (message.type && !["end-of-call-report", "tool_calls", "function-call", "call_summary"].includes(message.type)) {
            console.log(`ℹ️ Evento Webhook ignorado (Tipo de evento: ${message.type})`);
            return res.status(200).json({ status: "ignored", type: message.type });
        }

        // 2. Extraer datos principales
        const customerPhone = callData.customer?.number || callData.from || callData.callerNumber || callData.customerPhone || "Desconocido";
        const recordingUrl = callData.recordingUrl || callData.recording_url || null;
        const summary = message.summary || callData.summary || message.analysis?.summary || body.summary || "Sin resumen de llamada disponible.";
        const transcript = message.transcript || callData.transcript || body.transcript || "";

        // 3. Extraer metadatos estructurados si el agente los recopiló mediante Function Calling o Analysis
        const structuredData = message.analysis?.structuredData || callData.structuredData || body.leadData || {};
        let name = structuredData.name || callData.customer?.name || "Prospecto de Llamada IA";
        let municipio = structuredData.municipio || structuredData.pueblo || "No especificado";
        const notes = `Resumen Llamada IA: ${summary}`;

        if (name === "Prospecto de Llamada IA" && transcript) {
            const nameMatch = transcript.match(/(?:mi nombre es|soy|me llamo|hablas con|el gusto con|gusto, soy)\s+([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?)/i) || transcript.match(/User:\s*([A-Z][a-záéíóúñ]+\s+[A-Z][a-záéíóúñ]+)\s+(?:from|de)\s+/i);
            if (nameMatch && nameMatch[1]) {
                name = nameMatch[1].trim();
            }
        }

        // Limpieza robusta si Vapi alucinó el pueblo con palabras del servicio
        const invalidTownWords = ["respaldo", "zendure", "rainbow", "solar", "batería", "sistema", "filtro", "agua", "placas", "paneles", "purificador", "luma", "factura", "completo", "inversor"];
        if (municipio !== "No especificado" && (municipio.length > 25 || invalidTownWords.some(w => municipio.toLowerCase().includes(w)))) {
            console.log(`⚠️ Municipio inválido detectado desde IA (${municipio}), reseteando a No especificado para extracción por regex.`);
            municipio = "No especificado";
        }

        if (municipio === "No especificado" && transcript) {
            // Extraer exclusivamente de las líneas habladas por el cliente (User:) para evitar capturar frases del libreto de la IA
            const userLines = transcript.split('\n').filter(l => l.startsWith('User:')).join(' ');
            const townMatch = userLines.match(/(?:de|desde|from|en|pueblo de|vivo en|resido en|soy de|municipio de)\s+([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)?)/i);
            if (townMatch && townMatch[1]) {
                const extracted = townMatch[1].trim();
                const excludedWords = ["User", "AI", "Angel", "Rainbow", "Water", "Sales", "The", "Look", "Excellent", "Mucho", "Wow", "Tu", "Your", "Puerto", "Rico", "Sistema", "Placas", "Paneles", "Baterias", "Dueño", "Propiedad", "Concreto", "Madera", "Cemento", "Metal", "Respaldo", "Zendure", "Inversor"];
                if (!excludedWords.some(w => extracted.toLowerCase() === w.toLowerCase())) {
                    municipio = extracted;
                }
            }
        }

        // 4. Determinar servicio / vertical según el contenido o el número/asistente
        let service = structuredData.service || body.service || "";
        const textToCheck = `${summary || ''} ${transcript || ''}`.toLowerCase();
        
        // Regla de Oro de Prioridad: Si el prospecto menciona "sistema completo", "placas", "paneles", "inversor", "tuplanta" o "solar", ES SOLAR.
        if (textToCheck.includes("sistema completo") || textToCheck.includes("placas") || textToCheck.includes("paneles") || textToCheck.includes("tuplanta") || (textToCheck.includes("solar") && !textToCheck.includes("filtro"))) {
            service = "solar";
        } else if (!service || service === "solar") {
            if (textToCheck.includes("rainbow") || textToCheck.includes("aspiradora") || textToCheck.includes("purificador de aire") || textToCheck.includes("srx") || textToCheck.includes("expert en purificación")) {
                service = "rainbow";
            } else if (textToCheck.includes("zendure") || textToCheck.includes("batería") || textToCheck.includes("superbase") || textToCheck.includes("respaldo")) {
                service = "zendure";
            } else if (textToCheck.includes("h&h") || textToCheck.includes("hh") || textToCheck.includes("aqua viva") || textToCheck.includes("water tree") || textToCheck.includes("filtro de agua") || textToCheck.includes("agua") || textToCheck.includes("suavizador")) {
                service = "h&h";
            } else {
                service = "solar";
            }
        }

        const admin = getAdmin();
        const newLeadRef = admin.firestore().collection("leads").doc();
        
        const newLeadData = {
            name: name,
            phone: customerPhone,
            municipio: municipio,
            service: service.toLowerCase(),
            source: "Llamada Entrante IA (Voz)",
            recordingUrl: recordingUrl,
            notes: notes,
            transcript: transcript,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            scoreLabel: "🔥 VIP Telefónico",
            status: "Nuevo"
        };

        await newLeadRef.set(newLeadData);

        console.log(`✅ Nuevo prospecto de Voz IA guardado exitosamente con ID: ${newLeadRef.id}`);
        return res.status(200).json({ success: true, leadId: newLeadRef.id, message: "Prospecto guardado exitosamente" });

    } catch (error) {
        console.error("❌ Error procesando Webhook de Voz IA:", error);
        return res.status(500).json({ error: error.message });
    }
});

// ====== AGENDAR CITA EN CALENDARIO (CALLABLE) ======
exports.scheduleLeadAppointment = onCall({ timeoutSeconds: 60 }, async (request) => {
    const { leadId, date, time, assignedTo, notes } = request.data;
    if (!leadId || !date || !time) {
        return { error: "Faltan parámetros obligatorios (leadId, date, time)." };
    }

    try {
        const admin = getAdmin();
        const leadRef = admin.firestore().collection("leads").doc(leadId);
        const leadDoc = await leadRef.get();
        if (!leadDoc.exists) {
            return { error: "El prospecto especificado no existe en la base de datos." };
        }

        const leadData = leadDoc.data();
        const scheduledTimestamp = admin.firestore.FieldValue.serverTimestamp();

        const appointmentObj = {
            date,
            time,
            assignedTo: assignedTo || "Angel Curbelo",
            notes: notes || "",
            scheduledAt: scheduledTimestamp
        };

        await leadRef.update({
            status: "Cita",
            appointment: appointmentObj,
            appointmentDate: date,
            appointmentTime: time,
            updatedAt: scheduledTimestamp
        });

        console.log(`✅ Cita agendada para prospecto ${leadId} (${leadData.name}): ${date} a las ${time}`);

        // Disparar Webhook a Make.com si está configurado en las variables de entorno
        const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
        if (makeWebhookUrl) {
            try {
                const payload = {
                    event: "appointment_scheduled",
                    leadId,
                    name: leadData.name,
                    phone: leadData.phone || "",
                    email: leadData.email || "",
                    service: leadData.service || "solar",
                    municipio: leadData.municipio || "",
                    appointment: appointmentObj
                };
                await fetch(makeWebhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                console.log("🚀 Notificación enviada exitosamente a Make.com / Google Calendar");
            } catch (webhookErr) {
                console.error("⚠️ Error enviando webhook a Make.com:", webhookErr);
            }
        }

        return {
            success: true,
            message: "Cita agendada y guardada exitosamente.",
            appointment: appointmentObj
        };
    } catch (error) {
        console.error("❌ Error en scheduleLeadAppointment:", error);
        return { error: `Error interno al agendar cita: ${error.message}` };
    }
});

// ====== WEBHOOK PARA HERRAMIENTA DE VAPI (AGENDAR CITA) ======
exports.vapiAppointmentWebhook = onRequest({ cors: true }, async (req, res) => {
    try {
        console.log("🔔 Recibida solicitud de Vapi Tool Call (Agendar Cita):", JSON.stringify(req.body));
        
        const body = req.body || {};
        const message = body.message || {};
        let args = {};

        if (message.toolCalls && message.toolCalls.length > 0) {
            const func = message.toolCalls[0].function || {};
            if (typeof func.arguments === "string") {
                try { args = JSON.parse(func.arguments); } catch(e) { args = {}; }
            } else if (typeof func.arguments === "object") {
                args = func.arguments;
            }
        } else if (message.toolCallList && message.toolCallList.length > 0) {
            const call = message.toolCallList[0];
            const func = call.function || {};
            if (typeof func.arguments === "string") {
                try { args = JSON.parse(func.arguments); } catch(e) { args = {}; }
            } else if (typeof func.arguments === "object") {
                args = func.arguments;
            }
        } else {
            args = body.args || body;
        }

        const { name, phone, date, time, notes, service } = args;

        if (!name || !date || !time) {
            return res.status(400).json({ error: "Faltan parámetros obligatorios (name, date, time)." });
        }

        const admin = getAdmin();
        const leadsRef = admin.firestore().collection("leads");

        let leadId = null;
        let leadData = null;

        if (phone) {
            const cleanPhone = phone.replace(/\D/g, '');
            const phoneQuery = await leadsRef.where("phone", "==", cleanPhone).limit(1).get();
            if (!phoneQuery.empty) {
                leadId = phoneQuery.docs[0].id;
                leadData = phoneQuery.docs[0].data();
            }
        }

        if (!leadId) {
            const nameQuery = await leadsRef.where("name", "==", name).limit(1).get();
            if (!nameQuery.empty) {
                leadId = nameQuery.docs[0].id;
                leadData = nameQuery.docs[0].data();
            }
        }

        const scheduledTimestamp = admin.firestore.FieldValue.serverTimestamp();
        const appointmentObj = {
            date,
            time,
            assignedTo: "Angel Curbelo",
            notes: notes || "Cita agendada por Asistente de Voz IA de Vapi",
            scheduledAt: scheduledTimestamp
        };

        if (leadId) {
            await leadsRef.doc(leadId).update({
                status: "Cita",
                appointment: appointmentObj,
                appointmentDate: date,
                appointmentTime: time,
                updatedAt: scheduledTimestamp
            });
            console.log(`✅ Cita actualizada para lead existente ${leadId} (${name})`);
        } else {
            const newDoc = leadsRef.doc();
            leadId = newDoc.id;
            leadData = {
                name,
                phone: phone || "",
                service: (service || "solar").toLowerCase(),
                source: "Asistente de Voz IA (Vapi Tool)",
                status: "Cita",
                appointment: appointmentObj,
                appointmentDate: date,
                appointmentTime: time,
                createdAt: scheduledTimestamp,
                scoreLabel: "🔥 VIP Telefónico"
            };
            await newDoc.set(leadData);
            console.log(`✅ Nuevo lead creado y cita agendada con ID ${leadId} (${name})`);
        }

        const makeWebhookUrl = process.env.MAKE_WEBHOOK_URL;
        if (makeWebhookUrl) {
            try {
                const payload = {
                    event: "appointment_scheduled_vapi",
                    leadId,
                    name,
                    phone: phone || "",
                    service: service || "solar",
                    appointment: appointmentObj
                };
                await fetch(makeWebhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload)
                });
                console.log("🚀 Notificación enviada a Make.com desde Vapi Tool");
            } catch (webhookErr) {
                console.error("⚠️ Error enviando webhook a Make.com:", webhookErr);
            }
        }

        return res.status(200).json({
            results: [{
                toolCallId: (message.toolCalls && message.toolCalls[0]?.id) || (message.toolCallList && message.toolCallList[0]?.id) || "call_appointment_0",
                result: `Cita confirmada exitosamente para el ${date} a las ${time} con Angel Curbelo.`
            }]
        });

    } catch (error) {
        console.error("❌ Error en vapiAppointmentWebhook:", error);
        return res.status(500).json({ error: error.message });
    }
});

// ====== NUEVO: DISPARAR LLAMADA SALIENTE AUTOMÁTICA POR VAPI (OUTBOUND CALL) ======
exports.initiateOutboundVapiCall = onCall({ timeoutSeconds: 60 }, async (request) => {
    const { leadId, phone, name, service } = request.data;
    if (!phone) {
        return { error: "El prospecto no tiene un número de teléfono válido para marcar." };
    }

    try {
        const vapiApiKey = process.env.VAPI_API_KEY || "TU_VAPI_PRIVATE_API_KEY";
        const phoneNumberId = process.env.VAPI_PHONE_NUMBER_ID || "TU_PHONE_NUMBER_ID";
        
        if (vapiApiKey === "TU_VAPI_PRIVATE_API_KEY" || !vapiApiKey) {
            console.log("⚠️ Vapi en modo simulación (Falta VAPI_API_KEY en .env). Simulando llamada saliente para:", name, phone);
            return {
                success: true,
                simulated: true,
                callId: `sim_vapi_call_${Date.now()}`,
                message: "Llamada iniciada en modo simulación exitosamente (Configura tu VAPI_API_KEY en el archivo .env de functions)."
            };
        }

        // Seleccionar el ID del asistente según el servicio
        const assistants = {
            solar: process.env.VAPI_ASSISTANT_SOLAR || "id_asistente_solar",
            zendure: process.env.VAPI_ASSISTANT_ZENDURE || "id_asistente_zendure",
            rainbow: process.env.VAPI_ASSISTANT_RAINBOW || "id_asistente_rainbow",
            hh: process.env.VAPI_ASSISTANT_HH || "id_asistente_hh"
        };
        const targetService = (service || "solar").toLowerCase();
        const assistantId = assistants[targetService] || assistants.solar;

        // Limpiar el teléfono para formato E.164
        const cleanPhone = phone.replace(/\D/g, '');
        const formattedPhone = cleanPhone.startsWith('1') ? `+${cleanPhone}` : `+1${cleanPhone}`;

        console.log(`📞 Solicitando llamada saliente de Vapi para ${name} al número ${formattedPhone} con asistente ${assistantId}...`);

        const response = await fetch("https://api.vapi.ai/call/phone", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${vapiApiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                phoneNumberId: phoneNumberId,
                assistantId: assistantId,
                customer: {
                    number: formattedPhone,
                    name: name || "Cliente VIP"
                }
            })
        });

        const data = await response.json();
        if (!response.ok) {
            console.error("❌ Error de Vapi API al generar llamada:", JSON.stringify(data));
            return { error: `Error de Vapi: ${data.message || data.error?.message || 'Error desconocido al marcar'}` };
        }

        console.log(`✅ Llamada saliente generada en Vapi con Call ID: ${data.id}`);

        // Actualizar el estado del lead en Firestore
        if (leadId) {
            const admin = getAdmin();
            await admin.firestore().collection("leads").doc(leadId).update({
                status: "Llamada IA Iniciada",
                lastVapiCallId: data.id,
                vapiCallStatus: "queued",
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        return {
            success: true,
            callId: data.id,
            message: "Llamada iniciada exitosamente por el Asistente IA."
        };

    } catch (error) {
        console.error("❌ Excepción en initiateOutboundVapiCall:", error);
        return { error: `Error interno del servidor: ${error.message}` };
    }
});

// ====== NUEVO: GENERADOR CREATIVO DE ANUNCIOS CON IA ======
exports.generateMarketingCopy = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { platform, product, angle, clientId } = request.data;
    
    if (!platform || !product || !angle) {
        return { error: "Faltan parámetros requeridos (platform, product, angle)" };
    }

    try {
        const admin = getAdmin();
        const usageRef = admin.firestore().collection("usage").doc("stats");
        const usageDoc = await usageRef.get();
        let currentSpent = 0;
        const targetId = clientId || 'angel';
        
        if (usageDoc.exists) {
            currentSpent = usageDoc.data()[targetId] || 0;
        }

        if (targetId !== 'master' && currentSpent >= 5.00) {
            return { error: "Límite de presupuesto alcanzado ($5.00). Por favor recargue.", limitReached: true };
        }

        console.log(`🤖 Generando copy para plataforma: ${platform}, producto: ${product}, enfoque: ${angle}`);

        const systemInstruction = `Eres un redactor creativo de anuncios y copywriter premium experto en marketing digital.
Tu tarea es escribir copys persuasivos de alta conversión para la plataforma: ${platform}.
Debes redactar contenido específico para el producto o servicio: "${product}" con un enfoque de campaña basado en: "${angle}".
Debes devolver SIEMPRE una respuesta en formato JSON limpio con exactamente 3 variaciones diferentes bajo la clave "variations".
Cada variación debe tener esta estructura exacta de campos:
{
  "hook": "Un gancho inicial hiper persuasivo, emocionante y directo con emojis correctos.",
  "body": "El cuerpo del anuncio describiendo los beneficios clave, puntos de dolor y utilizando emojis adecuados.",
  "cta": "Una llamada a la acción irresistible y clara.",
  "text": "El copy completo final unificado listo para copiar y pegar (combinando hook, body y cta, con saltos de línea)."
}
Asegúrate de no incluir texto fuera del JSON. Devuelve solo el objeto JSON.`;

        const userPrompt = `Escribe 3 variaciones de anuncios para ${platform} sobre "${product}" con el enfoque de "${angle}".`;

        let responseText = "";
        let cost = 0;
        const ai = getOpenAI();

        try {
            const response = await ai.chat.completions.create({
                model: "gpt-4o-mini",
                messages: [
                    { role: "system", content: systemInstruction },
                    { role: "user", content: userPrompt }
                ],
                response_format: { type: "json_object" },
                temperature: 0.7,
            });
            responseText = response.choices[0].message.content;
            cost = 0.0005; // Costo por solicitud exitosa de OpenAI para texto
        } catch (openaiError) {
            console.warn("⚠️ OpenAI falló al generar texto de anuncios. Intentando con Gemini...", openaiError);
            try {
                responseText = await callGeminiText(userPrompt, systemInstruction, true);
                cost = 0.00005; // Costo por fallback exitoso a Gemini
            } catch (geminiError) {
                console.error("❌ Fallaron tanto OpenAI como Gemini para generar texto de anuncios:", geminiError);
                throw openaiError;
            }
        }
        
        let parsedResult;
        try {
            // Intentar parsear el JSON limpio
            const cleanText = responseText.replace(/```json\s?|```/g, "").trim();
            parsedResult = JSON.parse(cleanText);
        } catch (jsonErr) {
            console.error("Error parseando respuesta JSON:", responseText);
            // Intentar recuperar con regex o devolver estructura por defecto
            parsedResult = {
                variations: [
                    {
                        hook: "✨ ¡Llegó la solución que esperabas!",
                        body: responseText.substring(0, 300),
                        cta: "👉 Conoce más hoy.",
                        text: responseText
                    }
                ]
            };
        }

        // Registrar costo
        const newTotal = currentSpent + cost;
        await usageRef.set({
            [targetId]: newTotal,
            [`${targetId}_last_use`]: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return {
            variations: parsedResult.variations || [],
            totalSpent: newTotal,
            nearLimit: newTotal >= 4.50
        };

    } catch (error) {
        console.error("❌ Error en generateMarketingCopy:", error);
        return { error: `Error al generar copy con IA: ${error.message}` };
    }
});

// ====== GESTIÓN DE USUARIOS CRM (Admin SDK — Server-Side) ======
exports.createCRMUser = onCall({ timeoutSeconds: 30 }, async (request) => {
    // Verificar autenticación
    if (!request.auth) {
        return { error: "No autenticado." };
    }

    const { email, password, name, role, clientId } = request.data;

    // Validaciones de entrada
    if (!email || !password || !name || !role || !clientId) {
        return { error: "Faltan campos obligatorios (email, password, name, role, clientId)." };
    }

    if (password.length < 6) {
        return { error: "La contraseña debe tener al menos 6 caracteres." };
    }

    const validRoles = ['admin', 'master', 'staff', 'vendedor'];
    if (!validRoles.includes(role)) {
        return { error: `Rol inválido. Roles permitidos: ${validRoles.join(', ')}` };
    }

    try {
        const admin = getAdmin();

        // Doble verificación: Confirmar que el caller es admin, master, o el dueño (Angel)
        const callerDoc = await admin.firestore().collection('users').doc(request.auth.uid).get();
        if (!callerDoc.exists) {
            return { error: "No autorizado. Perfil no encontrado." };
        }
        
        const callerData = callerDoc.data();
        const isOwner = request.auth.token.email === 'jvarela2528@gmail.com' || request.auth.token.email === 'angelcurbelosales@gmail.com';
        const isMasterOrAdmin = ['admin', 'master'].includes(callerData.role);
        
        if (!isMasterOrAdmin && !isOwner) {
            return { error: "No autorizado. Solo administradores pueden crear usuarios." };
        }

        // Crear usuario en Firebase Auth (server-side, sin afectar sesión del admin)
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name
        });

        console.log(`✅ Usuario Auth creado: ${userRecord.uid} (${email})`);

        // Crear perfil en Firestore
        await admin.firestore().collection('users').doc(userRecord.uid).set({
            name: name,
            email: email,
            role: role,
            clientId: clientId,
            disabled: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid
        });

        console.log(`✅ Perfil Firestore creado para: ${name} (${email}) con rol: ${role}`);

        return {
            success: true,
            uid: userRecord.uid,
            message: `Usuario "${name}" (${email}) creado exitosamente con rol: ${role}.`
        };

    } catch (error) {
        console.error("❌ Error en createCRMUser:", error);

        // Errores conocidos de Firebase Auth
        if (error.code === 'auth/email-already-exists') {
            return { error: "Ya existe un usuario con ese correo electrónico." };
        }
        if (error.code === 'auth/invalid-email') {
            return { error: "El formato del correo electrónico es inválido." };
        }

        return { error: `Error al crear usuario: ${error.message}` };
    }
});
