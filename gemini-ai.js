// Módulo para integración con Gemini AI usando fetch nativo
require('dotenv').config();
// No se requieren bibliotecas adicionales

/**
 * Genera una descripción mejorada para un video de TikTok usando Gemini AI
 * @param {Object} videoInfo - Información del video de TikTok
 * @returns {Promise<string>} - Descripción generada por IA
 */
async function generateEnhancedDescription(videoInfo) {
  try {
    // Verificar si hay una API key configurada
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBizcJ95cfJFN6n3VS8ktttE_KvF4zIqiQ';
    
    if (!apiKey) {
      console.log('No se encontró la API key de Gemini. Usando descripción predeterminada.');
      return null;
    }
    
    // Preparar el prompt para la IA
    const prompt = `
    Analiza esta información de un video de TikTok y genera una descripción MUY BREVE en español (máximo 1-2 oraciones) que explique de qué trata el video.
    
    Tema del video: ${videoInfo.topic || 'tecnología'}
    Usuario de TikTok: ${videoInfo.username || 'Desconocido'}
    Descripción original: ${videoInfo.description || 'Sin descripción disponible'}
    URL: ${videoInfo.url || 'No disponible'}
    
    La descripción debe ser extremadamente concisa, directa y en español. Debe explicar solo lo esencial del video sin detalles innecesarios.
    `;
    
    // URL de la API de Gemini
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Datos para la solicitud
    const requestData = {
      contents: [
        { 
          parts: [
            { text: prompt }
          ] 
        }
      ]
    };
    
    // Realizar la solicitud a la API usando fetch nativo
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    // Procesar la respuesta
    const data = await response.json();
    
    // Extraer el texto generado
    if (data && 
        data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0]) {
      
      const generatedText = data.candidates[0].content.parts[0].text;
      console.log('Descripción generada por Gemini AI:', generatedText);
      return generatedText;
    } else {
      console.log('Formato de respuesta inesperado de Gemini AI');
      return null;
    }
  } catch (error) {
    console.error('Error al generar descripción con Gemini AI:', error.message);
    return null;
  }
}

/**
 * Analiza el contenido de un video y genera un resumen
 * @param {string} videoDescription - Descripción original del video
 * @param {string} topic - Tema del video
 * @returns {Promise<string>} - Resumen generado por IA
 */
async function analyzeVideoContent(videoDescription, topic = 'tecnología') {
  try {
    // Verificar si hay una API key configurada
    const apiKey = process.env.GEMINI_API_KEY || 'AIzaSyBizcJ95cfJFN6n3VS8ktttE_KvF4zIqiQ';
    
    if (!apiKey) {
      console.log('No se encontró la API key de Gemini. Usando descripción predeterminada.');
      return null;
    }
    
    // Preparar el prompt para la IA
    const prompt = `
    Analiza esta descripción de un video de TikTok sobre ${topic} y genera un resumen MUY BREVE en español (máximo 1-2 oraciones) que explique de qué trata el video.
    
    Descripción original: ${videoDescription || 'Sin descripción disponible'}
    
    El resumen debe ser extremadamente conciso, directo y en español. Debe explicar solo lo esencial del video sin detalles innecesarios.
    `;
    
    // URL de la API de Gemini
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    
    // Datos para la solicitud
    const requestData = {
      contents: [
        { 
          parts: [
            { text: prompt }
          ] 
        }
      ]
    };
    
    // Realizar la solicitud a la API usando fetch nativo
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestData)
    });
    
    // Procesar la respuesta
    const data = await response.json();
    
    // Extraer el texto generado
    if (data && 
        data.candidates && 
        data.candidates[0] && 
        data.candidates[0].content && 
        data.candidates[0].content.parts && 
        data.candidates[0].content.parts[0]) {
      
      const generatedText = data.candidates[0].content.parts[0].text;
      console.log('Análisis generado por Gemini AI:', generatedText);
      return generatedText;
    } else {
      console.log('Formato de respuesta inesperado de Gemini AI');
      return null;
    }
  } catch (error) {
    console.error('Error al analizar contenido con Gemini AI:', error.message);
    return null;
  }
}

