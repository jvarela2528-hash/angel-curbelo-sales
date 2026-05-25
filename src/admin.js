import './style.css'
import { db, functions, auth } from './firebase-config'
import { collection, query, orderBy, onSnapshot, doc, updateDoc, addDoc, deleteDoc, limit, getDoc } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { signInWithEmailAndPassword, signOut, onAuthStateChanged } from 'firebase/auth'
import { CLIENTS } from './clients-config'
import QRCode from 'qrcode'

// UI References
const loginScreen = document.getElementById('login-screen')
const adminPanel = document.getElementById('admin-panel')

// Debugger para capturar errores en producción
window.onerror = function(msg, url, line, col, error) {
    console.error("Error Global:", msg, url, line);
    // Solo mostrar alert si es un error crítico que detiene los botones
    if (msg.includes("prepareAd") || msg.includes("generateIdea")) {
        alert("Error de Sistema: " + msg);
    }
};

// --- Funciones Globales (Definidas al inicio para evitar errores de carga) ---
window.downloadMedia = (platform) => {
    const img = document.getElementById(`img-preview-${platform}`);
    if (!img || !img.src) return alert("No hay imagen para descargar");
    const link = document.createElement('a');
    link.href = img.src;
    const isVideo = img.src.includes('video') || platform === 'tiktok';
    link.download = `anuncio_solar_${platform}_${Date.now()}${isVideo ? '.mp4' : '.png'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

window.prepareAd = (platform) => {
    if (typeof window.realCopies === 'undefined' || !window.realCopies[platform]) {
        if (typeof window.generateIdea === 'function') {
            window.generateIdea(platform);
            setTimeout(() => window.prepareAd(platform), 200);
        } else {
            alert("El sistema de marketing aún está cargando...");
        }
        return;
    }
    const textToCopy = window.realCopies[platform];
    window.downloadMedia(platform);
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(textToCopy).then(() => showVisualAlert("Copiado y Descargado")).catch(() => fallbackCopy(textToCopy));
    } else {
        fallbackCopy(textToCopy);
    }
}

function fallbackCopy(text) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
    showVisualAlert("Copiado y Descargado (Legacy)");
}

const loginBtn = document.getElementById('login-btn')
const adminEmailInput = document.getElementById('admin-email')
const adminPassInput = document.getElementById('admin-pass')
const loginErrorMsg = document.getElementById('login-error-msg')
const logoutBtn = document.getElementById('logout-btn')
const exportBtn = document.getElementById('export-btn')
const copySheetsBtn = document.getElementById('copy-sheets-btn');
const printPdfBtn = document.getElementById('print-pdf-btn');
const archiveBody = document.getElementById('archive-body')

// CRM Table Bodies
const bodies = {
    'Nuevo': document.getElementById('body-nuevos'),
    'Contactado': document.getElementById('body-seguimiento'),
    'Cita': document.getElementById('body-seguimiento'),
    'Cotización en Proceso': document.getElementById('body-seguimiento'),
    'Cotización Aprobada': document.getElementById('body-venta'),
    'Venta/Seguimiento': document.getElementById('body-venta'),
    'No Califica: Renta': document.getElementById('body-apartamento'),
    'No Califica: Apartamento': document.getElementById('body-apartamento'),
    'no_cualificado': document.getElementById('body-denegado'),
    'Denegado': document.getElementById('body-denegado')
}

// CRM Counts
const counts = {
    'Nuevo': document.getElementById('count-nuevos'),
    'Seguimiento': document.getElementById('count-seguimiento'),
    'Venta': document.getElementById('count-venta'),
    'Archivo': document.getElementById('count-archivo')
}

let allLeads = []
let leadsCache = []
let currentFilter = 'all'
let currentAdFilter = 'all'
let isFirstLoad = true
let currentUser = null; // Client config object
let activeContext = 'all'; // For master to switch views
let currentAICommLead = null; // Para el modal de comunicación IA
const LANDING_URL = window.location.origin;
window.realCopies = { fb: '', tiktok: '' };

let chartInstances = { products: null, status: null };

// Audio para Alertas (Campana profesional)
const notificationSound = new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3');

// Mobile Sidebar Toggle
const menuToggleBtn = document.getElementById('menu-toggle-btn');
const sidebar = document.querySelector('.sidebar');

if (menuToggleBtn && sidebar) {
    menuToggleBtn.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Close sidebar when clicking a link on mobile
    document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
        item.addEventListener('click', () => {
            if (window.innerWidth <= 1024) {
                sidebar.classList.remove('open');
            }
        });
    });

    // Close sidebar when clicking outside on mobile
    document.addEventListener('click', (e) => {
        if (window.innerWidth <= 1024 && 
            !sidebar.contains(e.target) && 
            !menuToggleBtn.contains(e.target) && 
            sidebar.classList.contains('open')) {
            sidebar.classList.remove('open');
        }
    });
}

// --- CRM Logic ---
let unsubLeads = null;

function loadLeads() {
    if (unsubLeads) unsubLeads();
    const q = query(collection(db, 'leads'), orderBy('createdAt', 'desc'))
    unsubLeads = onSnapshot(q, (snapshot) => {
        leadsCache = [];
        let hasNewLead = false;

        snapshot.docChanges().forEach((change) => {
            if (change.type === "added" && !isFirstLoad) {
                const data = change.doc.data();
                if (data.status === 'Nuevo') {
                    hasNewLead = true;
                    showVisualAlert(`${data.name} acaba de entrar.`, "¡Nuevo Lead!");
                }
            }
        });

        if (hasNewLead) {
            // Only play sound if the lead matches current context
            const lastLead = leadsCache[0];
            if (shouldShowLead(lastLead)) {
                notificationSound.play().catch(e => console.log("Interacción requerida para sonido"));
            }
        }

        snapshot.forEach(docSnap => leadsCache.push({ id: docSnap.id, ...docSnap.data() }));
        renderLeads();
        renderStats(); // Update stats whenever leads change
        isFirstLoad = false;
    })
}

function renderStats() {
    const section = document.getElementById('stats-section');
    if (!section || !section.classList.contains('active')) return;

    const filterVal = document.getElementById('stats-filter')?.value || 'all';
    
    // Filter the cache based on Context AND Filter
    let filteredLeads = leadsCache.filter(l => shouldShowLead(l));
    
    if (filterVal !== 'all') {
        filteredLeads = filteredLeads.filter(l => {
            if (filterVal === 'direct') return l.source === 'direct' || !l.source || l.type === 'Lead Solar';
            if (filterVal === 'hh-integral') return l.source === 'hh-integral' || l.type === 'Lead H&H' || l.type === 'Lead Salud Integral';
            if (filterVal === 'rainbow-pr') return l.source === 'rainbow-pr' || l.type === 'Lead Rainbow';
            if (filterVal === 'zendure-pr') return l.source === 'zendure-pr' || l.type === 'Lead Zendure';
            return l.source === filterVal;
        });
    }

    const totalLeads = filteredLeads.length;
    
    // KPI 1: Total
    document.getElementById('stat-total').innerText = totalLeads;

    // KPI 2: Conversión (Venta/Seguimiento)
    const ventas = filteredLeads.filter(l => l.status === 'Venta/Seguimiento' || l.status === 'Cotización Aprobada').length;
    const conversion = totalLeads > 0 ? ((ventas / totalLeads) * 100).toFixed(1) : 0;
    document.getElementById('stat-conv').innerText = `${conversion}%`;

    // Data for Charts
    const productCounts = { 'Solar': 0, 'Bienestar': 0, 'Rainbow': 0, 'Zendure': 0 };
    const statusCounts = { 'Nuevo': 0, 'Seguimiento': 0, 'Venta': 0, 'Otros': 0 };

    filteredLeads.forEach(l => {
        // Product Distribution
        if (l.source === 'direct' || !l.source) productCounts['Solar']++;
        else if (l.source === 'hh-integral') productCounts['Bienestar']++;
        else if (l.source === 'rainbow-pr') productCounts['Rainbow']++;
        else if (l.source === 'zendure-pr') productCounts['Zendure']++;

        // Status Funnel
        if (l.status === 'Nuevo') statusCounts['Nuevo']++;
        else if (l.status === 'Contactado' || l.status === 'Cita' || l.status === 'Cotización en Proceso') statusCounts['Seguimiento']++;
        else if (l.status === 'Venta/Seguimiento' || l.status === 'Cotización Aprobada') statusCounts['Venta']++;
        else statusCounts['Otros']++;
    });

    // KPI 3: Top Segment / Status
    const labelEl = document.getElementById('stat-top-label');
    if (filterVal === 'all') {
        if (labelEl) labelEl.innerText = 'Segmento Top';
        const topSegment = Object.keys(productCounts).reduce((a, b) => productCounts[a] > productCounts[b] ? a : b);
        document.getElementById('stat-top').innerText = topSegment;
    } else {
        if (labelEl) labelEl.innerText = 'Estado Dominante';
        const topStatus = Object.keys(statusCounts).reduce((a, b) => statusCounts[a] > statusCounts[b] ? a : b);
        document.getElementById('stat-top').innerText = topStatus;
    }

    // Chart: Products (Doughnut)
    const ctxProd = document.getElementById('chart-products')?.getContext('2d');
    if (ctxProd) {
        if (chartInstances.products) chartInstances.products.destroy();
        chartInstances.products = new Chart(ctxProd, {
            type: 'doughnut',
            data: {
                labels: Object.keys(productCounts),
                datasets: [{
                    data: Object.values(productCounts),
                    backgroundColor: ['#d4af37', '#00e5ff', '#3498db', '#2ecc71'],
                    borderWidth: 0
                }]
            },
            options: { plugins: { legend: { position: 'bottom', labels: { color: '#888' } } } }
        });
    }

    // Chart: Status (Bar)
    const ctxStatus = document.getElementById('chart-status')?.getContext('2d');
    if (ctxStatus) {
        if (chartInstances.status) chartInstances.status.destroy();
        chartInstances.status = new Chart(ctxStatus, {
            type: 'bar',
            data: {
                labels: Object.keys(statusCounts),
                datasets: [{
                    label: 'Cantidad',
                    data: Object.values(statusCounts),
                    backgroundColor: 'rgba(212, 175, 55, 0.2)',
                    borderColor: '#d4af37',
                    borderWidth: 2,
                    borderRadius: 8
                }]
            },
            options: { 
                scales: { 
                    y: { beginAtZero: true, grid: { color: '#222' }, ticks: { color: '#888' } },
                    x: { grid: { display: false }, ticks: { color: '#888' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    }
}

document.getElementById('stats-filter')?.addEventListener('change', renderStats);

function renderLeads() {
    // Clear all bodies
    Object.values(bodies).forEach(b => { if(b) b.innerHTML = '' })
    let countMap = { 'Nuevo': 0, 'Seguimiento': 0, 'Venta': 0, 'Archivo': 0 }
    allLeads = []; // For export
    window.leadDataCache = window.leadDataCache || {};

    leadsCache.forEach((data) => {
        const id = data.id;
        const status = data.status || 'Nuevo';
        window.leadDataCache[id] = data;
        
        // Context Check
        if (!shouldShowLead(data)) return;

        // Segment Filter
        if (currentFilter !== 'all') {
            let isMatch = false;
            if (currentFilter === 'direct') {
                isMatch = (data.source === 'direct' || !data.source || data.type === 'Lead Solar' || data.service === 'solar');
            } else if (currentFilter === 'hh-integral') {
                isMatch = (data.source === 'hh-integral' || data.type === 'Lead H&H' || data.type === 'Lead Salud Integral' || data.service === 'h&h' || data.service === 'agua_hh');
            } else if (currentFilter === 'rainbow-pr') {
                isMatch = (data.source === 'rainbow-pr' || data.type === 'Lead Rainbow' || data.service === 'rainbow');
            } else if (currentFilter === 'zendure-pr') {
                isMatch = (data.source === 'zendure-pr' || data.type === 'Lead Zendure' || data.service === 'zendure');
            }

            if (!isMatch) return;
        }

        allLeads.push(data);
        
        function calculateLeadScore(lead) {
            const credit = lead.credit || '';

            // Lógica principal: Calidad basada en crédito
            // Hot = 750+, Warm = 651-749, Cold = Menos de 650
            if (credit === '750+' || credit === '700+') {
                return { label: '🔥 Hot', class: 'score-hot' };
            }
            if (credit === '651-749') {
                return { label: '☀️ Warm', class: 'score-warm' };
            }
            if (credit === 'Menos de 650' || credit === 'Afectado') {
                return { label: '❄️ Cold', class: 'score-cold' };
            }

            // Fallback para leads sin datos de crédito (HH, Rainbow, etc.)
            const isOwner = lead.isOwner || lead.dueno || lead.homeStatus;
            if (isOwner === 'si' || isOwner === 'Sí' || isOwner === 'Dueño') {
                return { label: '☀️ Warm', class: 'score-warm' };
            }
            return { label: '❄️ Cold', class: 'score-cold' };
        }

        function getDetails(data) {
            let details = [];
            if (data.email) details.push(`✉️ ${data.email}`);
            if (data.direccion) details.push(`📍 ${data.direccion}`);
            if (data.prioridad) details.push(`🎯 ${data.prioridad}`);
            if (data.roofType) details.push(`🏠 ${data.roofType}`);
            if (data.propertyType) details.push(`🏢 ${data.propertyType}`);
            if (data.credit) details.push(`💳 ${data.credit}`);
            if (data.battery) details.push(`🔋 Bat: ${data.battery}`);
            if (data.hasAlergias) details.push(`⚠️ ${data.hasAlergias}`);
            if (data.equipos) details.push(`🔌 ${data.equipos}`);
            if (data.horasRespaldo) details.push(`🔋 ${data.horasRespaldo}h`);
            if (data.hasPets === 'si') details.push(`🐾 Mascotas`);
            if (data.isOwner === 'no' || data.isOwner === 'No') details.push(`🏠 Renta`);
            if (data.recordingUrl) details.push(`🎧 <a href="${data.recordingUrl}" target="_blank" style="color:#10b981; text-decoration:underline; font-weight:bold;">Escuchar Audio</a>`);
            if (data.transcript) details.push(`<span onclick="window.openTranscriptModal('${data.id}')" style="cursor:pointer; background:rgba(0,210,255,0.15); color:#00e5ff; padding:4px 10px; border-radius:8px; border:1px solid rgba(0,210,255,0.4); font-weight:700; display:inline-flex; align-items:center; gap:6px;">📜 Ver Transcripción</span>`);
            if (data.appointment) {
                details.push(`<span style="background:rgba(139,92,246,0.2); color:#c084fc; padding:4px 8px; border-radius:6px; font-weight:700; border:1px solid rgba(139,92,246,0.4); display:inline-block; margin-bottom:4px;">📅 Cita Agendada: ${data.appointment.date} a las ${data.appointment.time} (${data.appointment.assignedTo || 'Angel'})</span>`);
            }
            if (data.notes) details.push(`🗣️ <span title="${data.notes.replace(/"/g, '&quot;')}" style="color:#d4af37;">${data.notes.substring(0, 50)}${data.notes.length > 50 ? '...' : ''}</span>`);
            return details.length > 0 ? details.join(' | ') : '<span style="opacity:0.3">-</span>';
        }

        const tr = document.createElement('tr')
        tr.style.borderBottom = "1px solid #1a1a1a";
        tr.style.transition = "background 0.2s";
        if (status === 'no_cualificado') {
            tr.classList.add('bg-red-500/10', 'border-red-500/30');
        }
        let sourceLabel = data.source || 'Directo';
        if (data.service) {
            const sName = data.service.toUpperCase();
            const iconMap = { 'SOLAR': '☀️', 'ZENDURE': '🔋', 'RAINBOW': '💧', 'H&H': '🏠', 'AGUA_HH': '🏠' };
            sourceLabel = `🎙️ Voz IA • ${iconMap[sName] || ''} ${sName === 'AGUA_HH' ? 'H&H' : sName}`;
        } else if (data.source === 'cuestionario-web') {
            const typeLabel = (data.type || '').replace('Lead ', '');
            sourceLabel = `Web • ${typeLabel}`;
        }

        const scoreData = calculateLeadScore(data);
        tr.innerHTML = `
            <td><span class="score-badge ${scoreData.class}">${scoreData.label}</span></td>
            <td>
                <strong>${data.name}</strong><br>
                <small style="color:#555;">${sourceLabel}</small>
                ${data.razon_descarte ? `<br><span class="badge-descarte">${data.razon_descarte}</span>` : ''}
            </td>
            ${status === 'Nuevo' ? `<td><small>${data.municipio || '-'}</small></td>` : ''}
            <td>
                <div style="display:flex; gap:0.4rem; align-items:center;">
                    <a href="tel:${data.phone ? data.phone.replace(/\D/g, '') : ''}" class="btn-action-sm" style="background:#10b981; color:#fff; padding:4px 8px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Llamar por teléfono">📞 Llamar</a>
                    <button class="btn-vapi-call" data-id="${id}" style="background:linear-gradient(135deg, #00e5ff, #3498db); color:#000; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:800; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Llamada Automática IA (Vapi)">🤖 Bot IA</button>
                    <a href="https://wa.me/${data.phone?.replace(/\D/g,'')}?text=${encodeURIComponent(`Hola ${data.name}, le asiste Angel Curbelo de TuPlanta.com. Recibí su solicitud y me gustaría orientarle brevemente...`)}" target="_blank" class="btn-action-sm" style="background:#25d366; color:#000; padding:4px 8px; border-radius:6px; text-decoration:none; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Enviar WhatsApp directo">📱 WA</a>
                    <button class="btn-email-lead" data-id="${id}" style="background:#3b82f6; color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:600; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Enviar Correo Electrónico">✉️ Email</button>
                    <button class="btn-agendar-cita" data-id="${id}" style="background:linear-gradient(135deg, #8b5cf6, #6366f1); color:#fff; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Agendar Cita en Calendario">📅 Cita</button>
                    <button class="btn-ai-comm" data-id="${id}" style="background:linear-gradient(135deg, #d4af37, #f3e5ab); color:#000; border:none; padding:4px 8px; border-radius:6px; cursor:pointer; font-weight:700; display:inline-flex; align-items:center; gap:4px; font-size:0.75rem;" title="Redactar mensaje personalizado con IA">✨ IA</button>
                </div>
            </td>
            <td><small>${getDetails(data)}</small></td>
            <td>
                <select class="status-select" data-id="${id}">
                    <option value="Nuevo" ${status === 'Nuevo' ? 'selected' : ''}>Nuevo</option>
                    <option value="Contactado" ${status === 'Contactado' ? 'selected' : ''}>Contactado</option>
                    <option value="Cita" ${status === 'Cita' ? 'selected' : ''}>Cita</option>
                    <option value="Cotización en Proceso" ${status === 'Cotización en Proceso' ? 'selected' : ''}>Cotización en Proceso</option>
                    <option value="Cotización Aprobada" ${status === 'Cotización Aprobada' ? 'selected' : ''}>Cotización Aprobada</option>
                    <option value="Venta/Seguimiento" ${status === 'Venta/Seguimiento' ? 'selected' : ''}>Venta/Seguimiento</option>
                    <option value="Denegado" ${status === 'Denegado' ? 'selected' : ''}>Denegado</option>
                    <option value="no_cualificado" ${status === 'no_cualificado' ? 'selected' : ''}>No Cualificado</option>
                    <option value="No Califica: Renta" ${status === 'No Califica: Renta' ? 'selected' : ''}>No Califica: Renta</option>
                    <option value="No Califica: Apartamento" ${status === 'No Califica: Apartamento' ? 'selected' : ''}>No Califica: Apartamento</option>
                </select>
            </td>
            <td><button class="btn-delete-lead" data-id="${id}">🗑️</button></td>
        `

        if (status === 'Nuevo') { bodies['Nuevo'].appendChild(tr); countMap['Nuevo']++ }
        else if (status === 'Contactado' || status === 'Cita' || status === 'Cotización en Proceso') { bodies[status].appendChild(tr); countMap['Seguimiento']++ }
        else if (status === 'Venta/Seguimiento' || status === 'Cotización Aprobada') { bodies[status].appendChild(tr); countMap['Venta']++ }
        else {
            // All other status go to Archive bodies
            if (bodies[status]) bodies[status].appendChild(tr);
            else if (bodies['Denegado']) bodies['Denegado'].appendChild(tr);
            countMap['Archivo']++;
        }
    });

    Object.keys(countMap).forEach(key => { if (counts[key]) counts[key].innerText = countMap[key] });

    document.querySelectorAll('.status-select').forEach(s => s.addEventListener('change', async (e) => {
        await updateDoc(doc(db, 'leads', e.target.getAttribute('data-id')), { status: e.target.value })
    }));
    document.querySelectorAll('.btn-delete-lead').forEach(b => b.addEventListener('click', async () => {
        if(confirm('¿Eliminar prospecto?')) await deleteDoc(doc(db, 'leads', b.getAttribute('data-id')))
    }));
    document.querySelectorAll('.btn-email-lead').forEach(b => b.addEventListener('click', async () => {
        const id = b.getAttribute('data-id');
        const lead = leadsCache.find(l => l.id === id);
        if (!lead) return;
        let email = lead.email || '';
        if (!email) {
            email = prompt(`Ingrese el correo electrónico para ${lead.name}:`, '');
            if (!email || !email.trim()) return;
            email = email.trim();
            lead.email = email;
            if (window.leadDataCache && window.leadDataCache[id]) window.leadDataCache[id].email = email;
            try {
                await updateDoc(doc(db, 'leads', id), { email: email });
            } catch (err) {
                console.error("Error guardando email en Firebase:", err);
            }
        }
        const srv = lead.service ? lead.service.toUpperCase() : 'SOLAR';
        const srvName = srv === 'SOLAR' ? 'Energía Solar' : srv === 'ZENDURE' ? 'Baterías Zendure' : srv === 'RAINBOW' ? 'Sistema Rainbow' : 'Filtros de Agua H&H';
        const subject = encodeURIComponent(`Orientación sobre ${srvName} - Angel Curbelo Sales`);
        const body = encodeURIComponent(`Hola ${lead.name},\n\nGracias por su interés en ${srvName}. Me comunico con el fin de ofrecerle información detallada y responder sus dudas para coordinar una orientación personalizada.\n\nAtentamente,\nAngel Curbelo\nTuPlanta.com`);
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    }));
    document.querySelectorAll('.btn-ai-comm').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = leadsCache.find(l => l.id === id);
        if (!lead) return;
        openAICommModal(lead);
    }));
    document.querySelectorAll('.btn-agendar-cita').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = leadsCache.find(l => l.id === id);
        if (!lead) return;
        openAppointmentModal(lead);
    }));
    document.querySelectorAll('.btn-vapi-call').forEach(b => b.addEventListener('click', () => {
        const id = b.getAttribute('data-id');
        const lead = leadsCache.find(l => l.id === id);
        if (!lead) return;
        initiateVapiCallForLead(lead, b);
    }));
}

