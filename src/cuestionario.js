import './style.css'
import { db } from './firebase-config'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'

let currentLeadData = {
    primary_interest: '',
    property_status: '',
    avg_bill: '', // Para Solar
    health_conditions: [],
    dust_problem: '',
    ambience_methods: [],
    water_quality: '',
    water_source: '',
    preferred_day: '',
    preferred_time: '',
    age_range: '',
    civil_status: '',
    income_source: '',
    name: '',
    phone: '',
    municipio: '',
    status: 'Nuevo',
    type: 'Cuestionario Completo',
    source: new URLSearchParams(window.location.search).get('src') || 'cuestionario-web',
    clientId: new URLSearchParams(window.location.search).get('cid') || 'angel' // Dynamic client assignment
};

// --- URL Parameter Auto-Routing ---
window.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const branch = params.get('branch');
    
    if (branch) {
        if (branch === 'solar') {
            currentLeadData.primary_interest = 'Solar';
            window.nextStep(1, 2);
        } else if (branch === 'hh') {
            currentLeadData.primary_interest = 'H&H';
            window.nextStep(1, 2);
        } else if (branch === 'rainbow') {
            currentLeadData.primary_interest = 'Rainbow';
            window.nextStep(1, 2);
        }
    }
});

const TOTAL_STEPS = 11;

// --- Global Helpers ---
window.saveData = (field, value, element) => {
    currentLeadData[field] = value;
    
    // Visual feedback for single-select
    if (element && element.classList.contains('option-btn')) {
        const container = element.closest('.options-grid');
        if (container) {
            container.querySelectorAll('.option-btn').forEach(btn => btn.classList.remove('selected'));
            element.classList.add('selected');
        }
    }
}

window.handleBranch = (branch) => {
    currentLeadData.primary_interest = branch;
    window.nextStep(1, 2);
}

window.handleRenterPath = () => {
    const msg = document.getElementById('renter-msg');
    if (currentLeadData.primary_interest === 'Solar') {
        msg.innerText = "Aunque no sea dueño, existen alternativas de ahorro energético para arrendatarios. Angel se comunicará para orientarle.";
        window.nextStep(2, 4);
    } else {
        // Renters can still benefit from Health products
        window.nextStep(2, 5);
    }
}

window.handleLogisticsBack = () => {
    if (currentLeadData.primary_interest === 'Solar') {
        window.prevStep(8, 3);
    } else {
        window.prevStep(8, 7);
    }
}

window.nextStep = (current, next) => {
    let target = next;

    // Dynamic Skipping Logic
    if (current === 2 && next === 3) {
        if (currentLeadData.primary_interest !== 'Solar' && currentLeadData.primary_interest !== 'Ambas') {
            target = 5; // Skip solar bill, go to health
        }
    }
    
    if (current === 3 && next === 4) {
        if (currentLeadData.primary_interest === 'Solar') {
            target = 8; // Skip health, go to logistics
        } else {
            target = 5; // Go to health
        }
    }

    if (current === 4 && next === 5) {
        target = 8; // From renter info, go to logistics
    }

    if (current === 7 && next === 8) {
        target = 8;
    }

    const nextId = `step-${target}`;
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const nextEl = document.getElementById(nextId);
    if (nextEl) nextEl.classList.add('active');
    
    // Update progress
    const percent = (target / TOTAL_STEPS) * 100;
    updateProgress(percent);
}

window.prevStep = (current, prev) => {
    let target = prev;

    // Dynamic Backward Logic
    if (current === 5 && prev === 2) {
        if (currentLeadData.primary_interest === 'Solar' || currentLeadData.primary_interest === 'Ambas') {
            target = 3;
        }
    }
    
    if (current === 8 && prev === 7) {
        if (currentLeadData.primary_interest === 'Solar') {
            target = 3;
        }
    }

    const prevId = `step-${target}`;
    document.querySelectorAll('.step').forEach(s => s.classList.remove('active'));
    const prevEl = document.getElementById(prevId);
    if (prevEl) prevEl.classList.add('active');

    const percent = (target / TOTAL_STEPS) * 100;
    updateProgress(percent);
}

function updateProgress(percent) {
    const bar = document.getElementById('progress-bar');
    if (bar) bar.style.width = `${percent}%`;
}

// --- Multi-Select Logic ---
document.querySelectorAll('.multi-select').forEach(btn => {
    btn.addEventListener('click', () => {
        const field = btn.dataset.field;
        const value = btn.dataset.value;

        if (!currentLeadData[field]) {
            currentLeadData[field] = [];
        }

        const index = currentLeadData[field].indexOf(value);
        if (index > -1) {
            currentLeadData[field].splice(index, 1);
            btn.classList.remove('selected');
        } else {
            if (value === 'Ninguna') {
                currentLeadData[field] = ['Ninguna'];
                btn.parentElement.querySelectorAll('.multi-select').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
            } else {
                const noneIndex = currentLeadData[field].indexOf('Ninguna');
                if (noneIndex > -1) {
                    currentLeadData[field].splice(noneIndex, 1);
                    btn.parentElement.querySelector('[data-value="Ninguna"]').classList.remove('selected');
                }
                currentLeadData[field].push(value);
                btn.classList.add('selected');
            }
        }
    });
});

// --- Submission ---
async function submitForm() {
    const btn = document.getElementById('submit-btn');
    const name = document.getElementById('full-name').value;
    const phone = document.getElementById('phone').value;
    const municipio = document.getElementById('municipio').value;

    if (!name || !phone || !municipio) {
        alert('Por favor, complete sus datos de contacto.');
        return;
    }

    btn.disabled = true;
    btn.innerText = 'Procesando...';

    try {
        currentLeadData.name = name;
        currentLeadData.phone = phone;
        currentLeadData.email = document.getElementById('email')?.value || '';
        currentLeadData.municipio = municipio;

        // Categorize for CRM display
        if (currentLeadData.primary_interest === 'Solar') currentLeadData.type = 'Lead Solar';
        else if (currentLeadData.primary_interest === 'Rainbow') currentLeadData.type = 'Lead Rainbow';
        else if (currentLeadData.primary_interest === 'H&H') currentLeadData.type = 'Lead H&H';
        else currentLeadData.type = 'Lead Salud Integral';

        // Save to Firestore
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
        alert('Hubo un error al enviar su evaluación. Por favor intente de nuevo.');
        btn.disabled = false;
        btn.innerText = 'Enviar Evaluación';
    }
}

document.getElementById('submit-btn')?.addEventListener('click', submitForm);
