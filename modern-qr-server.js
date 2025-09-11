// Servidor Express para manejar el bot de WhatsApp con QR moderno
const express = require('express');
const { default: makeWASocket, DisconnectReason, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const P = require('pino');
const qrcode = require('qrcode');
const fs = require('fs');
const path = require('path');
const cron = require('node-cron');
const http = require('http');
const { searchYouTubeShorts, downloadYouTubeShort } = require('./youtube-api');
const { enhanceDescription } = require('./gemini-ai');

require('dotenv').config();

// Función para limpiar archivos de autenticación
function cleanAuthFiles() {
  const authPath = path.join(__dirname, 'auth');
  if (fs.existsSync(authPath)) {
    try {
      const files = fs.readdirSync(authPath);
      let deletedCount = 0;
      
      for (const file of files) {
        const filePath = path.join(authPath, file);
        try {
          fs.chmodSync(filePath, 0o666);
          fs.unlinkSync(filePath);
          deletedCount++;
        } catch (fileError) {
          // Intentar con PowerShell como fallback
          try {
            const { exec } = require('child_process');
            exec(`powershell -Command "Remove-Item -Path '${filePath}' -Force"`, (error) => {
              if (!error) deletedCount++;
            });
          } catch (psError) {
            // Silencioso
          }
        }
      }
      
      if (deletedCount > 0) {
        console.log(`🗑️ Archivos de autenticación limpiados (${deletedCount} archivos)`);
      }
    } catch (cleanError) {
      console.error('❌ Error limpiando archivos auth:', cleanError);
    }
  }
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 3000;

// Array para almacenar conexiones SSE
let sseClients = [];

// Middleware
app.use(express.json());
app.use(express.static('public'));

// Variables globales
let sock = null;
let isReady = false;
let connectionStatus = 'disconnected';
let qrString = '';
let connectedUser = null;
let authState = null;
let qrGeneratedAt = null;
let qrTimeout = null;

// Variables para evitar repeticiones
let sentVideos = []; // IDs de videos enviados recientemente
let sentChannels = []; // IDs de canales enviados recientemente
const MAX_SENT_VIDEOS_MEMORY = 50; // Recordar últimos 50 videos
const MAX_SENT_CHANNELS_MEMORY = 10; // Recordar últimos 10 canales

// Variable para rotación secuencial de temas
let currentTopicIndex = 0;

// Función para enviar eventos SSE a todos los clientes conectados
function broadcastSSE(event, data) {
  sseClients.forEach((client, index) => {
    try {
      client.write(`event: ${event}\n`);
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (error) {
      console.error(`❌ Error enviando SSE:`, error.message);
    }
  });
}

// Función para inicializar el cliente de WhatsApp con Baileys
async function initializeWhatsApp() {
  try {
    const { state, saveCreds } = await useMultiFileAuthState('auth');
    authState = { state, saveCreds };
    
    sock = makeWASocket({
      auth: state,
      logger: P({ level: 'fatal' }),
      printQRInTerminal: false,
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 60000,
      markOnlineOnConnect: false,
      syncFullHistory: false,
      fireInitQueries: false,
      generateHighQualityLinkPreview: false,
      shouldIgnoreJid: () => false,
      shouldSyncHistoryMessage: () => false,
      patchMessageBeforeSending: (message) => {
        const requiresPatch = !!(
          message.buttonsMessage ||
          message.templateMessage ||
          message.listMessage
        );
        if (requiresPatch) {
          message = {
            viewOnceMessage: {
              message: {
                messageContextInfo: {
                  deviceListMetadataVersion: 2,
                  deviceListMetadata: {},
                },
                ...message,
              },
            },
          };
        }
        return message;
      }
    });

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;
      
      if (qr) {
        qrString = await qrcode.toDataURL(qr);
        qrGeneratedAt = Date.now();
        
        // Limpiar timeout anterior si existe
        if (qrTimeout) {
          clearTimeout(qrTimeout);
        }
        
        // Enviar nuevo QR a todos los clientes conectados
        broadcastSSE('qr-update', { qr: qrString });
      }
      
      if (connection === 'close') {
        const shouldReconnect = (lastDisconnect?.error)?.output?.statusCode !== DisconnectReason.loggedOut;
        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        
        if (shouldReconnect) {
          setTimeout(() => {
            initializeWhatsApp();
          }, 10000); // Esperar 10 segundos antes de reconectar
        } else {
          connectionStatus = 'disconnected';
          isReady = false;
          connectedUser = null;
          qrString = '';
          
          cleanAuthFiles();
          broadcastSSE('session-closed', { message: 'Sesión cerrada desde celular' });
          
          setTimeout(async () => {
            try {
              await initializeWhatsApp();
            } catch (error) {
              // Silencioso
            }
          }, 15000);
        }
      } else if (connection === 'open') {
        isReady = true;
        connectionStatus = 'connected';
        qrString = '';
        
        // Limpiar timeout de QR ya que se conectó exitosamente
        if (qrTimeout) {
          clearTimeout(qrTimeout);
          qrTimeout = null;
        }
        
        // Obtener información del usuario
        setTimeout(async () => {
          try {
            if (sock && sock.user) {
              // Intentar obtener el nombre del perfil
              let userName = 'Usuario WhatsApp';
              try {
                // Método 1: Obtener pushName del usuario
                if (sock.user.name) {
                  userName = sock.user.name;
                  console.log(`📝 Nombre obtenido de sock.user.name: ${userName}`);
                } else {
                  // Método 2: Obtener información del perfil
                  try {
                    const userInfo = await sock.onWhatsApp(sock.user.id);
                    if (userInfo && userInfo[0] && userInfo[0].name) {
                      userName = userInfo[0].name;
                      console.log(`📝 Nombre obtenido de onWhatsApp: ${userName}`);
                    }
                  } catch (e) {
                    console.log('onWhatsApp falló, intentando getBusinessProfile...');
                  }
                  
                  // Método 3: Obtener desde perfil de negocio
                  if (userName === 'Usuario WhatsApp') {
                    try {
                      const contacts = await sock.getBusinessProfile(sock.user.id);
                      if (contacts && contacts.description) {
                        userName = contacts.description;
                        console.log(`📝 Nombre obtenido de BusinessProfile: ${userName}`);
                      }
                    } catch (e) {
                      console.log('getBusinessProfile falló');
                    }
                  }
                }
                
                console.log(`📝 Nombre final seleccionado: ${userName}`);
              } catch (nameError) {
                console.log('❌ Error obteniendo nombre del perfil:', nameError.message);
                userName = sock.user.name || 'Usuario WhatsApp';
              }
              
              connectedUser = {
                name: userName,
                phone: sock.user.id.split(':')[0],
                id: sock.user.id,
                connected_at: new Date().toISOString()
              };
              broadcastSSE('user-connected', { 
                status: 'connected',
                user: connectedUser 
              });

              // Enviar primer YouTube Short al conectarse
              setTimeout(async () => {
                try {
                  await sendYouTubeShort();
                } catch (error) {
                  // Silencioso
                }
              }, 5000);
            }
          } catch (userError) {
            // Silencioso
          }
        }, 3000);
      }
    });

    sock.ev.on('creds.update', authState.saveCreds);
    
  } catch (error) {
    console.error('Error inicializando cliente WhatsApp:', error);
    connectionStatus = 'error';
  }

}

// Rutas del servidor
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'modern-qr.html'));
});