async function initiateVapiCallForLead(lead, btnEl = null) {
    const phone = lead.phone ? lead.phone.replace(/\D/g, '') : '';
    if (!phone) {
        alert("El prospecto no tiene un número de teléfono válido registrado.");
        return;
    }

    const originalText = btnEl ? btnEl.innerHTML : '';
    if (btnEl) {
        btnEl.disabled = true;
        btnEl.innerHTML = '⏳ Conectando...';
    }

    showVisualAlert(`Iniciando llamada de IA para ${lead.name}...`, "📞 Conectando Bot Vapi");

    try {
        const vapiCallFn = httpsCallable(functions, 'initiateOutboundVapiCall');
        const res = await vapiCallFn({
            leadId: lead.id,
            phone: phone,
            name: lead.name || 'Cliente',
            service: lead.service || 'solar'
        });

        if (res.data?.error) {
            alert(`Error al iniciar llamada IA: ${res.data.error}`);
            if (btnEl) btnEl.innerHTML = '❌ Fallo';
        } else {
            showVisualAlert(`¡Llamada saliente iniciada con éxito! Vapi está marcando a ${lead.name}.`, "✅ Llamada IA en Curso");
            if (btnEl) {
                btnEl.innerHTML = '✅ Llamando';
                btnEl.style.background = '#2ecc71';
            }
        }
    } catch (err) {
        console.error("Error Vapi Call:", err);
        alert(`Error de red al conectar con servidor: ${err.message}`);
        if (btnEl) btnEl.innerHTML = '❌ Error';
    } finally {
        if (btnEl) {
            setTimeout(() => {
                btnEl.disabled = false;
                if (btnEl.innerHTML.includes('Fallo') || btnEl.innerHTML.includes('Error')) {
                    btnEl.innerHTML = originalText;
                }
            }, 3000);
        }
    }
}


function showVisualAlert(msg, title = "Notificación") {
    const alertBox = document.createElement('div');
    alertBox.style = "position:fixed; top:20px; right:20px; background:var(--primary); color:white; padding:15px 25px; border-radius:10px; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.5); animation: slideIn 0.5s ease-out;";
    alertBox.innerHTML = `<strong>🔥 ${title}</strong><br>${msg}`;
    document.body.appendChild(alertBox);
    setTimeout(() => { alertBox.style.animation = "slideOut 0.5s ease-in"; setTimeout(() => alertBox.remove(), 500); }, 5000);
}

