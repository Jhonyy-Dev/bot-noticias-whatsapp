require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { startWhatsApp, getTargetGroup } = require('./whatsapp');
const { getRandomTikTokVideo, downloadTikTokVideo, generateVideoDescription } = require('./tiktok-downloader');
const cron = require('node-cron');

// Configuración desde variables de entorno
const TIKTOK_TOPIC = process.env.TIKTOK_TOPIC || null; // Tema específico o null para aleatorio
const SCHEDULE = process.env.SCHEDULE || '0 12 * * *'; // Por defecto a las 12:00 PM todos los días
const TARGET_GROUP_NAME = process.env.TARGET_GROUP_NAME || 'Block'; // Nombre del grupo por defecto

// Crear directorio para descargas si no existe
const downloadsDir = path.join(__dirname, 'downloads');
if (!fs.existsSync(downloadsDir)) {
  fs.mkdirSync(downloadsDir, { recursive: true });
}

// Variable global para la conexión de WhatsApp
let waSocket = null;

/**
 * Función principal para enviar un video de TikTok al grupo
 */
async function sendTikTokVideo() {
  try {
    console.log('Iniciando proceso de envío de video de TikTok...');
    
    // Verificar que haya una conexión activa a WhatsApp
    if (!global.waSocket) {
      console.error('No hay conexión activa a WhatsApp');
      return false;
    }
    
    waSocket = global.waSocket;
    
    // Obtener el grupo objetivo
    const targetGroup = getTargetGroup();
    if (!targetGroup) {
      console.error(`Grupo objetivo '${TARGET_GROUP_NAME}' no encontrado`);
      return false;
    }
    
    console.log(`Grupo objetivo encontrado: ${targetGroup}`);
    
    // Buscar y obtener un video aleatorio de TikTok sobre el tema especificado
    console.log(`Buscando video de TikTok${TIKTOK_TOPIC ? ' sobre ' + TIKTOK_TOPIC : ''}...`);
    const video = await getRandomTikTokVideo(TIKTOK_TOPIC);
    
    if (!video) {
      console.error('No se encontraron videos de TikTok');
      return false;
    }
    
    console.log(`Video encontrado: ${video.description} por ${video.username}`);
    
    // Nombre del archivo de salida
    const outputFilename = `${video.id}.mp4`;
    const outputPath = path.join(downloadsDir, outputFilename);
    
    // Descargar el video
    console.log(`Iniciando descarga del video: ${video.url}`);
    try {
      await downloadTikTokVideo(video.url, outputPath);
    } catch (downloadError) {
      console.error('Error al descargar el video:', downloadError.message);
      
      // Si falla la descarga, intentar enviar solo el mensaje con el enlace
      try {
        const message = `*Video de TikTok sobre ${TIKTOK_TOPIC || 'tecnología'}*\n\n` +
                       `Usuario: ${video.username}\n` +
                       `Descripción: ${video.description}\n\n` +
                       `Ver video: ${video.url}\n\n` +
                       `Compartido automáticamente.`;
        
        await waSocket.sendMessage(targetGroup, { text: message });
        console.log('Mensaje de texto enviado como alternativa');
        return true;
      } catch (textError) {
        console.error('Error al enviar mensaje de texto:', textError.message);
        return false;
      }
    }
    
    // Verificar si el archivo existe
    if (!fs.existsSync(outputPath)) {
      console.error('El archivo de video no se encontró después de la descarga');
      return false;
    }
    
    // Generar descripción
    const description = generateVideoDescription({
      ...video,
      topic: TIKTOK_TOPIC
    });
    
    // Enviar el video al grupo
    console.log(`Enviando video al grupo ${targetGroup}`);
    
    try {
      // Leer el archivo
      const videoBuffer = fs.readFileSync(outputPath);
      
      // Enviar el video al grupo
      await waSocket.sendMessage(targetGroup, { 
        video: videoBuffer,
        caption: description,
        gifPlayback: false
      });
      
      console.log('Video enviado correctamente');
      
      // Eliminar el archivo después de enviarlo
      fs.unlinkSync(outputPath);
      
      return true;
    } catch (sendError) {
      console.error('Error al enviar el video:', sendError.message);
      
      // Si falla el envío del video, intentar enviar solo el mensaje con el enlace
      try {
        const message = `*Video de TikTok sobre ${TIKTOK_TOPIC || 'tecnología'}*\n\n` +
                       `Usuario: ${video.username}\n` +
                       `Descripción: ${video.description}\n\n` +
                       `Ver video: ${video.url}\n\n` +
                       `Compartido automáticamente.`;
        
        await waSocket.sendMessage(targetGroup, { text: message });
        console.log('Mensaje de texto enviado como alternativa');
        
        // Intentar eliminar el archivo si existe
        if (fs.existsSync(outputPath)) {
          try {
            fs.unlinkSync(outputPath);
          } catch (unlinkError) {
            console.error('Error al eliminar archivo:', unlinkError.message);
          }
        }
        
        return true;
      } catch (textError) {
        console.error('Error al enviar mensaje de texto:', textError.message);
        return false;
      }
    }
  } catch (error) {
    console.error('Error en el proceso de envío de video:', error.message);
    return false;
  }
}

// Función para iniciar el bot
async function startBot() {
  try {
    console.log('Iniciando bot de TikTok para WhatsApp...');
    
    // Iniciar conexión a WhatsApp
    await startWhatsApp();
    
    // Esperar a que se establezca la conexión (10 segundos)
    console.log('Esperando a que se establezca la conexión a WhatsApp...');
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Programar el envío automático de videos
    console.log(`Programando envío automático con la siguiente frecuencia: ${SCHEDULE}`);
    cron.schedule(SCHEDULE, async () => {
      console.log('Ejecutando envío programado de video de TikTok...');
      await sendTikTokVideo();
    });
    
    console.log('Bot iniciado correctamente');
    console.log(`Para enviar un video manualmente, ejecuta: node index.js send`);
    
    // Si se especifica el argumento "send", enviar un video inmediatamente
    if (process.argv.includes('send')) {
      console.log('Enviando video inmediatamente...');
      await sendTikTokVideo();
    }
  } catch (error) {
    console.error('Error al iniciar el bot:', error.message);
  }
}

// Si este script se ejecuta directamente, iniciar el bot
if (require.main === module) {
  startBot();
}

// Exportar funciones para uso en otros archivos
module.exports = {
  sendTikTokVideo
};
