import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    name: '',
    phone: '',
    municipio: '',
    hasPets: '',
    hasAlergias: '',
    status: 'nuevo',
    source: new URLSearchParams(window.location.search).get('src') || 'rainbow-pr',
    clientId: new URLSearchParams(window.location.search).get('cid') || 'angel'
};

const TOTAL_STEPS = 4;

// --- Form Navigation ---
window.nextStep = (current, next) => {
    document.getElementById(`step-${current}`).classList.remove('active');
    document.getElementById(`step-${next}`).classList.add('active');
    updateProgress((next / TOTAL_STEPS) * 100);
}

window.setHasPets = (val) => { currentLeadData.hasPets = val; }
window.setAlergias = (val) => { currentLeadData.hasAlergias = val; }

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
}

// --- Submission Logic ---
async function submitLead() {
    const btn = document.getElementById('submit-btn');
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerText = 'Procesando...';

    try {
        currentLeadData.name = document.getElementById('full-name').value;
        currentLeadData.phone = document.getElementById('phone').value;
        currentLeadData.municipio = document.getElementById('municipio').value;

        if (!currentLeadData.name || !currentLeadData.phone) {
            alert('Por favor completa tu nombre y teléfono.');
            btn.disabled = false;
            btn.innerText = 'Solicitar Demostración Gratis';
            return;
        }

        currentLeadData.email = document.getElementById('email')?.value || '';

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
        alert('Error de conexión. Intenta de nuevo.');
        btn.disabled = false;
        btn.innerText = 'Reintentar';
    }
}

document.getElementById('submit-btn')?.addEventListener('click', submitLead);
