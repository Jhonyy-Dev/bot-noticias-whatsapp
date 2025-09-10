require('dotenv').config();
const { default: makeWASocket, useMultiFileAuthState, DisconnectReason } = require('@whiskeysockets/baileys');
const pino = require('pino');
const qrcode = require('qrcode-terminal');
const fs = require('fs');
const path = require('path');

// Ensure auth directory exists and delete it if it exists
const AUTH_FOLDER = path.join(__dirname, 'auth');
if (fs.existsSync(AUTH_FOLDER)) {
  console.log('Eliminando carpeta de autenticación para forzar un nuevo QR...');
  fs.rmSync(AUTH_FOLDER, { recursive: true, force: true });
}

// Crear la carpeta de autenticación
fs.mkdirSync(AUTH_FOLDER, { recursive: true });

// Store group information
let targetGroup = null;
const TARGET_GROUP_NAME = 'Block';

/**
 * Finds a group by name in the list of chats
 * @param {Object} sock - WhatsApp socket connection
 * @param {string} groupName - Name of the group to find
 * @returns {Promise<string|null>} - Group JID if found, null otherwise
 */
async function findGroupByName(sock, groupName) {
  try {
    // Get all chats
    const chats = await sock.groupFetchAllParticipating();
    
    // Look for the target group
    for (const [id, chat] of Object.entries(chats)) {
      if (chat.subject && chat.subject.toLowerCase().includes(groupName.toLowerCase())) {
        console.log(`Grupo encontrado: ${chat.subject} (${id})`);
        return id;
      }
    }
    
    console.log(`Grupo '${groupName}' no encontrado`);
    return null;
  } catch (error) {
    console.error('Error buscando grupo:', error);
    return null;
  }
}

// Initialize WhatsApp connection
async function connectToWhatsApp() {
  try {
    // Use the saved authentication info
    const { state, saveCreds } = await useMultiFileAuthState(AUTH_FOLDER);
    
    // Create a new connection
    const sock = makeWASocket({
      printQRInTerminal: true, // Print QR in terminal
      auth: state,
      logger: pino({ level: 'warn' }) // For less verbose logs
    });
    
    // Handle connection events
    sock.ev.on('connection.update', (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      // If there's a QR code, generate it in the terminal
      if (qr) {
        console.log('\n\n==== ESCANEA ESTE CÓDIGO QR PARA CONECTAR ====\n');
        qrcode.generate(qr, { small: false }); // Usar tamaño normal para mejor visualización
        console.log('\n==============================================\n');
      }
      
      // Handle connection state changes
      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode;
        console.log(`Conexión cerrada con código: ${statusCode}`);
        
        // Check specific error conditions
        if (statusCode === DisconnectReason.loggedOut) {
          console.log('Sesión cerrada. Reinicia el script para generar un nuevo QR.');
        } else {
          console.log('Reconectando...');
          connectToWhatsApp();
        }
      } else if (connection === 'open') {
        console.log('¡Conexión a WhatsApp establecida!');
        console.log('El bot está listo para enviar mensajes.');
        
        // Find the target group
        (async () => {
          try {
            targetGroup = await findGroupByName(sock, TARGET_GROUP_NAME);
            if (targetGroup) {
              console.log(`Grupo objetivo '${TARGET_GROUP_NAME}' encontrado con ID: ${targetGroup}`);
              console.log('\nPara enviar una noticia al grupo, ejecuta: node index.js');
            } else {
              console.log(`\nGrupo objetivo '${TARGET_GROUP_NAME}' no encontrado. Asegúrate de ser miembro de este grupo.`);
            }
          } catch (error) {
            console.error('Error buscando grupo objetivo:', error);
          }
        })();
      }
    });
    
    // Save credentials whenever they are updated
    sock.ev.on('creds.update', saveCreds);
    
    return sock;
  } catch (error) {
    console.error('Error conectando a WhatsApp:', error);
    return null;
  }
}

/**
 * Gets the target group JID
 * @returns {string|null} - Group JID if found, null otherwise
 */
function getTargetGroup() {
  return targetGroup;
}

// Start the WhatsApp connection
const startWhatsApp = async () => {
  console.log('Iniciando bot de WhatsApp...');
  console.log('Por favor espera a que aparezca el código QR...');
  global.waSocket = await connectToWhatsApp();
};

// If this script is run directly, start the WhatsApp connection
if (require.main === module) {
  startWhatsApp();
} else {
  // Export for use in other files
  module.exports = { startWhatsApp, getTargetGroup };
}