/**
 * Mejora la descripción de un video de YouTube usando Gemini AI con @google/genai
 * @param {string} title - Título del video
 * @param {string} description - Descripción original del video
 * @param {string} topic - Tema del video
 * @returns {Promise<string>} - Descripción mejorada
 */
async function enhanceDescription(title, description, topic) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      console.log('No se encontró la API key de Gemini. Usando descripción predeterminada.');
      return `🎬 *${title}*\n\n📺 Video sobre ${topic}`;
    }

    // Importar GoogleGenAI dinámicamente
    const { GoogleGenAI } = require('@google/genai');
    
    const ai = new GoogleGenAI({
      apiKey: apiKey,
    });

    const config = {};
    const model = 'gemini-2.0-flash-thinking-exp';
    
    const prompt = `Genera un resumen MUY BREVE en español (máximo 2 oraciones) para este video de YouTube:

Título: ${title}
Tema: ${topic}
Descripción: ${description || 'Sin descripción'}

El resumen debe explicar de qué trata el video de forma concisa y directa.`;

    const contents = [
      {
        role: 'user',
        parts: [
          {
            text: prompt,
          },
        ],
      },
    ];

    const response = await ai.models.generateContentStream({
      model,
      config,
      contents,
    });

    let generatedText = '';
    for await (const chunk of response) {
      if (chunk.text) {
        generatedText += chunk.text;
      }
    }

    if (generatedText.trim()) {
      console.log('✅ Descripción generada por Gemini AI (nuevo modelo)');
      return `🎬 *${title}*\n\n${generatedText.trim()}`;
    } else {
      throw new Error('No se generó contenido');
    }

  } catch (error) {
    // Silenciar errores de Gemini AI para reducir ruido en logs
    // Solo mostrar error si es crítico
    if (error.message.includes('API_KEY') || error.message.includes('quota')) {
      console.log('⚠️ Gemini AI no disponible, usando descripción automática');
    }
    
    // ÚLTIMO RECURSO: Generar descripción inteligente sin IA
    const smartDescription = generateSmartDescription(title, description, topic);
    return `🎬 *${title}*\n\n${smartDescription}`;
  }
}

/**
 * Genera una descripción inteligente sin IA basada en el título y tema
 */
function generateSmartDescription(title, description, topic) {
  const cleanTitle = title.replace(/#\w+/g, '').replace(/[🎬📺🚀👉😱🤯⏰☀️🌙]/g, '').trim();
  
  // Palabras clave por tema
  const topicKeywords = {
    'tips de programación': 'Este video comparte consejos útiles sobre programación y desarrollo de código.',
    'desarrollo de software': 'El video explica conceptos importantes del desarrollo de software y mejores prácticas.',
    'desarrollo web': 'Se presenta información sobre desarrollo web, tecnologías frontend y backend.',
    'noticia ciberseguridad': 'Noticia relevante sobre ciberseguridad y protección digital.',
    'noticia inteligencia artificial': 'Última noticia sobre avances en inteligencia artificial y tecnología.',
    'tecnología china 2025': 'Información sobre innovaciones tecnológicas y gadgets chinos.',
    'noticia IA': 'Actualización importante sobre inteligencia artificial y sus aplicaciones.',
    'hacking con IA': 'Contenido sobre técnicas de hacking asistidas por inteligencia artificial.'
  };
  
  const baseDescription = topicKeywords[topic] || `Video informativo sobre ${topic}.`;
  
  // Si el título contiene información específica, la incluye
  if (cleanTitle.includes('?')) {
    return `${baseDescription} Responde la pregunta: ${cleanTitle}`;
  } else if (cleanTitle.length > 10) {
    return `${baseDescription} Tema específico: ${cleanTitle}`;
  }
  
  return baseDescription;
}

module.exports = {
  generateEnhancedDescription,
  analyzeVideoContent,
  enhanceDescription
};
