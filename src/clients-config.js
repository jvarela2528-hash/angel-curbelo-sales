export const CLIENTS = {
    'master': {
        id: 'master',
        name: 'Control Maestro HQ',
        password: 'hq2026',
        role: 'master',
        allowedSources: 'all',
        sections: ['leads', 'marketing', 'stats', 'archive', 'manual-entry', 'qr']
    },
    'angel': {
        id: 'angel',
        name: 'Angel Curbelo',
        password: 'angel2026',
        role: 'client',
        allowedSources: 'all',
        sections: ['leads', 'marketing', 'stats', 'archive', 'manual-entry', 'qr']
    },
    'papi': {
        id: 'papi',
        name: 'Papi Solar',
        password: 'papi2026',
        role: 'client',
        allowedSources: ['direct', 'cuestionario-web'],
        restrictedToProduct: 'Solar',
        sections: ['leads']
    }
    // Future clients can be added here
};
