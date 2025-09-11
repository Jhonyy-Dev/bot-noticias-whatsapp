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
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: `"${topic}" shorts español spanish`,
        type: 'video',
        videoDuration: 'short',
        maxResults: maxResults,
        order: 'date',
        regionCode: 'ES',
        relevanceLanguage: 'es',
        safeSearch: 'moderate',
        key: API_KEY
      }
    });

    if (!response.data.items || response.data.items.length === 0) {
      console.log(`No se encontraron videos para: ${topic}`);
      return [];
    }

    // 2. PROCESAR resultados de la API - FILTRO ESTRICTO DE 30 DÍAS
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));

    const videos = response.data.items
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
        // FILTRO ESTRICTO: Solo videos de los últimos 30 días
        if (video.publishedAt < thirtyDaysAgo) {
          console.log(`Video omitido por ser antiguo: ${video.title} (${video.publishedAt.toDateString()})`);
          return false;
        }
        
        // FILTRO DE IDIOMA MUY ESTRICTO: Solo videos en español
        const title = video.title;
        const description = video.description || '';
        const channelTitle = video.channelTitle || '';
        const fullText = (title + ' ' + description + ' ' + channelTitle).toLowerCase();
        
        // Detectar idiomas no españoles por caracteres específicos
        const hasChineseChars = /[\u4e00-\u9fff]/.test(fullText);
        const hasHindiChars = /[\u0900-\u097f]/.test(fullText);
        const hasArabicChars = /[\u0600-\u06ff]/.test(fullText);
        const hasRussianChars = /[\u0400-\u04ff]/.test(fullText);
        const hasJapaneseChars = /[\u3040-\u309f\u30a0-\u30ff]/.test(fullText);
        const hasKoreanChars = /[\uac00-\ud7af]/.test(fullText);
        
        // Detectar palabras en inglés comunes
        const englishWords = ['the', 'and', 'for', 'you', 'with', 'this', 'that', 'have', 'from', 'they', 'know', 'want', 'been', 'good', 'much', 'some', 'time', 'very', 'when', 'come', 'here', 'just', 'like', 'long', 'make', 'many', 'over', 'such', 'take', 'than', 'them', 'well', 'were', 'will', 'would', 'there', 'could', 'other', 'after', 'first', 'never', 'these', 'think', 'where', 'being', 'every', 'great', 'might', 'shall', 'still', 'those', 'under', 'while', 'should', 'programming', 'coding', 'tutorial', 'learn', 'beginner', 'advanced', 'course', 'lesson', 'guide', 'tips', 'tricks', 'how to', 'step by step', 'easy', 'simple', 'complete', 'full', 'best', 'top', 'amazing', 'awesome', 'perfect', 'ultimate', 'master', 'expert'];
        
        const hasEnglishWords = englishWords.some(word => {
          const regex = new RegExp(`\\b${word}\\b`, 'i');
          return regex.test(fullText);
        });
        
        if (hasChineseChars || hasHindiChars || hasArabicChars || hasRussianChars || hasJapaneseChars || hasKoreanChars || hasEnglishWords) {
          console.log(`🚫 Video omitido por no estar en español: "${video.title}"`);
          console.log(`   Canal: ${video.channelTitle}`);
          console.log(`   Razón: caracteres extranjeros=${hasChineseChars || hasHindiChars || hasArabicChars || hasRussianChars || hasJapaneseChars || hasKoreanChars}, palabras inglés=${hasEnglishWords}`);
          return false;
        }
        
        // Filtro adicional: debe contener palabras en español
        const spanishWords = ['de', 'la', 'el', 'en', 'y', 'a', 'que', 'es', 'se', 'no', 'te', 'lo', 'le', 'da', 'su', 'por', 'son', 'con', 'para', 'una', 'del', 'las', 'los', 'como', 'pero', 'sus', 'fue', 'ser', 'han', 'más', 'qué', 'muy', 'sin', 'vez', 'dos', 'año', 'años', 'día', 'días', 'vida', 'casa', 'mundo', 'país', 'tiempo', 'trabajo', 'parte', 'lugar', 'forma', 'caso', 'mano', 'momento', 'manera', 'sistema', 'agua', 'punto', 'realidad', 'razón', 'estado', 'ciudad', 'ejemplo', 'grupo', 'problema', 'hecho', 'mujer', 'hombre', 'proyecto', 'programa', 'proceso', 'servicio', 'mercado', 'precio', 'producto', 'empresa', 'gobierno', 'desarrollo', 'educación', 'información', 'tecnología', 'programación', 'desarrollo', 'código', 'tutorial', 'aprender', 'curso', 'lección', 'guía', 'consejos', 'trucos', 'cómo', 'paso', 'fácil', 'simple', 'completo', 'mejor', 'increíble', 'perfecto', 'maestro', 'experto'];
        
        const hasSpanishWords = spanishWords.some(word => {
          const regex = new RegExp(`\\b${word}\\b`, 'i');
          return regex.test(fullText);
        });
        
        if (!hasSpanishWords) {
          console.log(`🚫 Video omitido por no contener palabras en español: "${video.title}"`);
          return false;
        }
        
        // FILTRO DE TEMA: Rechazar videos financieros/bancarios no relacionados
        const titleLower = title.toLowerCase();
        const financialKeywords = ['banco', 'digital', 'financiero', 'ecosistema financiero', 'fintech', 'inversión', 'trading', 'crypto', 'bitcoin'];
        const hasFinancialContent = financialKeywords.some(keyword => titleLower.includes(keyword));
        
        // Solo permitir contenido financiero si el tema específicamente lo incluye
        if (hasFinancialContent && !topic.toLowerCase().includes('financiero') && !topic.toLowerCase().includes('banco')) {
          console.log(`🚫 Video omitido por contenido financiero no solicitado: "${video.title}"`);
          return false;
        }
        
        return true;
      })
      // ALEATORIZAR orden para evitar repetición
      .sort(() => Math.random() - 0.5);

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
