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

// CONFIGURACIÓN DE GREEN API (WhatsApp Directo)
const GREEN_API_HOST  = process.env.GREEN_API_HOST;
const GREEN_API_ID    = process.env.GREEN_API_ID;
const GREEN_API_TOKEN = process.env.GREEN_API_TOKEN;
const MY_PHONE_NUMBER = process.env.OWNER_PHONE_NUMBER || "17874596147"; 

exports.onNewLead = onDocumentCreated("leads/{leadId}", async (event) => {
    const lead = event.data.data();
    const leadId = event.params.leadId;

    console.log(`🚀 Procesando nuevo lead: ${leadId} para el servicio: ${lead.service}`);

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

// ====== CRÍTICO (HIGH-07) GENERACIÓN DE IA CON TRANSACCIONES EVITA FRAUDES EN PRESUPUESTO ======
exports.generateAIAsset = onCall({ timeoutSeconds: 120 }, async (request) => {
    const { prompt, type, clientId, model } = request.data;
    if (!prompt) return { error: "No prompt provided" };

    try {
        const admin = getAdmin();
        const usageRef = admin.firestore().collection("usage").doc("stats");
        const targetId = clientId || 'angel';
        
        let cost = type === "image" ? 0.04 : (model === "gemini" ? 0.0001 : 0.001);
        let currentSpent = 0;

        // EJECUCIÓN ATÓMICA DE CONTROL FINANCIERO DEV/PROD
        await admin.firestore().runTransaction(async (transaction) => {
            const doc = await transaction.get(usageRef);
            if (doc.exists) {
                currentSpent = doc.data()[targetId] || 0;
            }
            if (targetId !== 'master' && currentSpent >= 5.00) {
                throw new Error("LIMIT_EXCEEDED");
            }
            // Reservar el saldo preventivamente en la transacción
            transaction.set(usageRef, {
                [targetId]: currentSpent + cost,
                [`${targetId}_last_use`]: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
        });

        let result = "";
        const ai = getOpenAI();

        if (type === "document") {
            const companyName = targetId === 'master' ? 'Master CRM HQ' : (targetId === 'angel' ? 'Angel Curbelo Sales' : 'Julio Varela Solar');
            const docContexts = {
                'factura': `Genera una factura comercial formal desglosada en formato JSON. Estructura requerida: { "title": "FACTURA COMERCIAL", "docNumber": "INV-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "items": [ { "description": "...", "unitPrice": 3500, "total": 3500 } ], "subtotal": 3500, "tax": 0, "total": 3500, "notes": "Pago debido al recibir. Gracias por su confianza en ${companyName}." }`,
                'propuesta': `Genera una propuesta comercial ejecutiva en formato JSON. Estructura requerida: { "title": "PROPUESTA COMERCIAL VIP", "docNumber": "PRP-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "objectives": "...", "scope": [ "Desarrollo de CRM o Sistema a la medida", "Creación de Agente IA Multimodal" ], "items": [ { "description": "Sistema de Gestión", "total": 2500 }, { "description": "Agente IA", "total": 1000 } ], "total": 3500, "nextSteps": "Firma del acuerdo inicial y depósito del 50% para inicio." }`,
                'contrato': `Genera un contrato formal de desarrollo de servicios y licenciamiento en formato JSON. Estructura requerida: { "title": "CONTRATO DE SERVICIOS PROFESIONALES", "docNumber": "CNT-2026-001", "date": "16 de Mayo, 2026", "clientName": "...", "clauses": [ { "title": "1. Objeto del Contrato", "text": "..." }, { "title": "2. Obligaciones y Confidencialidad", "text": "..." }, { "title": "3. Esquema de Inversión y Pagos", "text": "..." } ], "terms": "Licenciamiento perpetuo sin costos mensuales por usuario.", "total": 3500 }`
            };
            const sysPrompt = docContexts[request.data.docType] || docContexts['propuesta'];
            const cleanPrompt = prompt.trim();
            
            console.log(`📄 Generando documento JSON de tipo: ${request.data.docType} para: ${companyName} usando modelo: ${model}`);
            if (model === "gemini") {
                try {
                    result = await callGeminiText(
                        `Genera un(a) ${request.data.docType} en formato JSON basado en: ${cleanPrompt}`,
                        `Eres un consultor senior de negocios y gerente financiero de ${companyName}. ${sysPrompt} Debes entregar SIEMPRE un objeto JSON válido que cumpla la estructura solicitada.`,
                        true
                    );
                } catch (geminiError) {
                    console.warn("⚠️ Gemini falló al generar documento. Intentando con OpenAI...", geminiError);
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
                }
            } else {
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
                } catch (openaiError) {
                    console.warn("⚠️ OpenAI falló al generar documento. Intentando con Gemini...", openaiError);
                    result = await callGeminiText(
                        `Genera un(a) ${request.data.docType} en formato JSON basado en: ${cleanPrompt}`,
                        `Eres un consultor senior de negocios y gerente financiero de ${companyName}. ${sysPrompt} Debes entregar SIEMPRE un objeto JSON válido que cumpla la estructura solicitada.`,
                        true
                    );
                }
            }
        } else if (type === "image") {
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
            if (imgData.url) result = imgData.url;
            else if (imgData.b64_json) result = `data:image/png;base64,${imgData.b64_json}`;
        }

        return { result, totalSpent: currentSpent + cost, nearLimit: (currentSpent + cost) >= 4.50 };

    } catch (error) {
        if (error.message === "LIMIT_EXCEEDED") {
            return { error: "Límite de presupuesto alcanzado ($5.00). Por favor recargue.", limitReached: true };
        }
        console.error("❌ AI Error Detallado:", error);
        return { error: `Error de IA: ${error.message}` };
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
            content = await callGeminiVision(
                imageBase64,
                "Extrae todos los prospectos/leads de esta imagen. Si no hay datos, devuelve [].",
                `Eres un experto en extraer datos de prospectos/leads de imágenes. Extrae TODOS los prospectos que encuentres. Responde SOLO con un JSON array válido, sin markdown ni texto extra. Cada objeto debe tener estos campos (usa null si no hay dato):
{"name":"nombre","phone":"teléfono","municipio":"ciudad","service":"solar","credit":"750+|651-749|Menos de 650","consumo":"factura","roofType":"Concreto|Zinc","notes":"info extra"}`
            );
        }
        
        const jsonMatch = content.match(/\[[\s\S]*\]/);
        if (jsonMatch) {
            const leads = JSON.parse(jsonMatch[0]);
            return { leads };
        }
        return { leads: [] };
    } catch (error)