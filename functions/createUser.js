const admin = require('firebase-admin');

// Inicializar la aplicación si no está inicializada
if (!admin.apps.length) {
    admin.initializeApp();
}

const db = admin.firestore();

async function createUser(email, password, name, role = 'vendedor', clientId = 'angel') {
    try {
        console.log(`Creando usuario en Firebase Auth: ${email}...`);
        
        // Crear usuario en Firebase Authentication
        const userRecord = await admin.auth().createUser({
            email: email,
            password: password,
            displayName: name,
        });

        console.log(`Usuario autenticado creado con UID: ${userRecord.uid}`);
        console.log('Guardando perfil en Firestore...');

        // Guardar el perfil en Firestore
        await db.collection('users').doc(userRecord.uid).set({
            name: name,
            email: email,
            role: role,
            clientId: clientId,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            disabled: false,
        });

        console.log('✅ ¡Usuario creado y configurado exitosamente!');
        console.log('--------------------------------------------------');
        console.log(`Email: ${email}`);
        console.log(`Contraseña: ${password}`);
        console.log(`Rol: ${role}`);
        console.log('--------------------------------------------------');
        
        process.exit(0);
    } catch (error) {
        console.error('❌ Error al crear el usuario:', error.message);
        process.exit(1);
    }
}

// Obtener argumentos de la línea de comandos
const args = process.argv.slice(2);

if (args.length < 3) {
    console.log("Uso incorrecto. Faltan parámetros.");
    console.log("Comando: node createUser.js <email> <password> <name> [role] [clientId]");
    console.log("Ejemplo: node createUser.js juan@test.com 123456 \"Juan Perez\" vendedor angel");
    process.exit(1);
}

const email = args[0];
const password = args[1];
const name = args[2];
const role = args[3] || 'vendedor';
const clientId = args[4] || 'angel';

createUser(email, password, name, role, clientId);
