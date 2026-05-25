import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    name: '',
    phone: '',
    municipio: '',
    consumo: '',
    isOwner: 'si',
    roofType: '',
    credit: '',
    battery: '',
    status: 'Nuevo',
    source: new URLSearchParams(window.location.search).get('src') || 'direct'
};

// --- Form Navigation ---
window.nextStep = (current, next) => {
    document.getElementById(`step-${current}`).classList.remove('active');
    document.getElementById(`step-${next}`).classList.add('active');
    updateProgress((next / 7) * 100);
}

window.setDueno = (val) => { currentLeadData.isOwner = val; }
window.setConsumo = (val) => { currentLeadData.consumo = val; }
window.setField = (field, val) => { currentLeadData[field] = val; }

window.showRenterFlow = () => {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById('step-renter').classList.add('active');
    updateProgress(80);
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
}

// --- Submission Logic ---
async function submitLead(isRenter = false) {
    const btn = isRenter ? document.getElementById('submit-renter-btn') : document.getElementById('submit-btn');
    btn.disabled = true;
    btn.innerText = 'Enviando...';

    try {
        if (isRenter) {
            currentLeadData.name = document.getElementById('renter-name').value;
            currentLeadData.phone = document.getElementById('renter-phone').value;
            currentLeadData.municipio = document.getElementById('renter-municipio').value;
            currentLeadData.status = 'No Califica: Renta';
        } else {
            currentLeadData.name = document.getElementById('full-name').value;
            currentLeadData.phone = document.getElementById('phone').value;
            currentLeadData.municipio = document.getElementById('municipio').value;
        }

        if (!currentLeadData.name || !currentLeadData.phone) {
            alert('Por favor completa los datos de contacto.');
            btn.disabled = false;
            btn.innerText = isRenter ? 'Deseo Información Alternativa' : 'Obtener Mi Análisis Gratis';
            return;
        }

        // GUARDADO SEGURO: 
        // Las alertas ahora se manejan automáticamente en el servidor (Cloud Functions)
        // para mayor seguridad y profesionalismo.
        // Calcular Score para el CRM y Notificaciones
        const score = (currentLeadData.isOwner === 'si' ? 50 : 0) + 
                      (currentLeadData.consumo.includes('$351') ? 30 : currentLeadData.consumo.includes('$201') ? 15 : 0) +
                      (currentLeadData.credit?.includes('Excelente') ? 20 : 0) +
                      (currentLeadData.battery === 'Sí' ? 10 : 0);
        
        let scoreLabel = '❄️ Cold';
        if (score >= 80) scoreLabel = '🔥 Hot';
        else if (score >= 50) scoreLabel = '☀️ Warm';

        await addDoc(collection(db, 'leads'), {
            ...currentLeadData,
            score: score,
            scoreLabel: scoreLabel,
            createdAt: serverTimestamp()
        });

        // Show Success
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById('step-success').classList.add('active');
        updateProgress(100);

    } catch (error) {
        console.error("Error al enviar:", error);
        alert('Hubo un error. Intenta de nuevo.');
        btn.disabled = false;
        btn.innerText = 'Reintentar';
    }
}

document.getElementById('submit-btn')?.addEventListener('click', () => submitLead(false));
document.getElementById('submit-renter-btn')?.addEventListener('click', () => submitLead(true));