// Ruta para obtener el código QR
app.get('/qr', async (req, res) => {
  try {
    if (qrString && typeof qrString === 'string' && qrString.length > 0 && qrString.length < 2000) {
      const qrDataUrl = await qrcode.toDataURL(qrString);
      res.json({ success: true, qr: qrDataUrl });
    } else {
      res.json({ success: false, message: 'No hay código QR disponible' });
    }
  } catch (error) {
    console.error('Error generando QR:', error);
    qrString = ''; // Limpiar QR corrupto
    res.status(500).json({ success: false, message: 'Error generando QR' });
  }
});

app.get('/status', (req, res) => {
  try {
    res.setHeader('Content-Type', 'application/json');
    res.json({
      isReady,
      status: connectionStatus,
      hasQR: !!qrString,
      user: connectedUser
    });
  } catch (error) {
    console.error('Error en endpoint /status:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error interno del servidor'
    });
  }
});

// Función mejorada para buscar y enviar YouTube Short con anti-repetición de canales
async function sendYouTubeShort() {
  console.log('🎬 INICIANDO sendYouTubeShort()');
  
  if (!isReady) {
    console.log('❌ Cliente de WhatsApp no está listo');
    console.log('Estado actual:', { isReady, connectionStatus, sock: !!sock });
    return { success: false, message: 'Cliente no está listo' };
  }
  
  console.log('✅ Cliente listo, continuando con envío...');

  try {
    const targetGroupName = process.env.TARGET_GROUP_NAME;
    if (!targetGroupName) {
      throw new Error('TARGET_GROUP_NAME no está configurado en .env');
    }

    // Buscar el grupo objetivo usando Baileys
    console.log('🔍 Buscando grupo objetivo:', targetGroupName);
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats);
    const targetGroup = groups.find(group => 
      group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase())
    );

    if (!targetGroup) {
      console.error('❌ No se encontró el grupo:', targetGroupName);
      throw new Error(`No se encontró el grupo: ${targetGroupName}`);
    }

    console.log(`✅ Grupo encontrado: ${targetGroup.subject}`);

    // Obtener temas desde variables de entorno
    const topicsFromEnv = process.env.YOUTUBE_TOPIC;
    if (!topicsFromEnv) {
      throw new Error('YOUTUBE_TOPIC no está configurado en .env');
    }

    const availableTopics = topicsFromEnv.split(',').map(topic => topic.trim());
    
    // Seleccionar tema ALEATORIO para evitar repetición
    const randomTopicIndex = Math.floor(Math.random() * availableTopics.length);
    const currentTopic = availableTopics[randomTopicIndex];
    console.log(`🎲 Tema ALEATORIO seleccionado: ${currentTopic}`);

    let video = null;
    let allFoundVideos = [];
    const attemptedTopics = [];

    // BÚSQUEDA PRINCIPAL: Tema actual con filtro de canales
    console.log(`🔍 BÚSQUEDA PRINCIPAL: ${currentTopic}`);
    const foundVideos = await searchYouTubeShorts(currentTopic);
    attemptedTopics.push(currentTopic);
    
    if (foundVideos && foundVideos.length > 0) {
      // FILTRO ANTI-REPETICIÓN: Eliminar videos ya enviados
      const newVideos = foundVideos.filter(v => !sentVideos.includes(v.id) && !sentChannels.includes(v.channelId));
      
      console.log(`📹 Videos encontrados: ${foundVideos.length}`);
      console.log(`✅ Videos nuevos (no repetidos): ${newVideos.length}`);
      
      if (newVideos.length > 0) {
        video = newVideos[Math.floor(Math.random() * newVideos.length)];
        console.log(`✅ VIDEO NUEVO SELECCIONADO: "${video.title}" - Canal: "${video.channelTitle}"`);
        allFoundVideos.push(video);
      } else {
        allFoundVideos.push(...foundVideos);
      }
    }

    // BÚSQUEDA DE RESPALDO: Si no encontramos video de canal nuevo
    if (!video) {
      console.log(`🔄 INICIANDO BÚSQUEDA DE RESPALDO...`);
      const maxBackupAttempts = Math.min(3, availableTopics.length - 1);
      
      for (let i = 0; i < maxBackupAttempts && !video; i++) {
        // Seleccionar tema de respaldo ALEATORIO diferente al ya intentado
        let backupTopic;
        let attempts = 0;
        do {
          const randomIndex = Math.floor(Math.random() * availableTopics.length);
          backupTopic = availableTopics[randomIndex];
          attempts++;
        } while (attemptedTopics.includes(backupTopic) && attempts < 10);
        
        if (attemptedTopics.includes(backupTopic)) {
          continue;
        }
        
        console.log(`🔄 Respaldo ALEATORIO ${i + 1}: ${backupTopic}`);
        attemptedTopics.push(backupTopic);
        const backupVideos = await searchYouTubeShorts(backupTopic);
        
        if (backupVideos && backupVideos.length > 0) {
          // FILTRO ANTI-REPETICIÓN para respaldo
          const newBackupVideos = backupVideos.filter(v => !sentVideos.includes(v.id) && !sentChannels.includes(v.channelId));
          
          if (newBackupVideos.length > 0) {
            video = newBackupVideos[Math.floor(Math.random() * newBackupVideos.length)];
            console.log(`✅ RESPALDO NUEVO: "${video.title}" - Canal: "${video.channelTitle}"`);
            allFoundVideos.push(video);
            break;
          } else {
            allFoundVideos.push(...backupVideos);
          }
        }
      }
    }

    // SISTEMA CONSOLIDADO DE FALLBACK CON ANTI-REPETICIÓN
    if (!video && allFoundVideos.length > 0) {
      console.log(`🚨 ACTIVANDO SISTEMA DE FALLBACK CONSOLIDADO`);
      
      // 1. Filtrar videos que ya hemos enviado
      const notRepeatedVideos = allFoundVideos.filter(v => !sentVideos.includes(v.id));
      
      // 2. De los no repetidos, filtrar canales que no hemos usado recientemente
      const newChannelVideos = notRepeatedVideos.filter(v => !sentChannels.includes(v.channelId));
      
      console.log(`📊 Videos totales encontrados: ${allFoundVideos.length}`);
      console.log(`📊 Videos no repetidos: ${notRepeatedVideos.length}`);
      console.log(`✅ Videos de canales nuevos: ${newChannelVideos.length}`);
      
      // PRIORIDAD 1: Videos de canales nuevos (nunca repetidos)
      if (newChannelVideos.length > 0) {
        video = newChannelVideos[Math.floor(Math.random() * newChannelVideos.length)];
        console.log(`✅ FALLBACK CANAL NUEVO: "${video.title}" - Canal: "${video.channelTitle}"`);
      }
      // PRIORIDAD 2: Videos no repetidos (aunque el canal sea conocido)
      else if (notRepeatedVideos.length > 0) {
        video = notRepeatedVideos[Math.floor(Math.random() * notRepeatedVideos.length)];
        console.log(`⚠️ FALLBACK CANAL CONOCIDO: "${video.title}" - Canal: "${video.channelTitle}"`);
      }
      // ÚLTIMO RECURSO: Cualquier video (repetido)
      else {
        video = allFoundVideos[Math.floor(Math.random() * allFoundVideos.length)];
        console.log(`🚨 FALLBACK REPETIDO: "${video.title}" - Canal: "${video.channelTitle}"`);
      }
    }

    // FALLBACK FINAL: Si no hay videos, buscar sin filtros estrictos
    if (!video) {
      console.log(`🆘 FALLBACK FINAL: Buscando sin filtros estrictos`);
      try {
        const fallbackVideos = await searchYouTubeShorts('programación', 10);
        if (fallbackVideos && fallbackVideos.length > 0) {
          video = fallbackVideos[0];
          console.log(`✅ FALLBACK FINAL: "${video.title}" - Canal: "${video.channelTitle}"`);
        }
      } catch (fallbackError) {
        console.log('❌ Fallback final falló:', fallbackError.message);
      }
    }

    // GARANTÍA ABSOLUTA: Crear video dummy si todo falla
    if (!video) {
      console.log(`🔴 CREANDO VIDEO DUMMY PARA GARANTIZAR ENVÍO`);
      const dummyMessage = `🤖 *Bot de Noticias Activo*\n\n⏰ ${new Date().toLocaleString('es-ES')}\n\n📢 El bot está funcionando correctamente.\nPróximo video en 3 horas.\n\n🔄 Sistema automático cada 3 horas.`;
      
      // Enviar mensaje de texto como fallback
      await sock.sendMessage(targetGroup.id, { text: dummyMessage });
      console.log(`✅ MENSAJE DUMMY ENVIADO`);
      
      return {
        success: true,
        message: 'Mensaje de estado enviado (fallback)',
        video: { title: 'Estado del Bot', username: 'Sistema' }
      };
    }

    console.log(`Descargando video: ${video.url}`);
    const outputPath = path.join(__dirname, 'downloads', `${video.id}.mp4`);
    await downloadYouTubeShort(video.url, outputPath);
    if (!outputPath || !fs.existsSync(outputPath)) {
      throw new Error('Error al descargar el video');
    }

    // Generar descripción mejorada con Gemini AI
    let enhancedDescription;
    try {
      const { enhanceDescription } = require('./gemini-ai');
      enhancedDescription = await enhanceDescription(video.title, video.description, video.topic);
    } catch (geminiError) {
      // Silenciar errores de Gemini AI para reducir ruido en logs
      enhancedDescription = `🎬 *${video.title}*\n\n📺 Canal: ${video.channelTitle || 'Canal desconocido'}\n\n${video.description || 'Video sobre ' + video.topic}`;
    }

    // Leer el archivo de video descargado
    const videoBuffer = fs.readFileSync(outputPath);
    
    // Enviar video como archivo
    await sock.sendMessage(targetGroup.id, {
      video: videoBuffer,
      caption: enhancedDescription,
      mimetype: 'video/mp4'
    });
    
    // SISTEMA ROBUSTO ANTI-REPETICIÓN - REGISTRAR DESPUÉS DEL ENVÍO EXITOSO
    if (video.id && !sentVideos.includes(video.id)) {
      sentVideos.push(video.id);
      if (sentVideos.length > MAX_SENT_VIDEOS_MEMORY) {
        sentVideos = sentVideos.slice(-MAX_SENT_VIDEOS_MEMORY);
      }
      console.log(`📝 Video ${video.id} registrado. Total videos recordados: ${sentVideos.length}`);
    }
    
    if (video.channelId && !sentChannels.includes(video.channelId)) {
      sentChannels.push(video.channelId);
      if (sentChannels.length > MAX_SENT_CHANNELS_MEMORY) {
        sentChannels = sentChannels.slice(-MAX_SENT_CHANNELS_MEMORY);
      }
      console.log(`🏷️ Canal ${video.channelId} registrado. Total canales recordados: ${sentChannels.length}`);
    }
    
    console.log(`✅ Video enviado: "${video.title}" - ${video.channelTitle}`);
    
    // Eliminar el archivo después de enviarlo
    try { 
      fs.unlinkSync(outputPath); 
      console.log('📁 Archivo temporal eliminado');
    } catch (e) { 
      console.log('⚠️ No se pudo eliminar archivo temporal:', e.message);
    }
    
    return { 
      success: true, 
      message: 'YouTube Short enviado correctamente', 
      video: {
        title: video.title,
        username: video.username,
        channelId: video.channelId,
        topic: video.topic,
        publishedAt: video.publishedAt
      }
    };

  } catch (error) {
    console.error('Error enviando YouTube Short:', error);
    
    // Enviar mensaje de error al grupo como fallback
    try {
      if (isReady && sock) {
        const targetGroupName = process.env.TARGET_GROUP_NAME;
        const chats = await sock.groupFetchAllParticipating();
        const groups = Object.values(chats);
        const targetGroup = groups.find(group => group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase()));
        
        if (targetGroup) {
          await sock.sendMessage(targetGroup.id, { text: `❌ Error enviando video: ${error.message}` });
        }
      }
    } catch (fallbackError) {
      console.error('Error enviando mensaje de fallback:', fallbackError);
    }
    
    return { success: false, message: error.message };
  }
}

