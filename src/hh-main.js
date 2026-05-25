import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    name: '',
    phone: '',
    municipio: '',
    prioridad: '',
    hasAlergias: '',
    equipos: '',
    horasRespaldo: '',
    isOwner: 'si',
    status: 'nuevo',
    source: new URLSearchParams(window.location.search).get('src') || 'hh-integral',
    clientId: new URLSearchParams(window.location.search).get('cid') || 'angel'
};

const TOTAL_STEPS = 7;

// --- Form Navigation ---
window.nextStep = (current, next) => {
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    document.getElementById(`step-${next}`).classList.add('active');
    updateProgress((next / TOTAL_STEPS) * 100);
}

window.setDueno = (val) => { currentLeadData.isOwner = val; }
window.setPrioridad = (val) => { currentLeadData.prioridad = val; }
window.setAlergias = (val) => { currentLeadData.hasAlergias = val; }
window.setEquipos = (val) => { currentLeadData.equipos = val; }
window.setHoras = (val) => { currentLeadData.horasRespaldo = val; }

window.checkNextFromSalud = () => {
    if (currentLeadData.prioridad === 'Todo') {
        nextStep(4, 5); // Ir a Zendure
    } else {
        nextStep(4, 7); // Ir a Contacto
    }
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
}

// --- Submission Logic ---
async function submitLead() {
    const btn = document.getElementById('submit-btn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerText = 'Enviando...';

    try {
        currentLeadData.name = document.getElementById('full-name').value;
        currentLeadData.phone = document.getElementById('phone').value;
        currentLeadData.municipio = document.getElementById('municipio').value;

        if (!currentLeadData.name || !currentLeadData.phone) {
            alert('Por favor completa los datos de contacto.');
            btn.disabled = false;
            btn.innerText = 'Obtener Propuesta Gratis';
            return;
        }

        currentLeadData.email = document.getElementById('email')?.value || '';

        let status = "nuevo";
        let razon_descarte = "";
        
        const isOwner = currentLeadData.isOwner;
        const consumo = currentLeadData.consumo;
        const credit = currentLeadData.credit;
        console.log("Valores capturados:", { isOwner, consumo, credit });

        if (currentLeadData.isOwner === 'no' || currentLeadData.isOwner === 'No') {
            status = "no_cualificado";
            razon_descarte = "No cualificado por: No es dueño de propiedad";
        }

        // GUARDADO EN FIRESTORE
        await addDoc(collection(db, 'leads'), {
            ...currentLeadData,
            status,
            razon_descarte,
            createdAt: serverTimestamp()
        });

        // Show Success
        document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
        document.getElementById('step-success').classList.add('active');
        updateProgress(100);

    } catch (error) {
        console.error("Error al enviar:", error);
        alert('Error al procesar tu solicitud.');
        btn.disabled = false;
        btn.innerText = 'Reintentar';
    }
}

document.getElementById('submit-btn')?.addEventListener('click', submitLead);