// Auth & Nav Logic
function showLoginError(msg) {
    if (loginErrorMsg) {
        loginErrorMsg.innerText = msg;
        loginErrorMsg.style.display = 'block';
    } else {
        alert(msg);
    }
}

function hideLoginError() {
    if (loginErrorMsg) {
        loginErrorMsg.style.display = 'none';
        loginErrorMsg.innerText = '';
    }
}

loginBtn?.addEventListener('click', async () => {
    const email = adminEmailInput?.value.trim();
    const password = adminPassInput?.value;
    
    if (!email || !password) {
        showLoginError("Por favor ingresa tu correo y contraseña.");
        return;
    }
    
    hideLoginError();
    loginBtn.disabled = true;
    loginBtn.innerText = "Iniciando sesión...";
    
    try {
        await signInWithEmailAndPassword(auth, email, password);
    } catch (error) {
        console.error("Login error:", error);
        loginBtn.disabled = false;
        loginBtn.innerText = "Entrar al Sistema";
        
        let friendlyMsg = "Error al iniciar sesión. Inténtalo de nuevo.";
        if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found' || error.code === 'auth/invalid-credential') {
            friendlyMsg = "Correo o contraseña incorrectos. Por favor, verifica tus datos.";
        } else if (error.code === 'auth/invalid-email') {
            friendlyMsg = "El formato del correo electrónico no es válido.";
        } else if (error.code === 'auth/user-disabled') {
            friendlyMsg = "Esta cuenta de usuario ha sido desactivada.";
        } else if (error.code === 'auth/too-many-requests') {
            friendlyMsg = "Demasiados intentos fallidos. Por favor, inténtalo más tarde.";
        }
        showLoginError(friendlyMsg);
    }
});

logoutBtn?.addEventListener('click', async () => {
    try {
        await signOut(auth);
    } catch (error) {
        console.error("SignOut error:", error);
        alert("Error al cerrar sesión: " + error.message);
    }
});
document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
    item.addEventListener('click', () => {
        const sectionId = item.getAttribute('data-section');
        const filter = item.getAttribute('data-filter');
        const adFilter = item.getAttribute('data-filter-ad');

        // Toggle Expand for Groups
        const group = item.closest('.nav-group');
        if (group && item.classList.contains('nav-item')) {
            group.classList.toggle('expanded');
        } else if (group && item.classList.contains('nav-sub-item')) {
            group.classList.add('expanded');
        }

        // Update Hash
        if (sectionId === 'leads-section') {
            if (filter === 'direct') window.location.hash = 'leads-solar';
            else if (filter === 'hh-integral') window.location.hash = 'leads-bienestar';
            else if (filter === 'rainbow-pr') window.location.hash = 'leads-rainbow';
            else if (filter === 'zendure-pr') window.location.hash = 'leads-zendure';
            else window.location.hash = 'leads-global';
        } else if (sectionId === 'marketing-section') {
            if (adFilter === 'direct') window.location.hash = 'creativos-solar';
            else if (adFilter === 'hh-integral') window.location.hash = 'creativos-bienestar';
            else if (adFilter === 'rainbow-pr') window.location.hash = 'creativos-rainbow';
            else if (adFilter === 'zendure-pr') window.location.hash = 'creativos-zendure';
            else window.location.hash = 'creativos-global';
        } else if (sectionId === 'stats-section') {
            window.location.hash = 'estadisticas';
        } else if (sectionId === 'archive-section') {
            window.location.hash = 'archivo';
        } else if (sectionId === 'manual-entry-section') {
            window.location.hash = 'entrada-manual';
        } else if (sectionId === 'qr-section') {
            window.location.hash = 'qr';
        }

        // UI handling is now handled by syncWithHash via hashchange event
    });
});

function showPanel() { 
    loginScreen.style.display = 'none'; 
    adminPanel.style.display = 'flex'; 
    
    // Apply UI restrictions based on user role
    applyRoleUI();
    
    loadLeads(); 
    loadArchive(); 
    initQRCode();
    syncWithHash(); 
    checkAIBudget();
}

function applyRoleUI() {
    if (!currentUser) return;

    // Show/Hide sections
    const navItems = document.querySelectorAll('.nav-item, .nav-group');
    navItems.forEach(item => {
        const section = item.getAttribute('data-section');
        if (section && !currentUser.sections.includes(section.replace('-section', ''))) {
            item.style.display = 'none';
        }
    });

    // Add Context Switcher for Master
    if (currentUser.role === 'master') {
        renderContextSwitcher();
    }
}

function renderContextSwitcher() {
    let switcher = document.getElementById('context-switcher');
    if (!switcher) {
        switcher = document.createElement('div');
        switcher.id = 'context-switcher';
        switcher.style = "margin-bottom: 2rem; padding: 1rem; background: rgba(212, 175, 55, 0.05); border-radius: 12px; border: 1px solid #d4af3722;";
        
        const label = document.createElement('small');
        label.style = "display: block; color: #d4af37; font-size: 0.6rem; text-transform: uppercase; margin-bottom: 10px; font-weight: 800; letter-spacing: 1px;";
        label.innerText = "Vista de Control";
        
        const select = document.createElement('select');
        select.className = "status-select";
        select.style.width = "100%";
        
        let options = `<option value="all">🌐 Vista Global (Angel)</option>`;
        Object.values(CLIENTS).forEach(c => {
            if (c.role !== 'master') {
                options += `<option value="${c.id}">👤 ${c.name}</option>`;
            }
        });
        
        select.innerHTML = options;
        select.addEventListener('change', (e) => {
            activeContext = e.target.value;
            renderLeads();
            renderStats();
            showVisualAlert(`Cambiando vista a: ${e.target.options[e.target.selectedIndex].text}`, "Contexto Actualizado");
        });
        
        switcher.appendChild(label);
        switcher.appendChild(select);
        
        const sidebar = document.querySelector('nav');
        sidebar.prepend(switcher);
    }
}

function shouldShowLead(lead) {
    if (!currentUser) return false;
    
    // Master Global view always sees everything
    if (currentUser.role === 'master' && activeContext === 'all') return true;

    // Determine target context ID
    const contextId = currentUser.role === 'master' ? activeContext : currentUser.id;
    
    if (contextId === 'all') return true;
    
    // Strict Check: If lead has a clientId, it MUST match contextId
    if (lead.clientId) {
        return lead.clientId === contextId;
    }

    // Fallback for older leads or leads from un-tagged sources:
    const contextConfig = CLIENTS[contextId];
    if (!contextConfig) return false;

    if (contextConfig.allowedSources === 'all') return true;
    if (Array.isArray(contextConfig.allowedSources)) {
        return contextConfig.allowedSources.includes(lead.source);
    }
    
    return false;
}

// --- Marketing Content ---
const adContent = {
    'direct': {
        fb: [
            { hook: "¿Cansado de que se vaya la luz justo cuando más la necesitas?", body: "Protege a tu familia con SolarFlow Pro. Sistema de respaldo inteligente que se activa al instante. Califica hoy mismo." },
            { hook: "Tu factura de luz no tiene por qué ser un dolor de cabeza mensual.", body: "Cámbiate al sol y recupera tu independencia. Proyectos llave en mano con financiamiento disponible." },
            { hook: "¿Subió la luz otra vez? 📉 No dejes que el costo de vida controle tu presupuesto.", body: "Con nuestros sistemas solares premium, tú eres el dueño de tu energía. Instalación garantizada y soporte 24/7." }
        ],
        tiktok: [
            { hook: "POV: Mi vecino paga $400 de luz y yo pago $5... 💸", body: "¿Quieres saber el secreto? Dale clic al link abajo para ver si tu casa califica en menos de 1 minuto." },
            { hook: "POV: Se fue la luz en todo el barrio menos en tu casa. 😎", body: "La tranquilidad de tener un sistema de respaldo confiable no tiene precio. Califica para incentivos hoy." }
        ]
    },
    'hh-integral': {
        fb: [
            { hook: "¿Cansado de lidiar con los efectos dañinos del agua dura? 🚿", body: "H&H Distributors presenta el suavizador 'Triple Treated Water'. Remueve hierro, cloro y químicos ahorrando hasta un 24% de energía y 50% en detergentes. Llama a Angel Curbelo 787-344-4658 para orientación GRATIS." },
            { hook: "Seguir comprando botellas no es sostenible… ni para tu bolsillo, ni para tu salud. ❌", body: "Water Tree: Agua purificada y alcalina en tu hogar. Sin microplásticos, sin cargar cajas pesadas y con garantía de por vida. Contacta a Angel Curbelo 787-344-4658. ¡Instalación GRATIS hoy!" },
            { hook: "La mayoría del agua que consumimos es ácida y llena de contaminantes... 🧪", body: "Balancea tu pH y mejora tu digestión con Water Tree. Conviertes cada vaso en bienestar real para tu familia. Angel Curbelo 787-344-4658 para una demostración sin compromiso." }
        ],
        tiktok: [
            { hook: "POV: Dejas de cargar botellones de agua para siempre. 💧", body: "Ahorra dinero y cuida tu salud con purificación alcalina en casa. Angel Curbelo 787-344-4658. Instalación gratis." },
            { hook: "El secreto para una piel y cabello más saludable está en tu ducha. 🚿", body: "Nuestro suavizador remueve el 99% de los químicos del agua dura. Angel Curbelo 787-344-4658. Mira la diferencia." },
            { hook: "POV: Tu agua sabe a manantial pero sale de tu pluma. ✨", body: "Tecnología Water Tree: pH balanceado y 5 beneficios clave para tu salud. Angel Curbelo 787-344-4658. ¡Pide tu demo!" }
        ]
    },
    'rainbow-pr': {
        fb: [
            { hook: "Elimina el polvo y los alérgenos de raíz con el poder del agua.", body: "Rainbow utiliza el poder del agua para lavar el aire de tu hogar. Ideal para familias con asma o alergias. ¡Pide tu demo!" },
            { hook: "Si tu aspiradora huele a polvo, no está limpiando realmente. 🤮", body: "La tecnología de Rainbow atrapa la suciedad en agua, devolviendo aire fresco y lavado a tu hogar." },
            { hook: "El polvo no se barre, se atrapa en agua. 💧", body: "Descubre por qué Rainbow es la única certificada por la Fundación de Asma y Alergias. Limpieza profunda que se siente." }
        ],
        tiktok: [
            { hook: "POV: Ves lo que sale de tu colchón... 😱", body: "No vas a creer lo que tu aspiradora normal está dejando atrás. Solicita tu demo gratis ahora." },
            { hook: "Dile adiós a los ácaros y al polvo persistente. 🕷️", body: "La tecnología de Rainbow es la única certificada para mejorar la salud respiratoria. Mira el cambio." },
            { hook: "Lava el aire de tu casa mientras limpias. 🧼", body: "Rainbow purifica el ambiente mientras eliminas la suciedad más difícil. ¡Es magia tecnológica!" }
        ]
    },
    'zendure-pr': {
        fb: [
            { hook: "Prepárate para la temporada de huracanes con Zendure. 🔋", body: "Baterías inteligentes Plug & Play. Sin instalaciones costosas, energía segura para tus enseres críticos." },
            { hook: "Energía de respaldo para apartamentos y hogares. 🏠", body: "Sin ruido, sin gasolina, solo energía limpia y potente. Perfecta para neveras y equipos médicos." },
            { hook: "La batería más rápida del mercado está en PR. ⚡", body: "Zendure SuperBase V se carga en tiempo récord y te da la seguridad que Luma no te ofrece. ¡Prepárate hoy!" }
        ],
        tiktok: [
            { hook: "Se fue la luz... ¿y qué? 🔋", body: "Con Zendure mi nevera y mi internet nunca se apagan. Portátil, potente y sin ruidos." },
            { hook: "No te quedes a oscuras en el próximo apagón. 🔦", body: "Baterías de litio de larga duración con carga ultra rápida. Conecta tus equipos críticos ahora." },
            { hook: "Independencia energética para los que viven en apartamento. 🔋", body: "Zendure es la solución de respaldo silenciosa y potente. Sin ruido, sin humo, pura energía." }
        ]
    }
}