// Ruta para enviar YouTube Short manualmente
app.post('/send-youtube-short', async (req, res) => {
  console.log('🚀 INICIO - Solicitud de envío de video recibida desde interfaz web');
  console.log('📱 Estado del cliente:', { isReady, connectionStatus, sockExists: !!sock });
  console.log('👤 Usuario conectado:', connectedUser);
  
  try {
    const result = await sendYouTubeShort();
    console.log('✅ RESULTADO del envío:', result);
    res.json(result);
  } catch (error) {
    console.error('❌ ERROR CRÍTICO en endpoint /send-youtube-short:', error.message);
    console.error('Stack trace completo:', error.stack);
    res.status(500).json({ 
      success: false, 
      message: 'Error interno del servidor',
      error: error.message 
    });
  }
});

// Endpoint para cerrar sesión
app.post('/logout', async (req, res) => {
  console.log('🔓 Solicitud de logout recibida');
  try {
    if (sock) {
      await sock.logout();
      console.log('✅ Logout ejecutado correctamente');
    }
    
    // Resetear variables
    isReady = false;
    connectionStatus = 'disconnected';
    connectedUser = null;
    qrString = '';
    
    // Usar función centralizada para limpiar archivos
    cleanAuthFiles();
    
    // Reinicializar para generar nuevo QR
    setTimeout(async () => {
      console.log('🔄 Regenerando conexión WhatsApp tras logout manual...');
      try {
        await initializeWhatsApp();
      } catch (error) {
        console.error('Error al regenerar conexión tras logout:', error.message);
      }
    }, 1000);
    
    res.json({ success: true, message: 'Sesión cerrada correctamente' });
  } catch (error) {
    console.error('❌ Error en logout:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al cerrar sesión',
      error: error.message 
    });
  }
});

