// Script para probar YouTube API Key
require('dotenv').config();
const axios = require('axios');

async function testYouTubeAPI() {
  const API_KEY = process.env.YOUTUBE_API_KEY;
  
  console.log('\n🔍 PROBANDO YOUTUBE API KEY...\n');
  console.log(`API Key: ${API_KEY}`);
  console.log(`Longitud: ${API_KEY.length} caracteres\n`);
  
  try {
    console.log('📡 Haciendo request a YouTube Data API v3...\n');
    
    const response = await axios.get('https://www.googleapis.com/youtube/v3/search', {
      params: {
        part: 'snippet',
        q: 'programming',
        type: 'video',
        maxResults: 1,
        key: API_KEY
      }
    });
    
    console.log('✅ ¡API KEY FUNCIONA CORRECTAMENTE!\n');
    console.log(`📊 Videos encontrados: ${response.data.items.length}`);
    if (response.data.items.length > 0) {
      console.log(`📹 Primer video: ${response.data.items[0].snippet.title}\n`);
    }
    
    // Verificar cuota restante
    if (response.headers['x-ratelimit-remaining']) {
      console.log(`⚡ Cuota restante: ${response.headers['x-ratelimit-remaining']}`);
    }
    
    console.log('\n🎉 TU API KEY ESTÁ CONFIGURADA CORRECTAMENTE\n');
    
  } catch (error) {
    console.error('❌ ERROR AL PROBAR API KEY:\n');
    
    if (error.response) {
      console.error(`Código de estado: ${error.response.status}`);
      console.error(`Mensaje: ${error.response.statusText}\n`);
      
      if (error.response.status === 403) {
        console.error('🚨 ERROR 403 - FORBIDDEN\n');
        console.error('Posibles causas:');
        console.error('  1. ❌ API Key inválida o expirada');
        console.error('  2. ❌ YouTube Data API v3 no está habilitada');
        console.error('  3. ❌ API Key tiene restricciones configuradas');
        console.error('  4. ❌ Cuota de API excedida\n');
        
        if (error.response.data && error.response.data.error) {
          console.error('Detalles del error:');
          console.error(JSON.stringify(error.response.data.error, null, 2));
        }
        
        console.error('\n📝 SOLUCIÓN:');
        console.error('  1. Ve a: https://console.cloud.google.com/');
        console.error('  2. Selecciona tu proyecto (o crea uno nuevo)');
        console.error('  3. Ve a: APIs y servicios > Biblioteca');
        console.error('  4. Busca "YouTube Data API v3" y habilítala');
        console.error('  5. Ve a: APIs y servicios > Credenciales');
        console.error('  6. Crea una nueva API Key');
        console.error('  7. En restricciones, selecciona "Ninguna" (para testing)');
        console.error('  8. Copia la nueva API Key al archivo .env\n');
        
      } else if (error.response.status === 400) {
        console.error('🚨 ERROR 400 - BAD REQUEST');
        console.error('La solicitud tiene un formato incorrecto.\n');
      } else if (error.response.status === 429) {
        console.error('🚨 ERROR 429 - QUOTA EXCEEDED');
        console.error('Has excedido la cuota diaria de YouTube API.\n');
      }
      
    } else {
      console.error(`Error de red: ${error.message}\n`);
    }
    
    process.exit(1);
  }
}

// Ejecutar test
testYouTubeAPI();