// --- Hash Navigation Logic ---
function syncWithHash() {
    let hash = window.location.hash.substring(1);
    if (!hash) hash = 'leads-global'; 

    // Map common hashes to sections/filters
    const hashMaps = {
        'leads-global': { section: 'leads-section', filter: 'all' },
        'leads-solar': { section: 'leads-section', filter: 'direct' },
        'leads-bienestar': { section: 'leads-section', filter: 'hh-integral' },
        'leads-hh': { section: 'leads-section', filter: 'hh-integral' },
        'leads-rainbow': { section: 'leads-section', filter: 'rainbow-pr' },
        'leads-zendure': { section: 'leads-section', filter: 'zendure-pr' },
        'creativos-global': { section: 'marketing-section', adFilter: 'all' },
        'creativos-solar': { section: 'marketing-section', adFilter: 'direct' },
        'creativos-direct': { section: 'marketing-section', adFilter: 'direct' },
        'creativos-bienestar': { section: 'marketing-section', adFilter: 'hh-integral' },
        'creativos-hh': { section: 'marketing-section', adFilter: 'hh-integral' },
        'creativos-rainbow': { section: 'marketing-section', adFilter: 'rainbow-pr' },
        'creativos-zendure': { section: 'marketing-section', adFilter: 'zendure-pr' },
        'academia-simulador': { section: 'simulator-section' },
        'academia-biblioteca': { section: 'library-section', libSub: 'lib-objeciones' },
        'academia-objeciones': { section: 'library-section', libSub: 'lib-objeciones' },
        'academia-dolores': { section: 'library-section', libSub: 'lib-dolores' },
        'academia-certificacion': { section: 'library-section', libSub: 'lib-certificacion' },
        'estadisticas': { section: 'stats-section' },
        'archivo': { section: 'archive-section' },
        'entrada-manual': { section: 'manual-entry-section' },
        'qr': { section: 'qr-section' },
        'codigo-qr': { section: 'qr-section' }
    };

    const config = hashMaps[hash];
    if (config) {
        // Activate Section
        document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
        document.getElementById(config.section).classList.add('active');
        if (config.section === 'qr-section') {
            initQRCode();
        }

        // Reset scroll to top so content always starts at the top
        const mainContent = document.querySelector('.main-content');
        if (mainContent) mainContent.scrollTop = 0;

        // Handle Library Sub-sections
        if (config.section === 'library-section') {
            document.querySelectorAll('.lib-sub-section').forEach(sub => sub.style.display = 'none');
            const subId = config.libSub || 'lib-objeciones';
            const subEl = document.getElementById(subId);
            if (subEl) subEl.style.display = 'block';
        }

        // Apply Filters
        if (config.section === 'stats-section') {
            renderStats();
        }
        if (config.filter) {
            currentFilter = config.filter;
            renderLeads();
        }
        if (config.adFilter) {
            currentAdFilter = config.adFilter;
            const segmentNames = { 'all': 'Global', 'direct': 'Solar', 'hh-integral': 'Bienestar (HH)', 'rainbow-pr': 'Rainbow', 'zendure-pr': 'Zendure' };
            const titleEl = document.getElementById('marketing-title');
            if (titleEl) titleEl.innerHTML = `Generador de Campañas <span style="color:var(--primary); font-size:1rem; margin-left:15px; opacity:0.7;">• ${segmentNames[currentAdFilter] || 'Segmento'}</span>`;
            
            // window.generateIdea('fb');
            // window.generateIdea('tiktok');
        }

        // Update Nav UI
        document.querySelectorAll('.nav-item, .nav-sub-item').forEach(item => {
            item.classList.remove('active');
            const itemFilter = item.getAttribute('data-filter');
            const itemAdFilter = item.getAttribute('data-filter-ad');
            const itemSection = item.getAttribute('data-section');

            let isActive = false;
            if (config.filter && itemFilter === config.filter && itemSection === config.section) isActive = true;
            else if (config.adFilter && itemAdFilter === config.adFilter && itemSection === config.section) isActive = true;
            else if (!config.filter && !config.adFilter && itemSection === config.section && !item.classList.contains('nav-sub-item')) isActive = true;

            if (isActive) item.classList.add('active');
        });

        // Expand/Collapse Sidebar Groups
        document.querySelectorAll('.nav-group').forEach(group => {
            const hasActiveChild = group.querySelector('.active');
            if (hasActiveChild) group.classList.add('expanded');
            else group.classList.remove('expanded');
        });
    }
}

window.addEventListener('hashchange', syncWithHash);

// Default to Solar if category not found
const getAdContent = (cat, platform) => {
    const category = adContent[cat] || adContent['direct'];
    return category[platform];
}

const imageBank = { 
    'direct': {
        fb: ['/ads/fb_1.png', '/ads/fb_2.png', '/ads/fb_3.png', '/ads/fb_4.png', '/ads/fb_5.png'],
        tiktok: ['/ads/tk_1.png', '/ads/tk_2.png', '/ads/tk_3.png']
    },
    'hh-integral': {
        fb: [
            '/ads/hh/hh_1.jpeg', '/ads/hh/hh_2.jpeg', '/ads/hh/hh_3.jpeg', '/ads/hh/hh_4.jpeg', '/ads/hh/hh_5.jpeg',
            '/ads/hh/hh_6.jpeg', '/ads/hh/hh_7.jpeg', '/ads/hh/hh_8.jpeg', '/ads/hh/hh_9.jpeg', '/ads/hh/hh_10.jpeg'
        ],
        tiktok: [
            '/ads/hh/hh_1.jpeg', '/ads/hh/hh_2.jpeg', '/ads/hh/hh_3.jpeg', '/ads/hh/hh_4.jpeg', '/ads/hh/hh_5.jpeg',
            '/ads/hh/hh_6.jpeg', '/ads/hh/hh_7.jpeg', '/ads/hh/hh_8.jpeg', '/ads/hh/hh_9.jpeg', '/ads/hh/hh_10.jpeg'
        ]
    },
    'rainbow-pr': {
        fb: ['/ads/fb_1.png'],
        tiktok: ['/ads/tk_1.png']
    },
    'zendure-pr': {
        fb: ['/ads/fb_1.png'],
        tiktok: ['/ads/tk_1.png']
    }
}

window.generateIdea = async (platform) => {
    const cat = currentAdFilter === 'all' ? 'direct' : currentAdFilter;
    const texts = getAdContent(cat, platform);
    
    // Pick image from specific category bank
    const categoryBank = imageBank[cat] || imageBank['direct'];
    const images = categoryBank[platform];
    
    const textIdea = texts[Math.floor(Math.random() * texts.length)];
    
    // Enlace específico por categoría para dirigir directamente a su respectivo cuestionario
    const linksMap = {
        'direct': 'https://angel-curbelo-sales-crm.web.app/cuestionario.html',
        'hh-integral': 'https://angel-curbelo-sales-crm.web.app/hh-distributors.html',
        'rainbow-pr': 'https://angel-curbelo-sales-crm.web.app/rainbow.html',
        'zendure-pr': 'https://angel-curbelo-sales-crm.web.app/zendure.html'
    };
    const link = linksMap[cat] || 'https://angel-curbelo-sales-crm.web.app/cuestionario.html';

    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);

    // Add visual feedback
    if (textEl) textEl.style.transition = 'opacity 0.2s';
    if (imgEl) imgEl.style.transition = 'opacity 0.2s';
    if (textEl) textEl.style.opacity = '0';
    if (imgEl) imgEl.style.opacity = '0.5';

    setTimeout(() => {
        const displayContent = `<strong>${textIdea.hook}</strong><br><br>${textIdea.body}<br><br>👉 <a href="${link}" target="_blank" style="color:#1877F2; font-weight:700; text-decoration:underline;">Saber Más</a>`;
        window.realCopies[platform] = `${textIdea.hook}\n\n${textIdea.body}\n\n👉 Info aquí: ${link}`;
        
        if (textEl) {
            textEl.innerHTML = platform === 'fb' ? displayContent : `<strong>${textIdea.hook}</strong> ${textIdea.body} #marketing #ventas`;
            textEl.style.opacity = '1';
        }
        if (imgEl) {
            imgEl.src = images[Math.floor(Math.random() * images.length)];
            imgEl.style.opacity = '1';
        }
    }, 200);
}

window.generateAIIdea = async (platform) => {
    const cat = currentAdFilter === 'all' ? 'direct' : currentAdFilter;
    const segmentNames = { 'direct': 'Energía Solar', 'hh-integral': 'H&H Integral', 'rainbow-pr': 'Aspiradoras Rainbow', 'zendure-pr': 'Baterías Zendure' };
    const segmentLabels = { 'direct': 'Energía Solar', 'hh-integral': 'H&H (Aqua Viva, Water Tree)', 'rainbow-pr': 'Rainbow', 'zendure-pr': 'Zendure' };
    const segmentName = segmentNames[cat] || 'Energía Solar';
    const segmentLabel = segmentLabels[cat] || 'Energía Solar';
    
    const userPrompt = window.prompt(`¿Sobre qué quieres el anuncio de ${segmentLabel}? (Ej: Promoción especial, Beneficios del producto, Oferta limitada)`);
    if (!userPrompt) return;
    
    // Enlace específico por categoría para dirigir directamente a su respectivo cuestionario
    const linksMap = {
        'direct': 'https://angel-curbelo-sales-crm.web.app/cuestionario.html',
        'hh-integral': 'https://angel-curbelo-sales-crm.web.app/hh-distributors.html',
        'rainbow-pr': 'https://angel-curbelo-sales-crm.web.app/rainbow.html',
        'zendure-pr': 'https://angel-curbelo-sales-crm.web.app/zendure.html'
    };
    const link = linksMap[cat] || 'https://angel-curbelo-sales-crm.web.app/cuestionario.html';
    
    // Enriquecer prompt con contexto de categoría y enlace
    const enrichedPrompt = `[Categoría: ${segmentName}] [Link: ${link}] ${userPrompt}`;
    
    showVisualAlert(`Generando contenido de ${segmentLabel} con IA...`, "Procesando");
    await useAI('text', enrichedPrompt, platform);
    await useAI('image', enrichedPrompt, platform);
}

async function useAI(type, prompt, platform) {
    const textEl = document.getElementById(`text-${platform}`);
    const imgEl = document.getElementById(`img-preview-${platform}`);
    
    if (textEl && type === 'text') {
        textEl.innerText = "✨ La IA está redactando tu anuncio...";
        textEl.classList.add('ai-pulse');
    }
    if (imgEl && type === 'image') {
        imgEl.classList.add('shimmer');
        imgEl.style.opacity = "0.5";
    }

    try {
        const generateAI = httpsCallable(functions, 'generateAIAsset');
        console.log(`📡 Llamando a IA (${type}) con prompt: "${prompt}"...`);
        const res = await generateAI({ prompt, type, clientId: currentUser ? currentUser.id : 'angel' });
        console.log(`🤖 IA Response (${type}):`, res.data);
        
        if (res.data.error) {
            console.error(`❌ Error en IA (${type}):`, res.data.error);
            alert(`Error en ${type}: ${res.data.error}`);
            if (textEl && type === 'text') {
                textEl.innerText = "Error al generar texto.";
                textEl.classList.remove('ai-pulse');
            }
            if (imgEl && type === 'image') {
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
            }
            return;
        }

        const result = res.data.result;

        if (type === 'text' && textEl) {
            console.log("✍️ Texto recibido con éxito");
            // Enmascarar URLs con texto amigable
            const linkified = result.replace(
                /(https?:\/\/[^\s]+)/g,
                '<a href="$1" target="_blank" style="color:#d4af37; font-weight:bold; text-decoration:underline; display:inline-block; margin-top:6px;">🔗 Cotiza Gratis Aquí</a>'
            );
            textEl.innerHTML = linkified;
            textEl.classList.remove('ai-pulse');
            window.realCopies[platform] = result;
        } else if (type === 'image' && imgEl) {
            console.log("🎨 Imagen recibida con éxito. URL:", result);
            imgEl.src = result;
            imgEl.onload = () => {
                console.log("✅ Imagen cargada visualmente");
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
            };
            imgEl.onerror = () => {
                console.error("❌ La URL de la imagen no es válida o está bloqueada por CORS:", result);
                imgEl.classList.remove('shimmer');
                imgEl.style.opacity = "1";
                // Añadir enlace de rescate al texto si la imagen falla
                if (textEl) {
                    textEl.innerHTML += `<br><br>🖼️ <a href="${result}" target="_blank" style="color:var(--primary); font-weight:bold; text-decoration:underline;">Ver Imagen Generada</a>`;
                }
            };
        }

        if (res.data.nearLimit) {
            const alertEl = document.getElementById('ai-budget-alert');
            if (alertEl) alertEl.style.display = 'block';
        }
    } catch (error) {
        console.error(`❌ Fallo crítico en llamada a IA (${type}):`, error);
        if (textEl) {
            textEl.innerText = "Error de conexión.";
            textEl.classList.remove('ai-pulse');
        }
        if (imgEl) imgEl.classList.remove('shimmer');
        alert(`Error de conexión (${type}): ${error.message}`);
    }
}

async function checkAIBudget() {
    if (!currentUser) return;
    try {
        const usageDoc = await getDoc(doc(db, "usage", "stats"));
        if (usageDoc.exists()) {
            const spent = usageDoc.data()[currentUser.id] || 0;
            if (spent >= 4.50) {
                const alertEl = document.getElementById('ai-budget-alert');
                if (alertEl) alertEl.style.display = 'block';
            }
        }
    } catch (e) { console.error("Budget check error:", e); }
}