// Configurar programación automática ROBUSTA cada 3 horas
if (process.env.SCHEDULE) {
  console.log(`⏰ Configurando cron job robusto: ${process.env.SCHEDULE}`);
  
  cron.schedule(process.env.SCHEDULE, async () => {
    console.log('🔄 CRON JOB EJECUTÁNDOSE - Enviando video programado...');
    try {
      await sendYouTubeShort();
      console.log('✅ Video enviado por cron job exitosamente');
    } catch (error) {
      console.error('❌ ERROR en cron job:', error.message);
      // Reintentar una vez después de 30 segundos
      setTimeout(async () => {
        try {
          console.log('🔄 REINTENTANDO envío por cron job...');
          await sendYouTubeShort();
          console.log('✅ Video enviado en reintento exitosamente');
        } catch (retryError) {
          console.error('❌ ERROR en reintento de cron job:', retryError.message);
        }
      }, 30000);
    }
  }, {
    scheduled: true,
    timezone: "America/New_York"
  });
  
  console.log('✅ Cron job configurado y activo');
}

// Endpoint para probar SSE manualmente
app.get('/test-sse', (req, res) => {
  broadcastSSE('test', { message: 'Test SSE funcionando' });
  res.json({ success: true, message: 'Evento SSE de prueba enviado' });
});

