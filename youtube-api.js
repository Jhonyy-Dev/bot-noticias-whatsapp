// Módulo para buscar y descargar YouTube Shorts - ORDEN: YouTube Data API v3 → ytdl-core
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const ytdl = require('@distube/ytdl-core');

require('dotenv').config();

// Configurar el directorio de descargas
const DOWNLOADS_DIR = path.join(__dirname, 'downloads');
if (!fs.existsSync(DOWNLOADS_DIR)) {
  fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

// Función principal para buscar YouTube Shorts usando YouTube Data API v3
async function searchYouTubeShorts(topic, maxResults = 5) {
  console.log(`🔍 BÚSQUEDA PRINCIPAL: ${topic}`);
  console.log(`Buscando YouTube Shorts sobre: ${topic}`);
  
  const API_KEY = process.env.YOUTUBE_API_KEY;

  if (!API_KEY) {
    console.error('No se encontró la API key de YouTube. Configura YOUTUBE_API_KEY en .env');
    return [];
  }

  try {
    // 1. BUSCAR con YouTube Data API v3
    console.log(`Consultando YouTube API para: ${topic}`);
    // Probar múltiples variaciones de búsqueda
    const searchQueries = [
      `${topic} español`,
      `${topic} spanish`,
      `${topic}`,
      `${topic.replace(/noticia /g, '')} español`,
      `${topic.replace(/tips de /g, '')} tutorial español`
    ];
    
    let allVideos = [];
    
    for (const query of searchQueries) {
      try {
        console.log(`🔍 Probando búsqueda: "${query}"`);
        const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
          params: {
            part: 'snippet',
            q: query,
            type: 'video',
            videoDuration: 'short',
            maxResults: Math.min(maxResults * 2, 20),
            order: 'date',
            regionCode: 'ES',
            relevanceLanguage: 'es',
            safeSearch: 'moderate',
            key: API_KEY
          }
        });
        
        if (response.data.items && response.data.items.length > 0) {
          console.log(`✅ Encontrados ${response.data.items.length} videos con: "${query}"`);
          allVideos.push(...response.data.items);
          if (allVideos.length >= maxResults) break;
        }
      } catch (queryError) {
        console.log(`⚠️ Error con búsqueda "${query}": ${queryError.message}`);
        continue;
      }
    }

    if (!allVideos || allVideos.length === 0) {
      console.log(`❌ No se encontraron videos para ninguna variación de: ${topic}`);
      return [];
    }
    
    // Eliminar duplicados por videoId
    const uniqueVideos = allVideos.filter((video, index, self) => 
      index === self.findIndex(v => v.id.videoId === video.id.videoId)
    );
    
    console.log(`📹 Videos únicos encontrados: ${uniqueVideos.length}`);

    // 2. PROCESAR resultados de la API - FILTRO ESTRICTO DE 30 DÍAS
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const videos = uniqueVideos
      .map(item => ({
        id: item.id.videoId,
        title: item.snippet.title,
        description: item.snippet.description,
        url: `https://www.youtube.com/watch?v=${item.id.videoId}`,
        channelTitle: item.snippet.channelTitle,
        channelId: item.snippet.channelId,
        publishedAt: new Date(item.snippet.publishedAt),
        topic: topic
      }))
      .filter(video => {
        // FILTRO RECIENTE: Solo videos de los últimos 30 días (más actuales)
        const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        if (video.publishedAt < thirtyDaysAgo) {
          console.log(`Video omitido por ser muy antiguo: ${video.title}`);
          return false;
        }
        
        // FILTRO MÍNIMO: Solo rechazar idiomas claramente no latinos
        const fullText = (video.title + ' ' + video.description + ' ' + video.channelTitle).toLowerCase();
        const hasAsianChars = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(fullText);
        
        if (hasAsianChars) {
          console.log(`🚫 Video omitido por caracteres asiáticos: "${video.title}"`);
          return false;
        }
        
        return true;
      })
      // ORDENAR por fecha: más recientes primero
      .sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

    console.log(`Encontrados ${videos.length} videos en español para el tema: ${topic}`);
    
    videos.forEach((video, index) => {
      console.log(`Video ${index + 1}: ${video.title} - Canal: ${video.channelTitle}`);
    });

    return videos;

  } catch (error) {
    console.error(`Error buscando videos para "${topic}":`, error.message);
    if (error.response) {
      console.error('Detalles del error:', error.response.data);
    }
    return [];
  }
}

// Función para descargar un YouTube Short usando @distube/ytdl-core
async function downloadYouTubeShort(videoUrl, outputPath) {
  console.log(`Descargando YouTube Short: ${videoUrl}`);
  
  try {
    // Crear agente ytdl con configuración actualizada
    const agent = ytdl.createAgent([
      {
        "name": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      }
    ]);
    
    const info = await ytdl.getInfo(videoUrl, { agent });
    
    const format = ytdl.chooseFormat(info.formats, { 
      quality: 'highest',
      filter: 'audioandvideo'
    });
    
    if (!format) {
      throw new Error('No se encontró un formato adecuado');
    }
    
    return new Promise((resolve, reject) => {
      const stream = ytdl(videoUrl, { 
        format: format,
        agent: agent
      });
      const writeStream = fs.createWriteStream(outputPath);
      
      stream.pipe(writeStream);
      
      stream.on('error', (error) => {
        console.error('Error en el stream de descarga:', error);
        reject(error);
      });
      
      writeStream.on('finish', () => {
        console.log('✅ Descarga completada:', outputPath);
        resolve(outputPath);
      });
      
      writeStream.on('error', (error) => {
        console.error('Error escribiendo archivo:', error);
        reject(error);
      });
    });
    
  } catch (error) {
    console.error('Error con @distube/ytdl-core:', error.message);
    throw new Error('Error al descargar el video');
  }
}

module.exports = {
  searchYouTubeShorts,
  downloadYouTubeShort
};