// Branding Sync
document.getElementById('branding-name')?.addEventListener('input', (e) => {
    const val = e.target.value;
    document.querySelectorAll('.mock-name-display').forEach(el => el.innerText = val);
    document.querySelectorAll('.mock-name-display-handle').forEach(el => el.innerText = val.toLowerCase().replace(/\s+/g, ''));
});
document.querySelectorAll('.hidden-file').forEach(input => { input.addEventListener('change', (e) => { const platform = input.getAttribute('data-platform'); const file = e.target.files[0]; if (file) { const reader = new FileReader(); reader.onload = (event) => { document.getElementById(`img-preview-${platform}`).src = event.target.result }; reader.readAsDataURL(file) } }) })
document.querySelectorAll('.btn-save-archive').forEach(btn => { btn.addEventListener('click', async () => { const platform = btn.getAttribute('data-platform'); const platformKey = platform === 'Facebook' ? 'fb' : 'tiktok'; const imageUrl = document.getElementById(`img-preview-${platformKey}`).src; const contentToSave = realCopies[platformKey]; try { await addDoc(collection(db, 'ad_archive'), { platform, content: contentToSave, imageUrl, createdAt: new Date() }); alert('¡Anuncio guardado!') } catch (e) { alert('Error al guardar.') } }) })
let unsubArchive = null;
function loadArchive() {
    if (unsubArchive) unsubArchive();
    const q = query(collection(db, 'ad_archive'), orderBy('createdAt', 'desc')); 
    unsubArchive = onSnapshot(q, (snapshot) => {
        archiveBody.innerHTML = ''; snapshot.forEach(docSnap => {
            const data = docSnap.data(); const id = docSnap.id; const div = document.createElement('div'); div.className = 'archive-item card p-4'; div.style.display = 'flex'; div.style.gap = '0.8rem'; div.style.marginBottom = '1rem'; const imageStyle = data.platform === 'TikTok' ? 'width: 80px; height: 140px;' : 'width: 120px; height: 80px;';
            div.innerHTML = `<div style="${imageStyle} background:#000; border-radius:8px; overflow:hidden; border:1px solid #333; flex-shrink:0;"><img src="${data.imageUrl}" style="width:100%; height:100%; object-fit:cover;"></div><div style="flex:1;"><span style="font-size:0.7rem; color:#555;">${data.createdAt?.toDate().toLocaleString() || ''} | ${data.platform}</span><p style="font-size: 0.85rem; margin: 0.5rem 0;">${data.content}</p><div style="display: flex; gap: 0.5rem;"><button class="copy-btn-archive" data-text="${data.content.replace(/"/g, '&quot;')}" style="background:transparent; border:1px solid var(--primary); color:var(--primary); padding:4px 8px; border-radius:5px; cursor:pointer; font-size:0.65rem;">Copiar</button><button class="delete-btn-archive" data-id="${id}" style="background:transparent; border:1px solid #ff4d4d; color:#ff4d4d; padding:4px 8px; border-radius:5px; cursor:pointer; font-size:0.65rem;">Eliminar</button></div></div>`;
            archiveBody.appendChild(div)
        });
        document.querySelectorAll('.copy-btn-archive').forEach(b => b.addEventListener('click', () => { navigator.clipboard.writeText(b.getAttribute('data-text')).then(() => alert('Copiado con link completo')) }));
        document.querySelectorAll('.delete-btn-archive').forEach(b => b.addEventListener('click', async () => { if(confirm('¿Seguro?')) await deleteDoc(doc(db, 'ad_archive', b.getAttribute('data-id'))) }))
    })
}

window.exportLeads = (type) => {
    if (type === 'excel') {
        if (allLeads.length === 0) return alert('No hay datos'); 
        const headers = ['Fecha', 'Nombre', 'Telefono', 'Estado', 'Origen']; 
        const rows = allLeads.map(l => [l.createdAt?.toDate().toISOString() || '', l.name, l.phone, l.status, l.source]); 
        let csvContent = "data:text/csv;charset=utf-8," + headers.join(",") + "\n" + rows.map(e => e.join(",")).join("\n"); 
        const link = document.createElement("a"); 
        link.setAttribute("href", encodeURI(csvContent)); 
        link.setAttribute("download", `prospectos_angel_curbelo.csv`); 
        link.click();
    } else if (type === 'sheets') {
        if (allLeads.length === 0) return alert('No hay datos');
        const headers = ['Fecha', 'Nombre', 'Telefono', 'Estado', 'Origen'];
        const rows = allLeads.map(l => [
            l.createdAt?.toDate().toLocaleString() || '', 
            l.name, 
            l.phone, 
            l.status, 
            l.source
        ]);
        const tsvContent = [headers.join('\t'), ...rows.map(r => r.join('\t'))].join('\n');
        navigator.clipboard.writeText(tsvContent).then(() => {
            alert("📋 ¡Datos Copiados! \n\nA continuación se abrirá una nueva hoja de Google Sheets. \n\nCuando cargue, solo haz clic en la primera celda y presiona Ctrl+V para pegar.");
            window.open('https://sheets.new', '_blank');
        }).catch(err => alert('Error al copiar al portapapeles.'));
    } else if (type === 'pdf') {
        window.print();
    }
}

// ==========================================
// ENTRADA MANUAL + OCR SCANNER
// ==========================================

// --- Manual Lead Save ---
document.getElementById('btn-manual-save')?.addEventListener('click', async () => {
    const name = document.getElementById('manual-name').value.trim();
    const phone = document.getElementById('manual-phone').value.trim();
    if (!name || !phone) return alert('Nombre y Teléfono son obligatorios.');

    const credit = document.getElementById('manual-credit').value;
    let score = 50, scoreLabel = '☀️ Warm';
    if (credit === '750+') { score = 90; scoreLabel = '🔥 Hot'; }
    else if (credit === '651-749') { score = 65; scoreLabel = '☀️ Warm'; }
    else if (credit === 'Menos de 650') { score = 30; scoreLabel = '❄️ Cold'; }

    const leadData = {
        name, phone,
        municipio: document.getElementById('manual-municipio').value.trim(),
        service: document.getElementById('manual-service').value,
        credit,
        consumo: document.getElementById('manual-consumo').value.trim(),
        roofType: document.getElementById('manual-roof').value,
        notes: document.getElementById('manual-notes').value.trim(),
        source: 'manual-entry',
        status: 'Nuevo',
        score, scoreLabel,
        clientId: currentUser ? currentUser.id : 'angel',
        createdAt: new Date()
    };

    const btn = document.getElementById('btn-manual-save');
    try {
        btn.disabled = true; btn.innerText = 'Guardando...';
        await addDoc(collection(db, 'leads'), leadData);
        showVisualAlert(`${name} agregado al CRM`, '✅ Lead Guardado');
        ['manual-name','manual-phone','manual-municipio','manual-consumo','manual-notes'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('manual-service').value = 'solar';
        document.getElementById('manual-credit').value = '';
        document.getElementById('manual-roof').value = '';
    } catch (e) {
        console.error('Manual save error:', e);
        alert('Error al guardar el lead.');
    }
    btn.disabled = false; btn.innerText = '➕ Agregar Lead al CRM';
});

// --- OCR Scanner ---
let ocrImageBase64 = null;
let ocrExtractedLeads = [];

const ocrDropZone = document.getElementById('ocr-drop-zone');
const ocrFileInput = document.getElementById('ocr-file-input');

if (ocrDropZone) {
    ocrDropZone.addEventListener('click', () => ocrFileInput?.click());
    ocrDropZone.addEventListener('dragover', (e) => { e.preventDefault(); ocrDropZone.style.borderColor = '#d4af37'; ocrDropZone.style.background = 'rgba(212,175,55,0.05)'; });
    ocrDropZone.addEventListener('dragleave', () => { ocrDropZone.style.borderColor = '#333'; ocrDropZone.style.background = 'transparent'; });
    ocrDropZone.addEventListener('drop', (e) => { e.preventDefault(); ocrDropZone.style.borderColor = '#333'; ocrDropZone.style.background = 'transparent'; const f = e.dataTransfer.files[0]; if (f?.type.startsWith('image/')) handleOCRFile(f); });
}
ocrFileInput?.addEventListener('change', (e) => { if (e.target.files[0]) handleOCRFile(e.target.files[0]); });

function handleOCRFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
        ocrImageBase64 = e.target.result;
        const preview = document.getElementById('ocr-preview');
        const previewImg = document.getElementById('ocr-preview-img');
        if (previewImg) previewImg.src = ocrImageBase64;
        if (preview) preview.style.display = 'block';
        const scanBtn = document.getElementById('btn-ocr-scan');
        if (scanBtn) scanBtn.style.display = 'block';
        ocrDropZone.innerHTML = `<span style="font-size:2rem;">✅</span><p style="color:#2ecc71; font-size:0.85rem;">Imagen cargada - Lista para escanear</p><p style="color:#555; font-size:0.7rem;">Clic para cambiar imagen</p><input type="file" id="ocr-file-input" accept="image/*" capture="environment" style="display:none;">`;
        document.getElementById('ocr-file-input')?.addEventListener('change', (ev) => { if (ev.target.files[0]) handleOCRFile(ev.target.files[0]); });
    };
    reader.readAsDataURL(file);
}

// OCR Scan Button
document.getElementById('btn-ocr-scan')?.addEventListener('click', async () => {
    if (!ocrImageBase64) return alert('Sube una imagen primero.');
    const scanBtn = document.getElementById('btn-ocr-scan');
    const status = document.getElementById('ocr-status');
    scanBtn.disabled = true; scanBtn.innerText = '🔍 Analizando con IA...';
    status.style.display = 'block';
    status.innerHTML = '<span class="ai-pulse" style="color:#d4af37;">🤖 Extrayendo datos de prospectos...</span>';

    try {
        const extractFn = httpsCallable(functions, 'extractLeadsFromImage');
        const res = await extractFn({ imageBase64: ocrImageBase64 });

        if (res.data.error) {
            status.innerHTML = `<span style="color:#ff4d4d;">❌ ${res.data.error}</span>`;
        } else {
            const leads = res.data.leads || [];
            if (leads.length === 0) {
                status.innerHTML = '<span style="color:#ffcc00;">⚠️ No se encontraron prospectos. Intenta con una foto más clara.</span>';
            } else {
                renderOCRResults(leads);
                status.innerHTML = `<span style="color:#2ecc71;">✅ ${leads.length} prospecto(s) detectado(s)</span>`;
            }
        }
    } catch (error) {
        console.error('OCR Error:', error);
        status.innerHTML = `<span style="color:#ff4d4d;">❌ Error: ${error.message}</span>`;
    }
    scanBtn.disabled = false; scanBtn.innerText = '🔍 Escanear y Extraer Datos';
});

function renderOCRResults(leads) {
    ocrExtractedLeads = leads;
    const container = document.getElementById('ocr-results-container');
    const body = document.getElementById('ocr-results-body');
    container.style.display = 'block';
    body.innerHTML = leads.map((l, i) => `
        <tr>
            <td><input type="checkbox" class="ocr-check" data-index="${i}" checked></td>
            <td><input type="text" value="${l.name || ''}" class="input-field" style="width:120px;" data-field="name" data-index="${i}"></td>
            <td><input type="text" value="${l.phone || ''}" class="input-field" style="width:110px;" data-field="phone" data-index="${i}"></td>
            <td><input type="text" value="${l.municipio || ''}" class="input-field" style="width:100px;" data-field="municipio" data-index="${i}"></td>
            <td><select class="status-select" data-field="service" data-index="${i}">
                <option value="solar" ${l.service === 'solar' ? 'selected' : ''}>Solar</option>
                <option value="hh" ${l.service === 'hh' ? 'selected' : ''}>HH</option>
                <option value="rainbow" ${l.service === 'rainbow' ? 'selected' : ''}>Rainbow</option>
                <option value="zendure" ${l.service === 'zendure' ? 'selected' : ''}>Zendure</option>
            </select></td>
            <td><select class="status-select" data-field="credit" data-index="${i}">
                <option value="">-</option>
                <option value="750+" ${l.credit === '750+' ? 'selected' : ''}>750+</option>
                <option value="651-749" ${l.credit === '651-749' ? 'selected' : ''}>651-749</option>
                <option value="Menos de 650" ${(l.credit || '').includes('650') ? 'selected' : ''}>-650</option>
            </select></td>
            <td><small style="color:#888;">${l.notes || l.consumo || '-'}</small></td>
        </tr>
    `).join('');

    // Sync edits back to array
    body.querySelectorAll('input[data-field], select[data-field]').forEach(el => {
        el.addEventListener('change', () => {
            const idx = parseInt(el.dataset.index);
            ocrExtractedLeads[idx][el.dataset.field] = el.value;
        });
    });
}

