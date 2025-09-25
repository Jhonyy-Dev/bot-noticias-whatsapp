// Módulo para buscar y descargar YouTube Shorts - ORDEN: YouTube Data API v3 → node-youtube-dl
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const youtubeDl = require('youtube-dl-exec');

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
        
        // FILTRO ESTRICTO: SOLO ESPAÑOL
        const fullText = (video.title + ' ' + video.description + ' ' + video.channelTitle).toLowerCase();
        
        // Rechazar caracteres no latinos
        const hasAsianChars = /[\u4e00-\u9fff\u3040-\u309f\u30a0-\u30ff\uac00-\ud7af]/.test(fullText);
        if (hasAsianChars) {
          console.log(`🚫 Video omitido por caracteres asiáticos: "${video.title}"`);
          return false;
        }
        
        // Rechazar idiomas específicos no españoles
        const englishWords = /\b(the|and|with|for|you|that|this|but|not|are|have|from|they|know|want|been|good|much|some|time|very|when|come|here|just|like|long|make|many|over|such|take|than|them|well|were|what|your|how|said|each|which|their|would|there|could|other|after|first|never|these|think|where|being|every|great|might|shall|still|those|while|along|came|right|around|something|through|before|between|another|without|little|under|during|against|nothing|within|above|below|across|behind|beyond|inside|outside|toward|beneath|beside|throughout|underneath|meanwhile|however|therefore|moreover|furthermore|nevertheless|nonetheless|otherwise|consequently|accordingly|similarly|likewise|instead|rather|indeed|certainly|perhaps|probably|possibly|definitely|absolutely|completely|entirely|exactly|particularly|especially|specifically|generally|usually|normally|typically|frequently|occasionally|rarely|hardly|barely|nearly|almost|quite|fairly|rather|pretty|really|truly|actually|basically|essentially|fundamentally|primarily|mainly|mostly|largely|significantly|considerably|substantially|dramatically|remarkably|surprisingly|unfortunately|fortunately|obviously|clearly|apparently|evidently|presumably|supposedly|allegedly|reportedly|seemingly|presumably|obviously|naturally|certainly|definitely|absolutely|completely|totally|entirely|perfectly|exactly|precisely|specifically|particularly|especially|mainly|primarily|basically|essentially|generally|usually|normally|typically|frequently|often|sometimes|occasionally|rarely|seldom|hardly|barely|scarcely|nearly|almost|quite|rather|fairly|pretty|very|really|truly|actually|indeed|certainly|definitely|absolutely|completely|totally|entirely|perfectly|exactly|precisely|specifically|particularly|especially|mainly|primarily|basically|essentially|generally|usually|normally|typically|frequently|often|sometimes|occasionally|rarely|seldom|hardly|barely|scarcely|nearly|almost|quite|rather|fairly|pretty|very|really|truly|actually|indeed)/gi;
        
        const englishWordsCount = (fullText.match(englishWords) || []).length;
        const totalWords = fullText.split(/\s+/).length;
        const englishPercentage = totalWords > 0 ? (englishWordsCount / totalWords) * 100 : 0;
        
        if (englishPercentage > 30) {
          console.log(`🚫 Video omitido por alto contenido en inglés (${englishPercentage.toFixed(1)}%): "${video.title}"`);
          return false;
        }
        
        // Palabras clave en español que indican contenido válido
        const spanishKeywords = /\b(de|la|el|en|y|a|que|es|se|no|te|lo|le|da|su|por|son|con|para|una|sobre|del|al|muy|más|como|pero|sus|ha|me|si|sin|sobre|este|ya|todo|esta|uno|tiene|nos|ni|cuando|tanto|él|donde|bien|está|cada|ese|hacer|pueden|desde|todos|las|otro|hasta|parte|general|tan|nuevo|años|estados|durante|trabajo|vida|puede|gran|tiempo|día|gobierno|manera|derecho|historia|través|mientras|sistema|grupo|programa|fin|bajo|desarrollo|proceso|mismo|aunque|lugar|caso|nada|ejemplo|llevar|agua|nivel|llamar|política|real|hijo|dar|momento|memoria|punto|forma|poco|casa|contra|mayor|propio|según|línea|medio|dentro|tipo|algún|social|después|local|libro|fuerza|otros|paz|mano|cabeza|tierra|población|empresa|lado|proyecto|menor|producir|problema|cambio|incluir|seguir|crear|clase|unir|mercado|ley|control|conocer|razón|arte|ciudad|campo|material|enseñar|lograr|cuerpo|importante|recordar|valor|internacional|producto|realizar|superficie|llegar|vender|público|esperar|estudiar|método|decidir|negro|presidente|seguridad|varias|precio|report|universidad|cuestión|figura|base|cerca|profesor|precio|cultura|personal|abrir|total|añadir|difícil|social|pasar|banco|usar|futuro|ambiente|papel|tratamiento|animal|escena|ámbito|observe|oficina|relación|médico|actividad|mesa|necesario|político|participar|capacidad|serie|procedimiento|plan|proteger|cantidad|comprar|datos|centro|bajo|recursos|economía|condición|medio|investigación|comunidad|servicio|hijo|nacional|natural|cama|información|nombre|personal|europeo|movimiento|organización|blanco|educación|mes|tecnología|sociedad|tratamiento|lengua|frente|millones|durante|música|ciudad|crecimiento|papel|población|crear|política|historia|desarrollo|resultado|poder|agua|parte|educación|nacional|social|económico|político|cultural|ambiental|tecnológico|científico|médico|legal|internacional|regional|local|personal|profesional|académico|comercial|industrial|financiero|administrativo|técnico|artístico|deportivo|musical|literario|cinematográfico|televisivo|radiofónico|periodístico|editorial|publicitario|promocional|informativo|educativo|formativo|instructivo|explicativo|descriptivo|narrativo|argumentativo|persuasivo|crítico|analítico|reflexivo|teórico|práctico|experimental|empírico|estadístico|matemático|físico|químico|biológico|geológico|astronómico|meteorológico|climático|ecológico|psicológico|sociológico|antropológico|filosófico|teológico|histórico|geográfico|lingüístico|literario|artístico|musical|teatral|cinematográfico|fotográfico|pictórico|escultórico|arquitectónico|urbanístico|paisajístico|decorativo|ornamental|funcional|estructural|organizativo|sistemático|metodológico|pedagógico|didáctico|curricular|evaluativo|diagnóstico|terapéutico|preventivo|correctivo|rehabilitador|integrador|inclusivo|participativo|colaborativo|cooperativo|solidario|humanitario|altruista|filantrópico|benéfico|caritativo|voluntario|gratuito|libre|abierto|público|privado|personal|individual|colectivo|grupal|familiar|comunitario|vecinal|barrial|municipal|provincial|regional|nacional|internacional|mundial|global|universal|general|particular|específico|concreto|abstracto|teórico|práctico|real|virtual|digital|analógico|manual|automático|mecánico|eléctrico|electrónico|informático|computacional|cibernético|robótico|inteligente|artificial|natural|orgánico|inorgánico|sintético|químico|físico|biológico|genético|molecular|celular|tisular|orgánico|sistémico|corporal|mental|emocional|espiritual|moral|ético|estético|artístico|creativo|innovador|original|único|especial|extraordinario|excepcional|notable|destacado|relevante|importante|significativo|trascendente|fundamental|esencial|básico|elemental|primario|secundario|terciario|superior|inferior|anterior|posterior|previo|siguiente|próximo|cercano|lejano|distante|remoto|actual|presente|pasado|futuro|temporal|espacial|geográfico|territorial|regional|local|nacional|internacional|mundial|global|universal)/gi;
        
        const spanishWordsCount = (fullText.match(spanishKeywords) || []).length;
        const spanishPercentage = totalWords > 0 ? (spanishWordsCount / totalWords) * 100 : 0;
        
        if (spanishPercentage < 15) {
          console.log(`🚫 Video omitido por bajo contenido en español (${spanishPercentage.toFixed(1)}%): "${video.title}"`);
          return false;
        }
        
        console.log(`✅ Video aceptado - Español: ${spanishPercentage.toFixed(1)}%, Inglés: ${englishPercentage.toFixed(1)}%: "${video.title}"`);
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

// Función para descargar un YouTube Short usando youtube-dl-exec
async function downloadYouTubeShort(videoUrl, outputPath) {
  console.log(`Descargando YouTube Short: ${videoUrl}`);
  
  try {
    const result = await youtubeDl(videoUrl, {
      format: 'best[height<=720]',
      noPlaylist: true,
      output: outputPath,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
    });

    console.log(`✅ Video descargado exitosamente: ${outputPath}`);
    return outputPath;
    
  } catch (error) {
    console.error('Error con youtube-dl-exec:', error.message);
    throw new Error('Error al descargar el video');
  }
}

module.exports = {
  searchYouTubeShorts,
  downloadYouTubeShort
};