// Endpoint para probar video-sent manualmente
app.get('/test-video', (req, res) => {
  broadcastSSE('video-sent', {
    title: 'Video de Prueba',
    channelTitle: 'Canal de Prueba',
    topic: 'test',
    description: '🎬 *Video de Prueba*\n\nEste es un video de prueba para verificar la funcionalidad.',
    publishedAt: new Date().toISOString(),
    sentAt: new Date().toISOString()
  });
  res.json({ success: true, message: 'Evento video-sent de prueba enviado' });
});

// Endpoint para refrescar QR manualmente
app.get('/refresh-qr', async (req, res) => {
  try {
    console.log('🔄 Solicitud de refresh QR recibida');
    
    if (sock) {
      // Forzar regeneración de QR cerrando y reiniciando
      await sock.logout();
      console.log('✅ Logout forzado para regenerar QR');
      
      // Limpiar archivos auth
      cleanAuthFiles();
      
      // Reinicializar después de un momento
      setTimeout(async () => {
        console.log('🔄 Regenerando conexión WhatsApp tras refresh QR...');
        try {
          await initializeWhatsApp();
        } catch (error) {
          console.error('Error al regenerar conexión tras refresh:', error.message);
        }
      }, 2000);
      
      res.json({ success: true, message: 'QR refresh iniciado' });
    } else {
      // Si no hay socket, solo reinicializar
      console.log('🔄 Reinicializando WhatsApp...');
      initializeWhatsApp();
      res.json({ success: true, message: 'Inicializando WhatsApp' });
    }
  } catch (error) {
    console.error('❌ Error en refresh QR:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error al refrescar QR',
      error: error.message 
    });
  }
});

// Endpoint para Server-Sent Events
app.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Cache-Control'
  });

  // Agregar cliente a la lista
  sseClients.push(res);

  // Enviar estado inicial
  res.write(`event: connection\n`);
  res.write(`data: ${JSON.stringify({ 
    status: connectionStatus, 
    qr: qrString,
    user: connectedUser 
  })}\n\n`);

  // Limpiar cliente cuando se desconecta
  req.on('close', () => {
    sseClients = sseClients.filter(client => client !== res);
  });
});

// Inicializar WhatsApp y servidor
initializeWhatsApp();

app.listen(PORT, () => {
  console.log(`Servidor ejecutándose en http://localhost:${PORT}`);
  console.log('Abre el navegador para escanear el código QR');
});