// Save All OCR Results
document.getElementById('btn-ocr-save-all')?.addEventListener('click', async () => {
    const checks = document.querySelectorAll('.ocr-check:checked');
    if (checks.length === 0) return alert('Selecciona al menos un prospecto.');

    const saveBtn = document.getElementById('btn-ocr-save-all');
    saveBtn.disabled = true; saveBtn.innerText = '💾 Guardando...';
    let saved = 0;

    for (const chk of checks) {
        const lead = ocrExtractedLeads[parseInt(chk.dataset.index)];
        if (!lead.name) continue;

        let score = 50, scoreLabel = '☀️ Warm';
        if (lead.credit === '750+') { score = 90; scoreLabel = '🔥 Hot'; }
        else if (lead.credit === '651-749') { score = 65; scoreLabel = '☀️ Warm'; }
        else if (lead.credit === 'Menos de 650') { score = 30; scoreLabel = '❄️ Cold'; }

        try {
            await addDoc(collection(db, 'leads'), {
                name: lead.name, phone: lead.phone || '', municipio: lead.municipio || '',
                service: lead.service || 'solar', credit: lead.credit || '',
                consumo: lead.consumo || '', roofType: lead.roofType || '',
                notes: lead.notes || '', source: 'ocr-scan', status: 'Nuevo',
                score, scoreLabel,
                clientId: currentUser ? currentUser.id : 'angel',
                createdAt: new Date()
            });
            saved++;
        } catch (e) { console.error('Error saving OCR lead:', e); }
    }

    showVisualAlert(`${saved} lead(s) guardados exitosamente`, '✅ Importación Completa');
    document.getElementById('ocr-results-container').style.display = 'none';
    saveBtn.disabled = false; saveBtn.innerText = '💾 Guardar Todos en CRM';
});

// Inicialización final
// Firebase Auth Session Observer
onAuthStateChanged(auth, async (user) => {
    if (user) {
        try {
            hideLoginError();
            const userDocSnap = await getDoc(doc(db, 'users', user.uid));
            if (userDocSnap.exists()) {
                const userData = userDocSnap.data();
                const role = userData.role;
                const clientId = userData.clientId || 'angel';
                
                if (['admin', 'master', 'staff'].includes(role)) {
                    currentUser = CLIENTS[clientId] || {
                        id: clientId,
                        name: userData.name || user.email,
                        role: role === 'master' ? 'master' : 'client',
                        allowedSources: role === 'master' ? 'all' : ['direct', 'cuestionario-web'],
                        sections: role === 'master' ? ['leads', 'marketing', 'stats', 'archive', 'manual-entry', 'qr'] : ['leads']
                    };
                    activeContext = currentUser.role === 'master' ? 'all' : currentUser.id;
                    showPanel();
                } else {
                    showLoginError("Acceso no autorizado. Tu cuenta no tiene permisos administrativos.");
                    await signOut(auth);
                }
            } else {
                showLoginError("Perfil de usuario no encontrado en la base de datos.");
                await signOut(auth);
            }
        } catch (error) {
            console.error("Error al cargar perfil de usuario:", error);
            showLoginError("Error al validar tu usuario: " + error.message);
            await signOut(auth);
        }
    } else {
        currentUser = null;
        activeContext = 'all';
        loginScreen.style.display = 'flex';
        adminPanel.style.display = 'none';
        
        // Clear inputs
        if (adminEmailInput) adminEmailInput.value = '';
        if (adminPassInput) adminPassInput.value = '';
        if (loginBtn) {
            loginBtn.disabled = false;
            loginBtn.innerText = "Entrar al Sistema";
        }
        
        // Detach Firestore listeners
        if (unsubLeads) { unsubLeads(); unsubLeads = null; }
        if (unsubArchive) { unsubArchive(); unsubArchive = null; }
        
        // Remove context switcher
        const switcher = document.getElementById('context-switcher');
        if (switcher) switcher.remove();
    }
});

// ==========================================
// AI SALES SIMULATOR LOGIC
// ==========================================
let recognition = null;
let isSimulating = false;
let trustLevel = 50;
let currentDifficulty = 'easy';

const initSpeech = () => {
    if ('webkitSpeechRecognition' in window) {
        recognition = new webkitSpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        recognition.lang = 'es-PR';

        recognition.onresult = (event) => {
            const transcript = event.results[event.results.length - 1][0].transcript.toLowerCase();
            handleAgentSpeech(transcript);
        };

        recognition.onend = () => {
            if (isSimulating) recognition.start();
        };
    }
};

const speak = (text) => {
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'es-MX';
    utterance.rate = 0.9; // Slightly slower for clarity
    window.speechSynthesis.speak(utterance);
};

const updateUI = (feedback = '') => {
    const fill = document.getElementById('trust-fill');
    const val = document.getElementById('trust-value');
    fill.style.width = `${trustLevel}%`;
    val.innerText = `${trustLevel}%`;
    
    if (feedback) {
        const log = document.getElementById('sim-log');
        const fbDiv = document.createElement('div');
        fbDiv.className = 'log-feedback';
        fbDiv.innerText = `💡 Tip: ${feedback}`;
        log.appendChild(fbDiv);
        log.scrollTop = log.scrollHeight;
    }
};

