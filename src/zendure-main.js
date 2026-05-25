import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    name: '',
    phone: '',
    municipio: '',
    equipos: '',
    horasRespaldo: '',
    isOwner: 'si',
    status: 'nuevo',
    source: new URLSearchParams(window.location.search).get('src') || 'zendure-pr',
    clientId: new URLSearchParams(window.location.search).get('cid') || 'angel'
};

const TOTAL_STEPS = 5;

// --- Form Navigation ---
window.nextStep = (current, next) => {
    document.getElementById(`step-${current}`).classList.remove('active');
    document.getElementById(`step-${next}`).classList.add('active');
    updateProgress((next / TOTAL_STEPS) * 100);
}

window.setDueno = (val) => { currentLeadData.isOwner = val; }
window.setEquipos = (val) => { currentLeadData.equipos = val; }
window.setHoras = (val) => { currentLeadData.horasRespaldo = val; }

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
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerText = 'Enviando...';

    try {
        const isOwner = isRenter ? 'no' : currentLeadData.isOwner;
        const consumo = currentLeadData.consumo;
        const credit = currentLeadData.credit;
        console.log("Valores capturados:", { isOwner, consumo, credit });

        if (isRenter) {
            currentLeadData.name = document.getElementById('renter-name').value;
            currentLeadData.phone = document.getElementById('renter-phone').value;
            currentLeadData.municipio = document.getElementById('renter-municipio').value;
            currentLeadData.status = 'nuevo';
            currentLeadData.razon_descarte = '';
        } else {
            currentLeadData.name = document.getElementById('full-name').value;
            currentLeadData.phone = document.getElementById('phone').value;
            currentLeadData.municipio = document.getElementById('municipio').value;
            currentLeadData.status = 'nuevo';
            currentLeadData.razon_descarte = '';
        }

        if (!currentLeadData.name || !currentLeadData.phone) {
            alert('Por favor completa los datos de contacto.');
            btn.disabled = false;
            btn.innerText = isRenter ? 'Deseo Más Información' : 'Cotizar Mi Respaldo';
            return;
        }

        currentLeadData.email = isRenter 
            ? (document.getElementById('renter-email')?.value || '')
            : (document.getElementById('email')?.value || '');

        // GUARDADO EN FIRESTORE
        await addDoc(collection(db, 'leads'), {
            ...currentLeadData,
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
