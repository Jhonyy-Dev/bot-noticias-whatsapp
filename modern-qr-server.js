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
    
    // Logger silencioso para Baileys pero permitir logs críticos del bot
    const silentLogger = {
      fatal: () => {},
      error: () => {},
      warn: () => {},
      info: () => {},
      debug: () => {},
      trace: () => {},
      child: () => silentLogger
    };

    sock = makeWASocket({
      auth: state,
      logger: silentLogger,
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
                
                console.log(`✅ BOT CONECTADO: ${userName}`);
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

              // Enviar primer video inmediatamente
              setTimeout(async () => {
                try {
                  console.log('🎬 ENVIANDO PRIMER VIDEO...');
                  const result = await sendYouTubeShort();
                  if (result.success) {
                    console.log('✅ PRIMER VIDEO ENVIADO');
                  } else {
                    console.log('❌ ERROR PRIMER VIDEO:', result.message);
                  }
                } catch (error) {
                  console.log('❌ ERROR PRIMER VIDEO:', error.message);
                }
              }, 3000);
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
  if (!isReady) {
    console.log('❌ CLIENTE NO LISTO');
    return { success: false, message: 'Cliente no está listo' };
  }

  try {
    const targetGroupName = process.env.TARGET_GROUP_NAME;
    if (!targetGroupName) {
      throw new Error('TARGET_GROUP_NAME no está configurado en .env');
    }

    // Buscar grupo objetivo
    const chats = await sock.groupFetchAllParticipating();
    const groups = Object.values(chats);
    const targetGroup = groups.find(group => 
      group.subject && group.subject.toLowerCase().includes(targetGroupName.toLowerCase())
    );

    if (!targetGroup) {
      console.error('❌ No se encontró el grupo:', targetGroupName);
      throw new Error(`No se encontró el grupo: ${targetGroupName}`);
    }

    console.log(`✅ GRUPO: ${targetGroup.subject}`);

    // Obtener temas desde variables de entorno
    const topicsFromEnv = process.env.YOUTUBE_TOPIC;
    if (!topicsFromEnv) {
      throw new Error('YOUTUBE_TOPIC no está configurado en .env');
    }

    const availableTopics = topicsFromEnv.split(',').map(topic => topic.trim());
    
    // Rotación de temas
    const currentTopic = availableTopics[currentTopicIndex];
    console.log(`🔄 TEMA ${currentTopicIndex + 1}/${availableTopics.length}: ${currentTopic}`);
    currentTopicIndex = (currentTopicIndex + 1) % availableTopics.length;

    let video = null;
    let allFoundVideos = [];
    const attemptedTopics = [];

    // Búsqueda principal
    const foundVideos = await searchYouTubeShorts(currentTopic);
    attemptedTopics.push(currentTopic);
    
    if (foundVideos && foundVideos.length > 0) {
      const videosFromNewChannels = foundVideos.filter(v => !sentChannels.includes(v.channelId));
      
      if (videosFromNewChannels.length > 0) {
        video = videosFromNewChannels[Math.floor(Math.random() * videosFromNewChannels.length)];
        console.log(`🎯 SELECCIONADO: "${video.title}" - ${video.username}`);
        allFoundVideos.push(video);
      } else {
        allFoundVideos.push(...foundVideos);
      }
    }

    // Búsqueda de respaldo
    if (!video) {
      const maxBackupAttempts = Math.min(3, availableTopics.length - 1);
      
      for (let i = 0; i < maxBackupAttempts && !video; i++) {
        const backupIndex = (currentTopicIndex + i) % availableTopics.length;
        const backupTopic = availableTopics[backupIndex];
        
        if (attemptedTopics.includes(backupTopic)) {
          continue;
        }
        
        attemptedTopics.push(backupTopic);
        const backupVideos = await searchYouTubeShorts(backupTopic);
        
        if (backupVideos && backupVideos.length > 0) {
          const backupVideosFromNewChannels = backupVideos.filter(v => !sentChannels.includes(v.channelId));
          
          // SOLO usar videos de canales nuevos, NO repetir canales
          if (backupVideosFromNewChannels.length > 0) {
            video = backupVideosFromNewChannels[Math.floor(Math.random() * backupVideosFromNewChannels.length)];
            console.log(`✅ RESPALDO: "${video.title}" - ${video.username}`);
            allFoundVideos.push(video);
            break;
          } else {
            allFoundVideos.push(...backupVideos);
          }
        }
      }
    }

    // ÚLTIMO RECURSO: Solo si absolutamente no hay canales nuevos
    if (!video && allFoundVideos.length > 0) {
      console.log(`🚨 ÚLTIMO RECURSO: No se encontraron videos de canales nuevos en ningún tema`);
      
      // Filtrar videos que ya hemos enviado recientemente
      const notRecentlySentVideos = allFoundVideos.filter(v => !sentVideos.includes(v.id));
      
      // Filtrar videos de canales que ya hemos enviado recientemente
      const notRecentChannelVideos = notRecentlySentVideos.filter(v => !sentChannels.includes(v.channelId));
      
      console.log(`📊 Videos totales encontrados: ${allFoundVideos.length}`);
      console.log(`📊 Sin repetir videos: ${notRecentlySentVideos.length}`);
      console.log(`✅ Canales nuevos en último recurso: ${notRecentChannelVideos.length}`);
      
      // PRIORIDAD: Videos de canales nuevos (por si acaso)
      if (notRecentChannelVideos.length > 0) {
        video = notRecentChannelVideos[Math.floor(Math.random() * notRecentChannelVideos.length)];
        console.log(`✅ ÚLTIMO RECURSO CANAL NUEVO: "${video.title}" - Canal: "${video.username}" (${video.channelId})`);
      } else if (notRecentlySentVideos.length > 0) {
        // Solo si NO hay canales nuevos disponibles
        video = notRecentlySentVideos[Math.floor(Math.random() * notRecentlySentVideos.length)];
        console.log(`⚠️ ÚLTIMO RECURSO CANAL REPETIDO: "${video.title}" - Canal: "${video.username}" (${video.channelId})`);
      } else if (allFoundVideos.length > 0) {
        // Último recurso absoluto
        video = allFoundVideos[Math.floor(Math.random() * allFoundVideos.length)];
        console.log(`⚠️ ÚLTIMO RECURSO: "${video.title}" - ${video.username}`);
      }
    }

    if (!video) {
      console.log('❌ NO SE ENCONTRARON VIDEOS');
      throw new Error('No se encontraron videos disponibles');
    }

    console.log(`Descargando video: ${video.url}`);
    const outputPath = path.join(__dirname, 'downloads', `${video.id}.mp4`);
    await downloadYouTubeShort(video.url, outputPath);
    if (!outputPath || !fs.existsSync(outputPath)) {
      throw new Error('Error al descargar el video');
    }

    const enhancedDescription = await generateEnhancedDescription(video);

    // Enviar el video al grupo usando Baileys
    const targetGroupId = targetGroup.id;
    
    // Leer el archivo de video
    const videoBuffer = fs.readFileSync(outputPath);
    
    await sock.sendMessage(targetGroup.id, {
      video: { url: video.url },
      caption: enhancedDescription
    });
    
    console.log(`✅ VIDEO ENVIADO: "${video.title}" a ${targetGroup.subject}`);
    
    // Actualizar memoria
    sentVideos.push(video.id);
    sentChannels.push(video.channelId);
    
    if (sentVideos.length > MAX_SENT_VIDEOS_MEMORY) {
      sentVideos.shift();
    }
    if (sentChannels.length > MAX_SENT_CHANNELS_MEMORY) {
      sentChannels.shift();
    }
    
    // Enviar evento SSE
    broadcastSSE('video-sent', {
      success: true,
      video: {
        title: video.title,
        channel: video.username,
        url: video.url,
        duration: video.duration,
        views: video.views
      },
      group: targetGroup.subject,
      timestamp: new Date().toISOString()
    });
    
    return {
      success: true,
      message: 'Video enviado exitosamente',
      video: {
        title: video.title,
        channel: video.username,
        url: video.url
      },
      group: targetGroup.subject
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
    console.log('❌ ERROR ENVIANDO VIDEO:', error.message);
    res.status(500).json({ 
      success: false, 
      message: error.message 
    });
  }
});

// Endpoint para cerrar sesión
app.post('/logout', async (req, res) => {
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

// Configurar programación automática si está definida
if (process.env.SCHEDULE) {
  console.log(`⏰ CRON JOB CONFIGURADO: ${process.env.SCHEDULE}`);
  cron.schedule(process.env.SCHEDULE, () => {
    console.log('🔄 CRON JOB EJECUTÁNDOSE...');
    sendYouTubeShort();
  });
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