const handleAgentSpeech = (text) => {
    const log = document.getElementById('sim-log');
    const div = document.createElement('div');
    div.className = 'log-agent';
    div.innerText = `Tú: ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;

    // SCORING LOGIC BASED ON DOCUMENT
    let feedback = '';
    
    // 1. Robot Detector (Point 1 of doc)
    if (text.includes('le llamo para orientarle') || text.includes('sistema solar')) {
        trustLevel -= 15;
        feedback = "¡Activaste el rechazo automático! Evita mencionar productos al inicio.";
    }

    // 2. Micro-empathy (Point 5 & Table)
    const empathyTriggers = [
        { word: 'carro', score: 15, tip: "Excelente comparación con el pago de un carro." },
        { word: 'frustrante', score: 12, tip: "Conectaste con la frustración de los apagones." },
        { word: 'calor', score: 10, tip: "Validaste el dolor del calor excesivo." },
        { word: 'salud', score: 20, tip: "Priorizaste la salud, un gatillo emocional fuerte." },
        { word: 'niños', score: 15, tip: "Enfoque en bienestar familiar detectado." },
        { word: 'negocio', score: 15, tip: "Identificaste el dolor del negocio detenido." },
        { word: 'incertidumbre', score: 10, tip: "Reconociste el miedo a los huracanes." }
    ];

    empathyTriggers.forEach(trigger => {
        if (text.includes(trigger.word)) {
            trustLevel += trigger.score;
            feedback = trigger.tip;
        }
    });

    // 3. Curiosity & Privilege
    if (text.includes('vip') || text.includes('seleccionado') || text.includes('preventa') || text.includes('exclusivo')) {
        trustLevel += 15;
        feedback = "Buen uso de palabras de privilegio.";
    }

    trustLevel = Math.max(0, Math.min(100, trustLevel));
    updateUI(feedback);

    // AI RESPONSE LOGIC BASED ON DIFFICULTY & TRUST
    const diff = document.getElementById('sim-difficulty').value;
    
    // Adjust trust impact based on difficulty
    let trustImpactMultiplier = 1.0;
    if (diff === 'hard') trustImpactMultiplier = 0.7;
    if (diff === 'expert') trustImpactMultiplier = 0.5;

    setTimeout(() => {
        let response = "";
        
        // Difficulty Thresholds
        let hardThreshold = 40;
        let goodThreshold = 75;

        if (diff === 'hard') { hardThreshold = 50; goodThreshold = 85; }
        if (diff === 'expert') { hardThreshold = 65; goodThreshold = 95; }

        if (trustLevel < hardThreshold) {
            const badResponses = {
                'easy': ["No me interesa, estoy ocupado.", "Llámeme luego."],
                'medium': ["¿De dónde sacaron mi número? No quiero que me llamen más.", "No tengo tiempo para esto ahora."],
                'hard': ["¡Ya les dije que no quiero placas! No sigan llamando.", "Ustedes son unos estafadores, no me vuelvan a marcar."],
                'expert': ["(Cuelga el teléfono)", "Si me vuelves a llamar te voy a reportar a la policía."]
            };
            const list = badResponses[diff] || badResponses['easy'];
            response = list[Math.floor(Math.random() * list.length)];
            
            if (response === "(Cuelga el teléfono)") {
                isSimulating = false;
                document.getElementById('start-sim-btn').click(); // Auto-stop
            }
        } else if (trustLevel < goodThreshold) {
            const midResponses = [
                "Dígame rápido de qué se trata.",
                "Sí, creo que vi algo en Facebook, pero no tengo tiempo ahora.",
                "¿Cuánto me va a costar eso? Porque la luz está carísima.",
                "¿Ustedes son los de la compañía de luz?"
            ];
            response = midResponses[Math.floor(Math.random() * midResponses.length)];
        } else {
            const goodResponses = [
                "Ah, entiendo. ¿Y qué beneficios VIP son esos que mencionó?",
                "Sí, pago como $250 de luz y ya no puedo más. ¿Cómo me pueden ayudar?",
                "El martes a las 3 me parece bien, mi esposo también estará en casa.",
                "Me gusta eso que dijo de la salud, cuénteme más."
            ];
            response = goodResponses[Math.floor(Math.random() * goodResponses.length)];
        }

        speak(response);
        const resDiv = document.createElement('div');
        resDiv.className = 'log-client';
        resDiv.innerText = `Cliente: ${response}`;
        log.appendChild(resDiv);
        log.scrollTop = log.scrollHeight;
    }, 1500);
};

// POPULATE LIBRARY FROM NOTEBOOKLM DATA
const populateLibrary = () => {
    const grid = document.getElementById('objection-library-grid');
    if (!grid) return;

    const data = [
        { t: 'Micro-empatía', d: 'Conectar emocionalmente. Ej: "Ese pago de luz es prácticamente un pago de carro".', icon: '❤️' },
        { t: 'Venta de Privilegio', d: 'Usar palabras como VIP, Seleccionado, Preventa, Beneficio Especial.', icon: '💎' },
        { t: 'Control Suave', d: 'No interrogar. Dar opciones A o B para mantener el liderazgo.', icon: '🎮' },
        { t: 'Incertidumbre', d: 'Bajar defensas al inicio diciendo solo el nombre: "¿Mario?".', icon: '❓' },
        { t: 'Asumir Cierre', d: 'No pedir permiso. "Estaré en su área el martes entre 3 y 6".', icon: '📅' },
        { t: 'Dolor Dominante', d: 'Identificar si le duele el calor, los apagones o el dinero.', icon: '🩹' }
    ];

    grid.innerHTML = data.map(item => `
        <div class="objection-card flex gap-4 items-start">
            <div style="font-size:1.5rem;">${item.icon}</div>
            <div>
                <span class="tag">ESTRATEGIA</span>
                <h4 class="font-bold text-primary" style="margin-bottom:0.4rem; color:#d4af37;">${item.t}</h4>
                <p class="text-sm opacity-70" style="line-height:1.5; color:#888;">${item.d}</p>
            </div>
        </div>
    `).join('');

    // --- POPULATE PAIN MAP ---
    const pains = [
        { t: 'Factura Alta', d: '"Es prácticamente un pago de carro"', p: 'Ahorro VIP', icon: '💰' },
        { t: 'Apagones', d: '"Frustrante estar a oscuras"', p: 'Prioridad Preventa', icon: '🔦' },
        { t: 'Salud/Médico', d: '"Con la salud no se juega"', p: 'Seguridad Exclusiva', icon: '🛡️' },
        { t: 'Negocio', d: '"Su negocio no se puede detener"', p: 'Acceso Especial', icon: '🏢' }
    ];

    const painGrid = document.getElementById('pain-map-grid');
    if (painGrid) {
        painGrid.innerHTML = pains.map(item => `
            <div class="objection-card">
                <div style="font-size:1.5rem; margin-bottom:1rem;">${item.icon}</div>
                <span class="tag" style="background:rgba(255,255,255,0.05); color:#888;">DOLOR: ${item.t}</span>
                <h4 style="color:#fff; font-size:1.2rem; margin: 1rem 0;">${item.d}</h4>
                <p style="color:var(--primary); font-size:0.8rem; font-weight:700; text-transform:uppercase;">VÉNDALE: ${item.p}</p>
            </div>
        `).join('');
    }

    // Populate Quiz
    const quizContainer = document.getElementById('quiz-container');
    if (quizContainer) {
        const quizData = [
            { q: '1. ¿Cuál es el error más grande que cometen los telemarketers según el manual?', o: ['A) Hablar muy bajo.', 'B) Sonar robóticos y vender desde el primer minuto.', 'C) No mencionar el precio de inmediato.'], a: 1 },
            { q: '2. ¿Cuál es el verdadero objetivo de la llamada inicial?', o: ['A) Regalar un certificado a toda costa.', 'B) Convencer al cliente de comprar paneles de alta gama.', 'C) Crear confianza, identificar dolores y sacar la cita.'], a: 2 },
            { q: '3. ¿Por qué es efectiva la frase: "Le hago varias preguntitas..."?', o: ['A) Porque justifica la precalificación dándole una lógica de beneficio al cliente.', 'B) Porque confunde al cliente sobre el precio.', 'C) Porque es una frase corta y fácil de leer.'], a: 0 },
            { q: '4. Ante un cliente que paga $200 de luz, ¿cuál es un ejemplo de micro-empatía?', o: ['A) "Entiendo, ahora dígame si la casa es suya".', 'B) "Wow... eso es prácticamente un pago de carro".', 'C) "Nosotros podemos bajar eso a cero".'], a: 1 },
            { q: '5. ¿Qué palabras activan emocionalmente el sentido de privilegio?', o: ['A) Paneles, inversores, baterías, vatios.', 'B) Contrato, términos, condiciones, legal.', 'C) VIP, seleccionado, preventa, beneficio especial.'], a: 2 },
            { q: '6. ¿Cómo se debe realizar el cierre de la cita para reducir cancelaciones?', o: ['A) Preguntando: "¿Qué día usted puede?".', 'B) Asumiendo el cierre: "Voy a estar en su área el martes entre 3 y 6".', 'C) Esperando a que el cliente proponga la fecha.'], a: 1 }
        ];

        window.checkAnswer = (qIndex, oIndex, btn) => {
            const isCorrect = quizData[qIndex].a === oIndex;
            const parent = btn.parentElement;
            
            // Disable all buttons in this question
            parent.querySelectorAll('button').forEach(b => {
                b.disabled = true;
                b.classList.add('opacity-50', 'cursor-not-allowed');
            });
            
            btn.classList.remove('opacity-50');
            if (isCorrect) {
                btn.classList.add('bg-success', 'text-black', 'border-success');
                btn.innerHTML += ' ✅ Correcto';
            } else {
                btn.classList.add('bg-danger', 'text-white', 'border-danger');
                btn.innerHTML += ' ❌ Incorrecto';
                // Highlight correct
                parent.children[quizData[qIndex].a].classList.remove('opacity-50');
                parent.children[quizData[qIndex].a].classList.add('border-success', 'text-success');
            }
        };

        quizContainer.innerHTML = quizData.map((q, qIndex) => `
            <div class="card p-4 bg-white/5 border border-white/10 rounded-lg">
                <p class="font-bold mb-3">${q.q}</p>
                <div class="flex flex-col gap-2">
                    ${q.o.map((opt, oIndex) => `
                        <button onclick="checkAnswer(${qIndex}, ${oIndex}, this)" class="text-left p-2 rounded border border-white/20 hover:bg-white/10 transition-colors">
                            ${opt}
                        </button>
                    `).join('')}
                </div>
            </div>
        `).join('');
    }
};

document.getElementById('start-sim-btn')?.addEventListener('click', () => {
    const btn = document.getElementById('start-sim-btn');
    const indicator = document.getElementById('voice-indicator');
    
    if (!isSimulating) {
        isSimulating = true;
        btn.innerText = "Terminar Sesión";
        btn.classList.add('btn-danger');
        indicator.classList.add('active');
        const diff = document.getElementById('sim-difficulty').value;
        trustLevel = 50;
        if (diff === 'easy') trustLevel = 60;
        if (diff === 'hard') trustLevel = 40;
        if (diff === 'expert') trustLevel = 25;

        updateUI();
        
        if (!recognition) initSpeech();
        recognition.start();
        
        const intro = (diff === 'hard' || diff === 'expert') ? "¿Aló? Estoy ocupado, ¿quién es?" : "¿Aló? ¿Quién habla?";
        speak(intro);
        document.getElementById('sim-log').innerHTML = `<div class="log-client">Cliente: ${intro}</div>`;
    } else {
        isSimulating = false;
        btn.innerText = "Iniciar Sesión";
        btn.classList.remove('btn-danger');
        indicator.classList.remove('active');
        recognition.stop();
        
        // Final Score Feedback
        const log = document.getElementById('sim-log');
        const scoreDiv = document.createElement('div');
        scoreDiv.style.padding = '1rem';
        scoreDiv.style.background = 'var(--primary)';
        scoreDiv.style.color = '#000';
        scoreDiv.style.borderRadius = '8px';
        scoreDiv.style.marginTop = '1rem';
        scoreDiv.innerHTML = `<strong>RESULTADO DEL ENTRENAMIENTO:</strong><br>
                              Puntuación de Confianza: ${trustLevel}%<br>
                              Rango: ${trustLevel > 80 ? '🏆 Profesional Humano' : trustLevel > 50 ? '📈 En Crecimiento' : '🤖 Robot (Necesita práctica)'}`;
        log.appendChild(scoreDiv);
    }
});

// INITIALIZE
document.addEventListener('DOMContentLoaded', () => {
    populateLibrary();
    setupAICommModal();
    setupTranscriptModal();
    setupAppointmentModal();
});

// ====== IA ASISTENTE DE COMUNICACIÓN MODAL LOGIC ======
function openAICommModal(lead) {
    currentAICommLead = lead;
    const modal = document.getElementById('ai-comm-modal');
    const subtitle = document.getElementById('ai-comm-lead-subtitle');
    const resultBox = document.getElementById('ai-comm-result-box');
    const statusBox = document.getElementById('ai-comm-status');
    const textarea = document.getElementById('ai-comm-message-text');

    if (subtitle) {
        subtitle.innerText = `Generando mensaje para: ${lead.name} (${lead.service || 'Solar'})`;
    }
    
    // Ocultar caja de resultados y resetear estado
    if (resultBox) resultBox.style.display = 'none';
    if (statusBox) statusBox.style.display = 'none';
    if (textarea) textarea.value = '';

    if (modal) modal.classList.add('active');
}

// ====== MODAL DE TRANSCRIPCIÓN COMPLETA ======
window.openTranscriptModal = function(leadId) {
    const lead = window.leadDataCache?.[leadId];
    if (!lead) return;
    const modal = document.getElementById('transcript-modal');
    const subtitle = document.getElementById('transcript-lead-subtitle');
    const contentBox = document.getElementById('transcript-content-box');
    const audioContainer = document.getElementById('transcript-audio-container');
    const audioPlayer = document.getElementById('transcript-audio-player');
    const summaryContainer = document.getElementById('transcript-summary-container');
    const summaryBox = document.getElementById('transcript-summary-box');
    const copyBtn = document.getElementById('btn-copy-transcript');

    if (subtitle) {
        const srv = lead.service ? lead.service.toUpperCase() : 'GENERAL';
        const icon = srv === 'SOLAR' ? '☀️' : srv === 'ZENDURE' ? '🔋' : srv === 'RAINBOW' ? '💧' : '🏠';
        subtitle.innerHTML = `<strong>${icon} ${srv}</strong> | Cliente: <strong style="color:#fff;">${lead.name || 'Prospecto'}</strong> (${lead.phone || 'Sin tel'})`;
    }

    if (audioContainer && audioPlayer) {
        if (lead.recordingUrl) {
            audioPlayer.src = lead.recordingUrl;
            audioContainer.style.display = 'block';
        } else {
            audioPlayer.src = '';
            audioContainer.style.display = 'none';
        }
    }

    if (summaryContainer && summaryBox) {
        let summaryText = lead.summary || '';
        if (!summaryText && lead.notes && lead.notes.startsWith('Resumen')) {
            summaryText = lead.notes;
        }
        if (summaryText) {
            summaryBox.innerText = summaryText;
            summaryContainer.style.display = 'block';
        } else {
            summaryContainer.style.display = 'none';
        }
    }

    if (contentBox) {
        contentBox.innerHTML = formatTranscriptHTML(lead.transcript, lead.name);
    }

    if (copyBtn) {
        copyBtn.onclick = () => {
            const rawText = lead.transcript || 'Sin transcripción disponible';
            if (navigator.clipboard && navigator.clipboard.writeText) {
                navigator.clipboard.writeText(rawText);
                copyBtn.innerHTML = '<span>✅ ¡Copiado con Éxito!</span>';
                setTimeout(() => { copyBtn.innerHTML = '<span>📋 Copiar Texto Completo</span>'; }, 2000);
            } else {
                alert("Tu navegador no soporta el copiado automático. Por favor selecciona el texto y cópialo.");
            }
        };
    }

    if (modal) modal.classList.add('active');
};

function formatTranscriptHTML(rawText, leadName = 'Cliente') {
    if (!rawText || !rawText.trim()) {
        return `<div style="text-align:center; padding:3rem 1rem; color:#666;"><i>No se registró audio ni diálogo textual en esta llamada.</i></div>`;
    }

    const lines = rawText.split('\n');
    let html = `<div style="display:flex; flex-direction:column; gap:1.2rem; padding:0.5rem;">`;

    lines.forEach(line => {
        if (!line.trim()) return;

        let speaker = "unknown";
        let text = line.trim();

        if (text.match(/^(AI|Bot|Asistente|Assistant|AI Assistant):\s*/i)) {
            speaker = "ai";
            text = text.replace(/^(AI|Bot|Asistente|Assistant|AI Assistant):\s*/i, '');
        } else if (text.match(/^(User|Customer|Cliente|Caller|Human):\s*/i)) {
            speaker = "user";
            text = text.replace(/^(User|Customer|Cliente|Caller|Human):\s*/i, '');
        } else if (text.startsWith('[')) {
            speaker = "system";
        }

        if (speaker === "ai") {
            html += `
                <div style="display:flex; gap:12px; align-items:flex-start; max-width:85%;">
                    <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, #d4af37, #f3e5ab); display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; box-shadow:0 4px 10px rgba(212,175,55,0.3); color:#000;">
                        🤖
                    </div>
                    <div style="background:#1a1a1a; border:1px solid #d4af3744; border-radius:4px 16px 16px 16px; padding:1rem 1.2rem; color:#fff; font-size:0.95rem; line-height:1.5; box-shadow:0 4px 15px rgba(0,0,0,0.3);">
                        <div style="font-size:0.75rem; font-weight:800; color:#d4af37; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px;">Asistente de Voz IA</div>
                        <div>${text}</div>
                    </div>
                </div>`;
        } else if (speaker === "user") {
            html += `
                <div style="display:flex; gap:12px; align-items:flex-start; align-self:flex-end; max-width:85%; flex-direction:row-reverse;">
                    <div style="width:36px; height:36px; border-radius:50%; background:linear-gradient(135deg, #3b82f6, #2563eb); display:flex; align-items:center; justify-content:center; font-size:1.1rem; flex-shrink:0; box-shadow:0 4px 10px rgba(59,130,246,0.3); color:#fff;">
                        👤
                    </div>
                    <div style="background:#2563eb; border-radius:16px 4px 16px 16px; padding:1rem 1.2rem; color:#fff; font-size:0.95rem; line-height:1.5; box-shadow:0 4px 15px rgba(37,99,235,0.3);">
                        <div style="font-size:0.75rem; font-weight:800; color:#93c5fd; margin-bottom:4px; text-transform:uppercase; letter-spacing:0.5px; text-align:right;">${leadName || 'Cliente'}</div>
                        <div>${text}</div>
                    </div>
                </div>`;
        } else if (speaker === "system") {
            html += `
                <div style="align-self:center; background:#222; border:1px solid #333; border-radius:20px; padding:4px 14px; font-size:0.8rem; color:#aaa;">
                    ${text}
                </div>`;
        } else {
            html += `
                <div style="background:#111; border:1px solid #222; border-radius:10px; padding:0.8rem 1rem; font-size:0.9rem; color:#ccc;">
                    ${text}
                </div>`;
        }
    });

    html += `</div>`;
    return html;
}

function setupTranscriptModal() {
    const modal = document.getElementById('transcript-modal');
    const closeBtn = document.getElementById('transcript-close');
    const closeFooterBtn = document.getElementById('btn-close-transcript-footer');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    closeFooterBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });
}

// ====== MODAL DE AGENDAR CITA ======
let currentAppointmentLead = null;

function openAppointmentModal(lead) {
    currentAppointmentLead = lead;
    const modal = document.getElementById('appointment-modal');
    const subtitle = document.getElementById('appointment-lead-subtitle');
    const leadIdInput = document.getElementById('appointment-lead-id');
    const statusBox = document.getElementById('appointment-status');

    if (subtitle) {
        subtitle.innerText = `Coordinando cita para: ${lead.name} (${lead.phone || ''})`;
    }
    if (leadIdInput) {
        leadIdInput.value = lead.id;
    }
    if (statusBox) {
        statusBox.style.display = 'none';
        statusBox.innerText = '';
    }

    if (modal) modal.classList.add('active');
}

function setupAppointmentModal() {
    const modal = document.getElementById('appointment-modal');
    const closeBtn = document.getElementById('appointment-close');
    const saveBtn = document.getElementById('btn-save-appointment');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    saveBtn?.addEventListener('click', async () => {
        if (!currentAppointmentLead) return;
        const dateInput = document.getElementById('appointment-date');
        const hourSel = document.getElementById('appointment-hour');
        const minSel = document.getElementById('appointment-minute');
        const ampmSel = document.getElementById('appointment-ampm');
        const specialistSelect = document.getElementById('appointment-specialist');
        const notesInput = document.getElementById('appointment-notes');
        const statusBox = document.getElementById('appointment-status');

        const dateVal = dateInput?.value;
        let timeVal = '';
        if (hourSel && minSel && ampmSel) {
            let h = parseInt(hourSel.value, 10);
            const m = minSel.value;
            const ampm = ampmSel.value;
            if (ampm === 'PM' && h < 12) h += 12;
            if (ampm === 'AM' && h === 12) h = 0;
            timeVal = `${h.toString().padStart(2, '0')}:${m}`;
        }
        const specialistVal = specialistSelect?.value || 'Angel Curbelo';
        const notesVal = notesInput?.value || '';

        if (!dateVal || !timeVal) {
            alert("Por favor, seleccione la fecha y hora de la cita.");
            return;
        }

        if (statusBox) {
            statusBox.style.display = 'block';
            statusBox.style.color = '#c084fc';
            statusBox.innerText = "⏳ Conectando con servidor y sincronizando con Google Calendar...";
        }

        saveBtn.disabled = true;
        saveBtn.style.opacity = '0.7';

        try {
            const scheduleFn = httpsCallable(functions, 'scheduleLeadAppointment');
            const res = await scheduleFn({
                leadId: currentAppointmentLead.id,
                date: dateVal,
                time: timeVal,
                assignedTo: specialistVal,
                notes: notesVal
            });

            if (res.data?.error) {
                alert(`Error al agendar cita: ${res.data.error}`);
                if (statusBox) {
                    statusBox.style.color = '#ef4444';
                    statusBox.innerText = `❌ Error: ${res.data.error}`;
                }
            } else {
                if (statusBox) {
                    statusBox.style.color = '#10b981';
                    statusBox.innerText = "✅ ¡Cita agendada exitosamente en el calendario y notificada!";
                }
                setTimeout(() => {
                    modal.classList.remove('active');
                    if (statusBox) statusBox.style.display = 'none';
                }, 2000);
            }
        } catch (err) {
            console.error("Error agendando cita:", err);
            alert(`Error de conexión con el servidor: ${err.message}`);
            if (statusBox) {
                statusBox.style.color = '#ef4444';
                statusBox.innerText = `❌ Error: ${err.message}`;
            }
        } finally {
            saveBtn.disabled = false;
            saveBtn.style.opacity = '1';
        }
    });
}

function setupAICommModal() {
    const modal = document.getElementById('ai-comm-modal');
    const closeBtn = document.getElementById('ai-comm-close');
    const generateBtn = document.getElementById('btn-generate-ai');
    const sendWaBtn = document.getElementById('btn-send-wa');
    const callBtn = document.getElementById('btn-call-comm');
    const vapiCallBtn = document.getElementById('btn-vapi-call-comm');
    const sendEmailBtn = document.getElementById('btn-send-email');
    const copyBtn = document.getElementById('btn-copy-comm');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.classList.remove('active');
    });

    generateBtn?.addEventListener('click', async () => {
        if (!currentAICommLead) return;
        const objective = document.getElementById('ai-comm-objective')?.value || '';
        const tone = document.getElementById('ai-comm-tone')?.value || '';
        const statusBox = document.getElementById('ai-comm-status');
        const resultBox = document.getElementById('ai-comm-result-box');
        const textarea = document.getElementById('ai-comm-message-text');

        if (statusBox) statusBox.style.display = 'block';
        if (resultBox) resultBox.style.display = 'none';
        generateBtn.disabled = true;
        generateBtn.style.opacity = '0.7';

        try {
            const generateMsgFn = httpsCallable(functions, 'generateLeadMessage');
            const res = await generateMsgFn({ lead: currentAICommLead, objective, tone });
            
            if (res.data?.error) {
                alert(`Error: ${res.data.error}`);
            } else if (res.data?.message) {
                if (textarea) textarea.value = res.data.message;
                if (resultBox) resultBox.style.display = 'block';
            }
        } catch (err) {
            console.error("Error AI Comm:", err);
            alert(`Error de conexión con el servidor: ${err.message}`);
        } finally {
            if (statusBox) statusBox.style.display = 'none';
            generateBtn.disabled = false;
            generateBtn.style.opacity = '1';
        }
    });

    sendWaBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        const phone = currentAICommLead.phone ? currentAICommLead.phone.replace(/\D/g, '') : '';
        if (!phone) {
            alert("El prospecto no tiene un número de teléfono registrado.");
            return;
        }
        const text = encodeURIComponent(document.getElementById('ai-comm-message-text')?.value || '');
        window.open(`https://wa.me/${phone}?text=${text}`, '_blank');
    });

    callBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        const phone = currentAICommLead.phone ? currentAICommLead.phone.replace(/\D/g, '') : '';
        if (!phone) {
            alert("El prospecto no tiene un número de teléfono registrado.");
            return;
        }
        window.open(`tel:${phone}`, '_self');
    });

    vapiCallBtn?.addEventListener('click', () => {
        if (!currentAICommLead) return;
        initiateVapiCallForLead(currentAICommLead, vapiCallBtn);
    });

    sendEmailBtn?.addEventListener('click', async () => {
        if (!currentAICommLead) return;
        let email = currentAICommLead.email || '';
        if (!email) {
            email = prompt(`Ingrese el correo para ${currentAICommLead.name}:`, '');
            if (!email || !email.trim()) return;
            email = email.trim();
            currentAICommLead.email = email;
            if (window.leadDataCache && window.leadDataCache[currentAICommLead.id]) {
                window.leadDataCache[currentAICommLead.id].email = email;
            }
            try {
                await updateDoc(doc(db, 'leads', currentAICommLead.id), { email: email });
            } catch (err) {
                console.error("Error guardando email en Firebase:", err);
            }
        }
        const subject = encodeURIComponent(`Mensaje de orientación para ${currentAICommLead.name} - TuPlanta.com`);
        const body = encodeURIComponent(document.getElementById('ai-comm-message-text')?.value || '');
        window.open(`mailto:${email}?subject=${subject}&body=${body}`, '_blank');
    });

    copyBtn?.addEventListener('click', () => {
        const text = document.getElementById('ai-comm-message-text')?.value || '';
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text);
            copyBtn.innerHTML = '<span>✅ Copiado</span>';
            setTimeout(() => { copyBtn.innerHTML = '<span>📋 Copiar</span>'; }, 2000);
        } else {
            alert("Tu navegador no soporta el copiado automático. Selecciona y copia el texto.");
        }
    });
}

