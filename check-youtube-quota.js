// Script para verificar el uso estimado de cuota de YouTube API

require('dotenv').config();

console.log('📊 CALCULADORA DE CUOTA DE YOUTUBE API\n');

// Configuración del bot
const TEMAS = 4; // tips de programación, desarrollo de software, desarrollo web, noticia ciberseguridad
const BUSQUEDAS_POR_TEMA = 5; // 5 búsquedas variadas para mejor cobertura
const UNIDADES_POR_BUSQUEDA = 100; // Costo de YouTube API v3 search
const REINTENTOS_EN_ERROR = 3; // Máximo de reintentos si falla

// Cuota diaria de YouTube API
const CUOTA_DIARIA = 10000;

// Cálculo por envío exitoso
const unidadesPorEnvioExitoso = BUSQUEDAS_POR_TEMA * UNIDADES_POR_BUSQUEDA;
console.log(`✅ ENVÍO EXITOSO:`);
console.log(`   - Búsquedas por tema: ${BUSQUEDAS_POR_TEMA}`);
console.log(`   - Unidades por búsqueda: ${UNIDADES_POR_BUSQUEDA}`);
console.log(`   - Total: ${unidadesPorEnvioExitoso} unidades\n`);

// Cálculo si hay errores (peor escenario)
const unidadesPorEnvioConErrores = REINTENTOS_EN_ERROR * unidadesPorEnvioExitoso;
console.log(`❌ ENVÍO CON ERRORES (peor caso):`);
console.log(`   - Reintentos: ${REINTENTOS_EN_ERROR}`);
console.log(`   - Total: ${unidadesPorEnvioConErrores} unidades\n`);

// Envíos posibles por día
const enviosPosiblesPorDia = Math.floor(CUOTA_DIARIA / unidadesPorEnvioExitoso);
const enviosConErroresPorDia = Math.floor(CUOTA_DIARIA / unidadesPorEnvioConErrores);

console.log(`📈 CAPACIDAD DIARIA (cuota: ${CUOTA_DIARIA} unidades):`);
console.log(`   - Envíos exitosos posibles: ${enviosPosiblesPorDia} videos/día`);
console.log(`   - Con errores (peor caso): ${enviosConErroresPorDia} intentos/día\n`);

// Recomendación para intervalo de 12 horas
const enviosCada12Horas = 2; // 2 envíos por día
const unidadesNecesariasPorDia = enviosCada12Horas * unidadesPorEnvioExitoso;

console.log(`⏰ CONFIGURACIÓN ACTUAL (cada 12 horas = 2 envíos/día):`);
console.log(`   - Unidades necesarias: ${unidadesNecesariasPorDia}/día`);
console.log(`   - Margen de cuota restante: ${CUOTA_DIARIA - unidadesNecesariasPorDia} unidades`);
console.log(`   - ✅ Suficiente cuota: ${unidadesNecesariasPorDia < CUOTA_DIARIA ? 'SÍ' : 'NO'}\n`);

console.log(`💡 RECOMENDACIONES:`);
console.log(`   1. Asegúrate que las variables de entorno estén configuradas en Railway`);
console.log(`   2. El intervalo de 12 horas GARANTIZA no agotar la cuota (solo 10% de uso)`);
console.log(`   3. Monitorea los logs para detectar ERRORES que causen reintentos excesivos`);
console.log(`   4. Con 5 búsquedas variadas obtienes mejor diversidad de videos\n`);

console.log(`🔗 Solicitar aumento de cuota:`);
console.log(`   https://console.cloud.google.com/apis/api/youtube.googleapis.com/quotas\n`);