// ====== NEW: QR CODE GENERATOR ======
let currentQRArea = 'solar';

function initQRCode() {
    const imgDisplay = document.getElementById('qr-img-display');
    const areaSelect = document.getElementById('qr-area-select');
    if (!imgDisplay) return;

    if (areaSelect) {
        areaSelect.onchange = (e) => {
            currentQRArea = e.target.value;
            updateQRCodeDisplay();
        };
    }

    updateQRCodeDisplay();
}

function updateQRCodeDisplay() {
    const imgDisplay = document.getElementById('qr-img-display');
    if (!imgDisplay) return;
    
    const cid = currentUser ? currentUser.id : 'angel';
    let path = 'cuestionario';
    let cardTitle = 'QR de Cuestionario Web (☀️ Solar)';
    let flyerTitle = 'Flyer Digital Promocional (☀️ Solar)';
    
    if (currentQRArea === 'hh') {
        path = 'hh-distributors';
        cardTitle = 'QR de Cuestionario Web (🏠 H&H Bienestar)';
        flyerTitle = 'Flyer Digital Promocional (🏠 H&H Bienestar)';
    } else if (currentQRArea === 'rainbow') {
        path = 'rainbow';
        cardTitle = 'QR de Cuestionario Web (🌪️ Rainbow)';
        flyerTitle = 'Flyer Digital Promocional (🌪️ Rainbow)';
    }

    const url = `https://angel-curbelo-sales-crm.web.app/${path}?cid=${cid}&src=qr`;

    const cardTitleEl = document.getElementById('qr-card-title');
    if (cardTitleEl) cardTitleEl.innerText = cardTitle;
    const flyerTitleEl = document.getElementById('flyer-card-title');
    if (flyerTitleEl) flyerTitleEl.innerText = flyerTitle;

    QRCode.toDataURL(url, {
        width: 300,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
    }, (err, dataUrl) => {
        if (err) {
            console.error("Error QR:", err);
        } else {
            imgDisplay.src = dataUrl;
        }
    });

    const btnOnly = document.getElementById('btn-download-qr-only');
    if (btnOnly) {
        btnOnly.onclick = () => {
            if (!imgDisplay.src || imgDisplay.src.endsWith('#')) return;
            const a = document.createElement('a');
            a.href = imgDisplay.src;
            a.download = `QR_${currentQRArea.toUpperCase()}_AngelCurbelo_${new Date().toISOString().split('T')[0]}.png`;
            a.click();
        };
    }

    const btnFlyer = document.getElementById('btn-download-qr-flyer');
    if (btnFlyer) {
        btnFlyer.onclick = () => {
            generateAndDownloadFlyer(url, currentQRArea);
        };
    }
}

function generateAndDownloadFlyer(url, area) {
    const flyerCanvas = document.createElement('canvas');
    flyerCanvas.width = 1080;
    flyerCanvas.height = 1080;
    const ctx = flyerCanvas.getContext('2d');

    ctx.fillStyle = '#0a0a0a';
    ctx.fillRect(0, 0, 1080, 1080);

    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 8;
    ctx.strokeRect(30, 30, 1020, 1020);

    ctx.strokeStyle = 'rgba(212, 175, 55, 0.2)';
    ctx.lineWidth = 2;
    ctx.strokeRect(42, 42, 996, 996);

    let titleMain = 'EVALUACIÓN ENERGÉTICA GRATIS';
    let subMain = 'Descubre cuánto puedes ahorrar con Energía Solar';
    let subtitleBottom = 'Accede de inmediato a nuestro cotizador interactivo';
    const repName = currentUser ? currentUser.name : 'Angel Curbelo';
    let footerMain = `Representante Oficial: ${repName}`;

    if (area === 'hh') {
        titleMain = 'EVALUACIÓN DE BIENESTAR H&H';
        subMain = 'Mejora tu calidad de vida y pureza del agua en tu hogar';
        subtitleBottom = 'Accede de inmediato a nuestro cuestionario de salud y bienestar';
    } else if (area === 'rainbow') {
        titleMain = 'PURIFICACIÓN DE AIRE RAINBOW';
        subMain = 'Protege la salud de tu familia eliminando virus y alergias';
        subtitleBottom = 'Accede de inmediato a nuestro cuestionario de purificación';
    }

    ctx.fillStyle = '#d4af37';
    ctx.font = 'bold 54px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(titleMain, 540, 140);

    ctx.fillStyle = '#ffffff';
    ctx.font = '600 36px "Inter", sans-serif';
    ctx.fillText(subMain, 540, 210);

    ctx.fillStyle = '#aaaaaa';
    ctx.font = '30px "Inter", sans-serif';
    ctx.fillText(footerMain, 540, 270);

    QRCode.toDataURL(url, {
        width: 440,
        margin: 2,
        color: { dark: '#000000', light: '#ffffff' }
    }, (err, qrDataUrl) => {
        if (err) {
            console.error(err);
            alert("Error al generar flyer.");
            return;
        }

        const qrImg = new Image();
        qrImg.src = qrDataUrl;
        qrImg.onload = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(300, 340, 480, 480);
            ctx.drawImage(qrImg, 320, 360, 440, 440);

            ctx.fillStyle = '#d4af37';
            ctx.font = 'bold 34px "Inter", sans-serif';
            ctx.fillText('ESCANEA EL CÓDIGO CON TU CELULAR', 540, 890);

            ctx.fillStyle = '#dddddd';
            ctx.font = '26px "Inter", sans-serif';
            ctx.fillText(subtitleBottom, 540, 945);

            ctx.fillStyle = '#777777';
            ctx.font = '22px "Inter", sans-serif';
            ctx.fillText('Angel Curbelo Sales Premium | Asesoría Profesional', 540, 1000);

            const dataUrl = flyerCanvas.toDataURL("image/png");
            const a = document.createElement('a');
            a.href = dataUrl;
            a.download = `Flyer_QR_${area.toUpperCase()}_AngelCurbelo_${new Date().toISOString().split('T')[0]}.png`;
            a.click();
        };
    });
}


